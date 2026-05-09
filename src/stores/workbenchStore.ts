import { create } from 'zustand';
import { mockAgentSteps } from '../mocks/agentSteps';
import { mockSessions } from '../mocks/sessions';
import { mockTasks } from '../mocks/tasks';
import type {
  AgentStep,
  AgentStepStatus,
  AssistantStreamState,
  ConfirmStatus,
  FinalMessage,
  GenerationStatus,
  ModelProviderConfig,
  ModelProviderConfigMap,
  ModelProviderId,
  ModelProviderTestStatusMap,
  ModelTestStatus,
  ModelProvider,
  WorkbenchMessage,
  WorkbenchSession,
} from '../types/workbench';
import { streamGroqChat } from '../services/chatApi';
import { streamText } from '../utils/streamText';

const DEFAULT_TASK_ID = 't_month_analytics';
const DEFAULT_ASSISTANT_REPLY =
  '我将先检索相关指标口径与教学质量分析规则，再查询本月各年级成绩与出勤数据，随后给出异常项和简短分析结论。';
const FINAL_REPORT_SUMMARY =
  '已基于当前数据生成简短分析结论：本月教学质量整体保持稳定，但七年级平均分和八年级出勤率出现明显波动，建议优先查看七年级周测成绩明细和八年级班级出勤记录，并将两个指标加入后续跟踪。';
const MODEL_CONFIG_SESSION_KEY = 'ai-agent-workbench-model-configs';
const MODEL_PROVIDER_SESSION_KEY = 'ai-agent-workbench-current-model-provider';
const WORKBENCH_SESSIONS_SESSION_KEY = 'ai-agent-workbench-sessions';

const modelProviderIds: ModelProviderId[] = [
  'mock',
  'groq',
  'gemini',
  'openrouter',
  'openai-api-key',
  'codex-oauth',
  'ollama',
];

function createSessionId(): string {
  return `s_${Date.now()}`;
}

function createMessageId(prefix: 'user' | 'assistant'): string {
  return `m_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSessionTitle(prompt: string): string {
  const normalizedPrompt = prompt.trim().replace(/\s+/g, ' ');
  return normalizedPrompt.length > 16 ? `${normalizedPrompt.slice(0, 16)}...` : normalizedPrompt || '新会话';
}

function sortSessionsByUpdatedAt(sessions: WorkbenchSession[]): WorkbenchSession[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

function createDefaultSessions(): WorkbenchSession[] {
  return sortSessionsByUpdatedAt(mockSessions.map((session) => ({ ...session })));
}

function normalizeWorkbenchMessage(rawValue: unknown): WorkbenchMessage | null {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const message = rawValue as Partial<WorkbenchMessage>;

  if (
    typeof message.id !== 'string' ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    typeof message.content !== 'string' ||
    typeof message.createdAt !== 'number'
  ) {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function normalizeWorkbenchSession(rawValue: unknown): WorkbenchSession | null {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const session = rawValue as Partial<WorkbenchSession>;

  if (typeof session.id !== 'string' || typeof session.title !== 'string') {
    return null;
  }

  const messages =
    Array.isArray(session.messages) ?
      session.messages
        .map((message) => normalizeWorkbenchMessage(message))
        .filter((message): message is WorkbenchMessage => message !== null) :
      [];

  return {
    id: session.id,
    title: session.title,
    updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : Date.now(),
    taskId: typeof session.taskId === 'string' ? session.taskId : undefined,
    messages,
  };
}

function persistWorkbenchSessions(sessions: WorkbenchSession[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(WORKBENCH_SESSIONS_SESSION_KEY, JSON.stringify(sessions));
}

function getInitialSessions(): WorkbenchSession[] {
  const defaultSessions = createDefaultSessions();

  if (typeof window === 'undefined') {
    return defaultSessions;
  }

  const rawValue = window.sessionStorage.getItem(WORKBENCH_SESSIONS_SESSION_KEY);

  if (!rawValue) {
    return defaultSessions;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
      return defaultSessions;
    }

    const normalizedSessions = parsedValue
      .map((session) => normalizeWorkbenchSession(session))
      .filter((session): session is WorkbenchSession => session !== null);

    if (normalizedSessions.length === 0) {
      return defaultSessions;
    }

    return sortSessionsByUpdatedAt(normalizedSessions);
  } catch {
    return defaultSessions;
  }
}

function getSessionLatestPrompt(session: WorkbenchSession): string {
  const userMessage = [...session.messages].reverse().find((message) => message.role === 'user');
  return userMessage?.content ?? '';
}

function getSessionLatestAssistantReply(session: WorkbenchSession): string {
  const assistantMessage = [...session.messages].reverse().find((message) => message.role === 'assistant');
  return assistantMessage?.content ?? '';
}

function updateCurrentSessionAssistantInSessions(
  sessions: WorkbenchSession[],
  currentSessionId: string,
  messageId: string,
  content: string
): WorkbenchSession[] {
  return sortSessionsByUpdatedAt(
    sessions.map((session) => {
      if (session.id !== currentSessionId) {
        return session;
      }

      const assistantMessageIndex = session.messages.findIndex((message) => message.id === messageId);
      const assistantMessage = session.messages[assistantMessageIndex];

      if (assistantMessageIndex === -1 || assistantMessage?.role !== 'assistant') {
        return session;
      }

      const nextMessages = [...session.messages];

      nextMessages[assistantMessageIndex] = {
        ...nextMessages[assistantMessageIndex],
        content,
      };

      return {
        ...session,
        messages: nextMessages,
        updatedAt: Date.now(),
      };
    })
  );
}

function createInitialAgentSteps(): AgentStep[] {
  return [
    { id: 'understand', title: '理解用户问题', status: 'pending' },
    { id: 'search', title: '检索知识库', status: 'pending' },
    { id: 'query', title: '查询业务数据', status: 'pending' },
    { id: 'chart', title: '生成分析图表', status: 'pending' },
    { id: 'confirm', title: '等待用户确认', status: 'pending' },
    { id: 'final', title: '生成最终结论', status: 'pending' },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getInitialModelConfigs(): ModelProviderConfigMap {
  if (typeof window === 'undefined') {
    return {};
  }

  const rawValue = window.sessionStorage.getItem(MODEL_CONFIG_SESSION_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    return JSON.parse(rawValue) as ModelProviderConfigMap;
  } catch {
    return {};
  }
}

function isModelProviderId(value: string): value is ModelProviderId {
  return modelProviderIds.includes(value as ModelProviderId);
}

function getInitialModelProvider(modelConfigs: ModelProviderConfigMap): ModelProviderId {
  if (typeof window === 'undefined') {
    return 'mock';
  }

  const savedProvider = window.sessionStorage.getItem(MODEL_PROVIDER_SESSION_KEY);

  if (!savedProvider || !isModelProviderId(savedProvider)) {
    return 'mock';
  }

  if (savedProvider === 'mock') {
    return 'mock';
  }

  if (savedProvider === 'codex-oauth') {
    return 'mock';
  }

  if (savedProvider === 'ollama') {
    const config = modelConfigs.ollama;
    return config?.baseUrl?.trim() && config?.modelName?.trim() ? 'ollama' : 'mock';
  }

  const config = modelConfigs[savedProvider];

  return config?.apiKey?.trim() ? savedProvider : 'mock';
}

const initialModelConfigs = getInitialModelConfigs();
const initialModelProvider = getInitialModelProvider(initialModelConfigs);
const initialSessions = getInitialSessions();
const initialCurrentSession = initialSessions[0];
const initialCurrentTaskId = initialCurrentSession?.taskId ?? DEFAULT_TASK_ID;
const initialPromptFromSession = initialCurrentSession ? getSessionLatestPrompt(initialCurrentSession) : '';
const initialAssistantReplyFromSession = initialCurrentSession
  ? getSessionLatestAssistantReply(initialCurrentSession)
  : '';
const initialActiveAssistantMessageId =
  [...(initialCurrentSession?.messages ?? [])].reverse().find((message) => message.role === 'assistant')?.id ?? '';

interface WorkbenchState {
  sessions: WorkbenchSession[];
  currentSessionId: string;
  currentTaskId: string;
  currentPrompt: string;
  generationStatus: GenerationStatus;
  errorMessage?: string;
  realModelNotice: string;
  assistantStream: AssistantStreamState;
  agentSteps: AgentStep[];
  visibleToolCallIds: string[];
  showKnowledgeSources: boolean;
  showAnalyticsResult: boolean;
  confirmStatus: ConfirmStatus;
  finalMessage: FinalMessage;
  currentModelProvider: ModelProvider;
  isModelModalOpen: boolean;
  modelConfigs: ModelProviderConfigMap;
  modelTestStatusMap: ModelProviderTestStatusMap;
  activeAssistantMessageId: string;
  streamRunId: number;
  persistSessions: (sessions: WorkbenchSession[]) => void;
  createSession: () => string;
  switchSession: (sessionId: string) => void;
  setCurrentSessionId: (sessionId: string) => void;
  setCurrentTaskId: (taskId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
  upsertCurrentSessionMessages: (messages: WorkbenchMessage[]) => void;
  updateCurrentSessionAssistantMessage: (messageId: string, content: string) => void;
  sendPrompt: (prompt: string) => void;
  runPromptWithCurrentModel: (prompt: string) => Promise<void>;
  setRealModelNotice: (notice: string) => void;
  setAssistantStream: (stream: AssistantStreamState) => void;
  setShowKnowledgeSources: (visible: boolean) => void;
  setShowAnalyticsResult: (visible: boolean) => void;
  resetAgentSteps: () => void;
  setAgentStepStatus: (stepId: string, status: AgentStepStatus) => void;
  showToolCall: (toolCallId: string) => void;
  resetVisibleToolCalls: () => void;
  runAgentStepsPreview: (runId: number) => Promise<void>;
  triggerMockError: () => void;
  retryCurrentTask: () => Promise<void>;
  confirmGenerateReport: () => Promise<void>;
  cancelGenerateReport: () => void;
  openModelModal: () => void;
  closeModelModal: () => void;
  setCurrentModelProvider: (provider: ModelProviderId) => void;
  saveModelConfig: (providerId: ModelProviderId, config: ModelProviderConfig) => void;
  clearModelConfig: (providerId: ModelProviderId) => void;
  setModelTestStatus: (providerId: ModelProviderId, status: ModelTestStatus) => void;
  stopGenerating: () => void;
  regenerate: () => Promise<void>;
  startAssistantStream: () => Promise<void>;
  startTask: (taskId: string, prompt: string) => void;
  hydrateFromUrl: (state: { sessionId?: string; taskId?: string }) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  sessions: initialSessions,
  currentSessionId: initialCurrentSession?.id ?? 's_001',
  currentTaskId: initialCurrentTaskId,
  currentPrompt: initialPromptFromSession,
  generationStatus: initialAssistantReplyFromSession ? 'done' : 'idle',
  errorMessage: undefined,
  realModelNotice: '',
  assistantStream: {
    content: initialAssistantReplyFromSession,
    status: initialAssistantReplyFromSession ? 'done' : 'idle',
  },
  agentSteps: initialAssistantReplyFromSession ?
    mockAgentSteps.map((step) => ({ ...step })) :
    createInitialAgentSteps(),
  visibleToolCallIds: initialAssistantReplyFromSession ? ['tool_knowledge_search', 'tool_query_data'] : [],
  showKnowledgeSources: Boolean(initialAssistantReplyFromSession),
  showAnalyticsResult: Boolean(initialAssistantReplyFromSession),
  confirmStatus: 'waiting',
  finalMessage: {
    content: '',
    status: 'hidden',
  },
  currentModelProvider: initialModelProvider,
  isModelModalOpen: false,
  modelConfigs: initialModelConfigs,
  modelTestStatusMap: {},
  activeAssistantMessageId: initialActiveAssistantMessageId,
  streamRunId: 0,
  persistSessions: (sessions) => {
    persistWorkbenchSessions(sortSessionsByUpdatedAt(sessions));
  },
  createSession: () => {
    const sessionId = createSessionId();
    const now = Date.now();
    const newSession: WorkbenchSession = {
      id: sessionId,
      title: '新会话',
      updatedAt: now,
      taskId: get().currentTaskId,
      messages: [],
    };

    set((state) => {
      const nextSessions = sortSessionsByUpdatedAt([newSession, ...state.sessions]);
      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
        currentSessionId: sessionId,
        currentPrompt: '',
        assistantStream: {
          content: '',
          status: 'idle',
        },
        activeAssistantMessageId: '',
        generationStatus: 'idle',
        realModelNotice: '',
        errorMessage: undefined,
        visibleToolCallIds: [],
        showKnowledgeSources: false,
        showAnalyticsResult: false,
        confirmStatus: 'waiting',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
        agentSteps: createInitialAgentSteps(),
      };
    });

    return sessionId;
  },
  switchSession: (sessionId) => {
    set((state) => {
      const nextSession = state.sessions.find((session) => session.id === sessionId);

      if (!nextSession) {
        return state;
      }

      const userMessage = [...nextSession.messages].reverse().find((message) => message.role === 'user');
      const assistantMessage = [...nextSession.messages]
        .reverse()
        .find((message) => message.role === 'assistant');

      const hasAssistantReply = Boolean(assistantMessage?.content?.trim());

      return {
        currentSessionId: nextSession.id,
        currentTaskId: nextSession.taskId ?? state.currentTaskId,
        currentPrompt: userMessage?.content ?? '',
        activeAssistantMessageId: assistantMessage?.id ?? '',
        assistantStream: {
          content: assistantMessage?.content ?? '',
          status: hasAssistantReply ? 'done' : 'idle',
        },
        generationStatus: hasAssistantReply ? 'done' : 'idle',
        realModelNotice: '',
        errorMessage: undefined,
        confirmStatus: 'waiting',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
        visibleToolCallIds: hasAssistantReply ? ['tool_knowledge_search', 'tool_query_data'] : [],
        showKnowledgeSources: hasAssistantReply,
        showAnalyticsResult: hasAssistantReply,
        agentSteps: hasAssistantReply ?
          mockAgentSteps.map((step) => ({ ...step })) :
          createInitialAgentSteps(),
      };
    });
  },
  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
  },
  setCurrentTaskId: (taskId) => {
    set({ currentTaskId: taskId });
  },
  setCurrentPrompt: (prompt) => {
    set({ currentPrompt: prompt });
  },
  upsertCurrentSessionMessages: (messages) => {
    set((state) => {
      const now = Date.now();
      const nextSessions = sortSessionsByUpdatedAt(
        state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? {
                ...session,
                messages,
                updatedAt: now,
                taskId: state.currentTaskId,
              }
            : session
        )
      );

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
      };
    });
  },
  updateCurrentSessionAssistantMessage: (messageId, content) => {
    set((state) => {
      const nextSessions = updateCurrentSessionAssistantInSessions(
        state.sessions,
        state.currentSessionId,
        messageId,
        content
      );

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
      };
    });
  },
  sendPrompt: (prompt) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    void get().runPromptWithCurrentModel(trimmedPrompt);
  },
  setRealModelNotice: (notice) => {
    set({
      realModelNotice: notice,
    });
  },
  runPromptWithCurrentModel: async (prompt) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    const snapshot = get();
    const groqApiKey = snapshot.modelConfigs.groq?.apiKey?.trim();
    const shouldUseGroq = snapshot.currentModelProvider === 'groq' && Boolean(groqApiKey);
    const runId = snapshot.streamRunId + 1;
    const now = Date.now();
    const nextMessages: WorkbenchMessage[] = [
      {
        id: createMessageId('user'),
        role: 'user',
        content: trimmedPrompt,
        createdAt: now,
      },
      {
        id: createMessageId('assistant'),
        role: 'assistant',
        content: '',
        createdAt: now + 1,
      },
    ];
    const assistantMessageId = nextMessages[1].id;

    set((state) => {
      let hasCurrentSession = false;
      const sessions = state.sessions.map((session) => {
        if (session.id !== state.currentSessionId) {
          return session;
        }

        hasCurrentSession = true;
        const shouldRenameSession = session.title === '新会话' || session.messages.length === 0;

        return {
          ...session,
          title: shouldRenameSession ? createSessionTitle(trimmedPrompt) : session.title,
          updatedAt: now,
          taskId: state.currentTaskId,
          messages: [...session.messages, ...nextMessages],
        };
      });

      const nextSessions = hasCurrentSession
        ? sortSessionsByUpdatedAt(sessions)
        : sortSessionsByUpdatedAt([
            ...sessions,
            {
              id: state.currentSessionId,
              title: createSessionTitle(trimmedPrompt),
              updatedAt: now,
              taskId: state.currentTaskId,
              messages: nextMessages,
            },
          ]);

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
        currentPrompt: trimmedPrompt,
        activeAssistantMessageId: assistantMessageId,
        streamRunId: runId,
        generationStatus: 'streaming',
        errorMessage: undefined,
        realModelNotice: '',
        assistantStream: {
          content: '',
          status: 'streaming',
        },
        agentSteps: createInitialAgentSteps(),
        visibleToolCallIds: [],
        showKnowledgeSources: false,
        showAnalyticsResult: false,
        confirmStatus: 'waiting',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
      };
    });
    void get().runAgentStepsPreview(runId);

    const streamMockReplyForRun = async () => {
      const result = await streamText(
        DEFAULT_ASSISTANT_REPLY,
        (content) => {
          const current = get();

          if (current.streamRunId !== runId) {
            return;
          }

          set((state) => {
            const updatedSessions = updateCurrentSessionAssistantInSessions(
              state.sessions,
              state.currentSessionId,
              assistantMessageId,
              content
            );

            persistWorkbenchSessions(updatedSessions);

            return {
              sessions: updatedSessions,
              assistantStream: {
                content,
                status: 'streaming',
              },
            };
          });
        },
        {
          interval: 24,
          shouldStop: () => {
            const current = get();
            return current.streamRunId !== runId || current.generationStatus !== 'streaming';
          },
        }
      );

      const current = get();

      if (current.streamRunId !== runId) {
        return;
      }

      if (current.generationStatus !== 'streaming') {
        set({
          assistantStream: {
            content: current.assistantStream.content,
            status: current.generationStatus === 'stopped' ? 'stopped' : current.assistantStream.status,
          },
        });
        return;
      }

      set((state) => {
        const updatedSessions = updateCurrentSessionAssistantInSessions(
          state.sessions,
          state.currentSessionId,
          assistantMessageId,
          current.assistantStream.content
        );

        persistWorkbenchSessions(updatedSessions);

        return {
          sessions: updatedSessions,
          generationStatus: result === 'stopped' ? 'stopped' : 'done',
          assistantStream: {
            content: current.assistantStream.content,
            status: result === 'stopped' ? 'stopped' : 'done',
          },
        };
      });
    };

    if (!shouldUseGroq) {
      await streamMockReplyForRun();
      return;
    }

    try {
      await streamGroqChat({
        prompt: trimmedPrompt,
        apiKey: groqApiKey,
        onChunk: (chunk) => {
          const current = get();

          if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
            return;
          }

          set((state) => {
            const nextContent = state.assistantStream.content + chunk;
            const nextSessions = updateCurrentSessionAssistantInSessions(
              state.sessions,
              state.currentSessionId,
              assistantMessageId,
              nextContent
            );

            persistWorkbenchSessions(nextSessions);

            return {
              sessions: nextSessions,
              assistantStream: {
                content: nextContent,
                status: 'streaming',
              },
            };
          });
        },
      });
      const current = get();

      if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
        return;
      }

      set((state) => {
        const updatedSessions = updateCurrentSessionAssistantInSessions(
          state.sessions,
          state.currentSessionId,
          assistantMessageId,
          current.assistantStream.content
        );

        persistWorkbenchSessions(updatedSessions);

        return {
          sessions: updatedSessions,
          assistantStream: {
            content: current.assistantStream.content,
            status: 'done',
          },
          generationStatus: 'done',
        };
      });
    } catch {
      const current = get();

      if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
        return;
      }

      set({
        realModelNotice: 'Groq 当前不可用，已自动切回 Mock 演示结果。',
      });

      await streamMockReplyForRun();
    }
  },
  setAssistantStream: (assistantStream) => {
    set({ assistantStream });
  },
  setShowKnowledgeSources: (showKnowledgeSources) => {
    set({ showKnowledgeSources });
  },
  setShowAnalyticsResult: (showAnalyticsResult) => {
    set({ showAnalyticsResult });
  },
  resetAgentSteps: () => {
    set({ agentSteps: createInitialAgentSteps() });
  },
  setAgentStepStatus: (stepId, status) => {
    set((state) => ({
      agentSteps: state.agentSteps.map((step) =>
        step.id === stepId ? { ...step, status } : step
      ),
    }));
  },
  showToolCall: (toolCallId) => {
    set((state) => {
      if (state.visibleToolCallIds.includes(toolCallId)) {
        return state;
      }

      return {
        visibleToolCallIds: [...state.visibleToolCallIds, toolCallId],
      };
    });
  },
  resetVisibleToolCalls: () => {
    set({ visibleToolCallIds: [] });
  },
  runAgentStepsPreview: async (runId) => {
    const isCurrentRun = () => {
      const current = get();
      return (
        current.streamRunId === runId &&
        current.generationStatus !== 'stopped' &&
        current.generationStatus !== 'error'
      );
    };

    get().resetAgentSteps();

    get().setAgentStepStatus('understand', 'running');
    await delay(160);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('understand', 'success');

    get().setAgentStepStatus('search', 'running');
    await delay(260);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('search', 'success');
    if (!isCurrentRun()) return;
    get().showToolCall('tool_knowledge_search');
    if (!isCurrentRun()) return;
    get().setShowKnowledgeSources(true);

    get().setAgentStepStatus('query', 'running');
    await delay(260);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('query', 'success');
    if (!isCurrentRun()) return;
    get().showToolCall('tool_query_data');

    get().setAgentStepStatus('chart', 'running');
    await delay(220);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('chart', 'success');
    if (!isCurrentRun()) return;
    get().setShowAnalyticsResult(true);

    get().setAgentStepStatus('confirm', 'running');
  },
  triggerMockError: () => {
    set((state) => ({
      generationStatus: 'error',
      errorMessage: '数据查询服务暂时不可用，请稍后重试。',
      realModelNotice: '',
      assistantStream: {
        ...state.assistantStream,
        status: state.assistantStream.status === 'streaming' ? 'stopped' : state.assistantStream.status,
      },
      finalMessage: {
        content: '',
        status: 'hidden',
      },
      agentSteps: state.agentSteps.map((step) =>
        step.status === 'running' ? { ...step, status: 'error' } : step
      ),
    }));
  },
  retryCurrentTask: async () => {
    set({
      errorMessage: undefined,
      realModelNotice: '',
    });

    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
  confirmGenerateReport: async () => {
    const currentBeforeConfirm = get();
    const confirmStep = currentBeforeConfirm.agentSteps.find((step) => step.id === 'confirm');

    if (currentBeforeConfirm.confirmStatus !== 'waiting' || confirmStep?.status !== 'running') {
      return;
    }

    const runId = get().streamRunId;

    set({
      confirmStatus: 'confirmed',
      generationStatus: 'streaming',
    });

    get().setAgentStepStatus('confirm', 'success');
    get().setAgentStepStatus('final', 'running');

    await delay(600);

    const current = get();

    if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
      return;
    }

    get().setAgentStepStatus('final', 'success');

    set({
      generationStatus: 'done',
      finalMessage: {
        content: FINAL_REPORT_SUMMARY,
        status: 'visible',
      },
    });
  },
  cancelGenerateReport: () => {
    set((state) => ({
      confirmStatus: 'cancelled',
      generationStatus: 'stopped',
      finalMessage: {
        content: '已取消生成分析报告。',
        status: 'visible',
      },
      agentSteps: state.agentSteps.map((step) =>
        step.status === 'running' ? { ...step, status: 'error' } : step
      ),
    }));
  },
  openModelModal: () => {
    set({ isModelModalOpen: true });
  },
  closeModelModal: () => {
    set({ isModelModalOpen: false });
  },
  setCurrentModelProvider: (provider) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(MODEL_PROVIDER_SESSION_KEY, provider);
    }

    set({ currentModelProvider: provider });
  },
  saveModelConfig: (providerId, config) => {
    const normalizedConfig: ModelProviderConfig = {
      apiKey: config.apiKey?.trim(),
      baseUrl: config.baseUrl?.trim(),
      modelName: config.modelName?.trim(),
    };

    set((state) => {
      const nextConfigs: ModelProviderConfigMap = {
        ...state.modelConfigs,
        [providerId]: normalizedConfig,
      };

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(MODEL_CONFIG_SESSION_KEY, JSON.stringify(nextConfigs));
      }

      return {
        modelConfigs: nextConfigs,
      };
    });
  },
  clearModelConfig: (providerId) => {
    set((state) => {
      const nextConfigs: ModelProviderConfigMap = { ...state.modelConfigs };
      delete nextConfigs[providerId];
      const shouldFallbackToMock = state.currentModelProvider === providerId;
      const nextProvider: ModelProviderId = shouldFallbackToMock ? 'mock' : state.currentModelProvider;

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(MODEL_CONFIG_SESSION_KEY, JSON.stringify(nextConfigs));
        if (shouldFallbackToMock) {
          window.sessionStorage.setItem(MODEL_PROVIDER_SESSION_KEY, 'mock');
        }
      }

      return {
        modelConfigs: nextConfigs,
        currentModelProvider: nextProvider,
        modelTestStatusMap: {
          ...state.modelTestStatusMap,
          [providerId]: 'idle',
        },
      };
    });
  },
  setModelTestStatus: (providerId, status) => {
    set((state) => ({
      modelTestStatusMap: {
        ...state.modelTestStatusMap,
        [providerId]: status,
      },
    }));
  },
  stopGenerating: () => {
    set((state) => ({
      streamRunId: state.streamRunId + 1,
      generationStatus: 'stopped',
      assistantStream: {
        ...state.assistantStream,
        status: state.assistantStream.status === 'streaming' ? 'stopped' : state.assistantStream.status,
      },
      agentSteps: state.agentSteps.map((step) =>
        step.status === 'running' ? { ...step, status: 'error' } : step
      ),
    }));
  },
  regenerate: async () => {
    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
  startAssistantStream: async () => {
    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
  startTask: (taskId, prompt) => {
    set((state) => {
      const nextSessions = state.sessions.map((session) =>
        session.id === state.currentSessionId
          ? {
              ...session,
              taskId,
            }
          : session
      );

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
        currentTaskId: taskId,
      };
    });

    void get().runPromptWithCurrentModel(prompt);
  },
  hydrateFromUrl: (state) => {
    set((currentState) => {
      const fallbackSession = currentState.sessions[0];
      const nextSession =
        currentState.sessions.find((session) => session.id === state.sessionId) ?? fallbackSession;
      const nextTaskId = state.taskId ?? nextSession?.taskId ?? DEFAULT_TASK_ID;
      const matchedTask = mockTasks.find((task) => task.id === nextTaskId);
      const userMessage = [...(nextSession?.messages ?? [])]
        .reverse()
        .find((message) => message.role === 'user');
      const assistantMessage = [...(nextSession?.messages ?? [])]
        .reverse()
        .find((message) => message.role === 'assistant');
      const hasAssistantReply = Boolean(assistantMessage?.content?.trim());

      return {
        currentSessionId: nextSession?.id ?? currentState.currentSessionId,
        currentTaskId: matchedTask?.id ?? DEFAULT_TASK_ID,
        currentPrompt: userMessage?.content ?? '',
        activeAssistantMessageId: assistantMessage?.id ?? '',
        assistantStream: {
          content: assistantMessage?.content ?? '',
          status: hasAssistantReply ? 'done' : 'idle',
        },
        generationStatus: hasAssistantReply ? 'done' : 'idle',
        realModelNotice: '',
        errorMessage: undefined,
        confirmStatus: 'waiting',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
        visibleToolCallIds: hasAssistantReply ? ['tool_knowledge_search', 'tool_query_data'] : [],
        showKnowledgeSources: hasAssistantReply,
        showAnalyticsResult: hasAssistantReply,
        agentSteps: hasAssistantReply ?
          mockAgentSteps.map((step) => ({ ...step })) :
          createInitialAgentSteps(),
      };
    });
  },
}));
