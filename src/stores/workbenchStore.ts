import { create } from 'zustand';
import { mockAgentSteps } from '../mocks/agentSteps';
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
} from '../types/workbench';
import { streamGroqChat } from '../services/chatApi';
import { streamText } from '../utils/streamText';

const DEFAULT_TASK_ID = 't_month_analytics';
const DEFAULT_PROMPT = '请分析 2026 年 5 月教学质量相关数据，找出异常指标，并给出简短结论。';
const DEFAULT_ASSISTANT_REPLY =
  '我将先检索相关指标口径与教学质量分析规则，再查询本月各年级成绩与出勤数据，随后给出异常项和简短分析结论。';
const FINAL_REPORT_SUMMARY =
  '已基于当前数据生成简短分析结论：本月教学质量整体保持稳定，但七年级平均分和八年级出勤率出现明显波动，建议优先查看七年级周测成绩明细和八年级班级出勤记录，并将两个指标加入后续跟踪。';
const MODEL_CONFIG_SESSION_KEY = 'ai-agent-workbench-model-configs';
const MODEL_PROVIDER_SESSION_KEY = 'ai-agent-workbench-current-model-provider';

const modelProviderIds: ModelProviderId[] = [
  'mock',
  'groq',
  'gemini',
  'openrouter',
  'openai-api-key',
  'codex-oauth',
  'ollama',
];

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

interface WorkbenchState {
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
  streamRunId: number;
  setCurrentSessionId: (sessionId: string) => void;
  setCurrentTaskId: (taskId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
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
  currentSessionId: 's_001',
  currentTaskId: DEFAULT_TASK_ID,
  currentPrompt: DEFAULT_PROMPT,
  generationStatus: 'done',
  errorMessage: undefined,
  realModelNotice: '',
  assistantStream: {
    content: DEFAULT_ASSISTANT_REPLY,
    status: 'done',
  },
  agentSteps: mockAgentSteps.map((step) => ({ ...step })),
  visibleToolCallIds: ['tool_knowledge_search', 'tool_query_data'],
  showKnowledgeSources: true,
  showAnalyticsResult: true,
  confirmStatus: 'waiting',
  finalMessage: {
    content: '',
    status: 'hidden',
  },
  currentModelProvider: initialModelProvider,
  isModelModalOpen: false,
  modelConfigs: initialModelConfigs,
  modelTestStatusMap: {},
  streamRunId: 0,
  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
  },
  setCurrentTaskId: (taskId) => {
    set({ currentTaskId: taskId });
  },
  setCurrentPrompt: (prompt) => {
    set({ currentPrompt: prompt });
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

    set({
      currentPrompt: trimmedPrompt,
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

          set({
            assistantStream: {
              content,
              status: 'streaming',
            },
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

      set({
        generationStatus: result === 'stopped' ? 'stopped' : 'done',
        assistantStream: {
          content: current.assistantStream.content,
          status: result === 'stopped' ? 'stopped' : 'done',
        },
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

          set((state) => ({
            assistantStream: {
              content: state.assistantStream.content + chunk,
              status: 'streaming',
            },
          }));
        },
      });
      const current = get();

      if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
        return;
      }

      set({
        assistantStream: {
          content: current.assistantStream.content,
          status: 'done',
        },
        generationStatus: 'done',
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
    set({
      currentTaskId: taskId,
    });

    void get().runPromptWithCurrentModel(prompt);
  },
  hydrateFromUrl: (state) => {
    const nextTaskId = state.taskId ?? DEFAULT_TASK_ID;
    const matchedTask = mockTasks.find((task) => task.id === nextTaskId);

    set({
      currentSessionId: state.sessionId ?? 's_001',
      currentTaskId: nextTaskId,
      currentPrompt: matchedTask?.prompt ?? DEFAULT_PROMPT,
    });
  },
}));
