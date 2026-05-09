import { mockAgentSteps } from '../../mocks/agentSteps';
import { mockSessions } from '../../mocks/sessions';
import type {
  AgentStep,
  AssistantStreamState,
  GenerationStatus,
  ModelProviderConfigMap,
  ModelProviderId,
  WorkbenchMessage,
  WorkbenchSession,
} from '../../types/workbench';
import { createSessionTitle } from '../../utils/sessionTitle';
import { readSessionStorageJson, writeSessionStorageJson } from '../../utils/sessionStorage';

export const DEFAULT_TASK_ID = 't_month_analytics';
export const DEFAULT_ASSISTANT_REPLY =
  '我将先检索相关指标口径与教学质量分析规则，再查询本月各年级成绩与出勤数据，随后给出异常项和简短分析结论。';
export const FINAL_REPORT_SUMMARY =
  '已基于当前数据生成简短分析结论：本月教学质量整体保持稳定，但七年级平均分和八年级出勤率出现明显波动，建议优先查看七年级周测成绩明细和八年级班级出勤记录，并将两个指标加入后续跟踪。';
export const MODEL_CONFIG_SESSION_KEY = 'ai-agent-workbench-model-configs';
export const MODEL_PROVIDER_SESSION_KEY = 'ai-agent-workbench-current-model-provider';
export const WORKBENCH_SESSIONS_SESSION_KEY = 'ai-agent-workbench-sessions';

export const modelProviderIds: ModelProviderId[] = [
  'mock',
  'groq',
  'gemini',
  'openrouter',
  'openai-api-key',
  'codex-oauth',
  'ollama',
];

export function createSessionId(): string {
  return `s_${Date.now()}`;
}

export function sortSessionsByUpdatedAt(sessions: WorkbenchSession[]): WorkbenchSession[] {
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
    Array.isArray(session.messages)
      ? session.messages
          .map((message) => normalizeWorkbenchMessage(message))
          .filter((message): message is WorkbenchMessage => message !== null)
      : [];

  return {
    id: session.id,
    title: session.title,
    updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : Date.now(),
    taskId: typeof session.taskId === 'string' ? session.taskId : undefined,
    messages,
  };
}

export function persistWorkbenchSessions(sessions: WorkbenchSession[]): void {
  writeSessionStorageJson(WORKBENCH_SESSIONS_SESSION_KEY, sessions);
}

export function getInitialSessions(): WorkbenchSession[] {
  const defaultSessions = createDefaultSessions();

  if (typeof window === 'undefined') {
    return defaultSessions;
  }

  const parsedValue = readSessionStorageJson<unknown>(WORKBENCH_SESSIONS_SESSION_KEY, null);

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
}

export function getSessionLatestPrompt(session: WorkbenchSession): string {
  const userMessage = [...session.messages].reverse().find((message) => message.role === 'user');
  return userMessage?.content ?? '';
}

export function getSessionLatestAssistantReply(session: WorkbenchSession): string {
  const assistantMessage = [...session.messages].reverse().find((message) => message.role === 'assistant');
  return assistantMessage?.content ?? '';
}

export function updateCurrentSessionAssistantInSessions(
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

export function createInitialAgentSteps(): AgentStep[] {
  return [
    { id: 'understand', title: '理解用户问题', status: 'pending' },
    { id: 'search', title: '检索知识库', status: 'pending' },
    { id: 'query', title: '查询业务数据', status: 'pending' },
    { id: 'chart', title: '生成分析图表', status: 'pending' },
    { id: 'confirm', title: '等待用户确认', status: 'pending' },
    { id: 'final', title: '生成最终结论', status: 'pending' },
  ];
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getInitialModelConfigs(): ModelProviderConfigMap {
  return readSessionStorageJson<ModelProviderConfigMap>(MODEL_CONFIG_SESSION_KEY, {});
}

export function isModelProviderId(value: string): value is ModelProviderId {
  return modelProviderIds.includes(value as ModelProviderId);
}

export function getInitialModelProvider(modelConfigs: ModelProviderConfigMap): ModelProviderId {
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

interface InitialWorkbenchState {
  sessions: WorkbenchSession[];
  currentSessionId: string;
  currentTaskId: string;
  currentPrompt: string;
  activeAssistantMessageId: string;
  generationStatus: GenerationStatus;
  assistantStream: AssistantStreamState;
  agentSteps: AgentStep[];
  visibleToolCallIds: string[];
  showKnowledgeSources: boolean;
  showAnalyticsResult: boolean;
  modelConfigs: ModelProviderConfigMap;
  currentModelProvider: ModelProviderId;
}

export const initialWorkbenchState: InitialWorkbenchState = {
  sessions: initialSessions,
  currentSessionId: initialCurrentSession?.id ?? 's_001',
  currentTaskId: initialCurrentTaskId,
  currentPrompt: initialPromptFromSession,
  activeAssistantMessageId: initialActiveAssistantMessageId,
  generationStatus: initialAssistantReplyFromSession ? 'done' : 'idle',
  assistantStream: {
    content: initialAssistantReplyFromSession,
    status: initialAssistantReplyFromSession ? 'done' : 'idle',
  },
  agentSteps: initialAssistantReplyFromSession
    ? mockAgentSteps.map((step) => ({ ...step }))
    : createInitialAgentSteps(),
  visibleToolCallIds: initialAssistantReplyFromSession ? ['tool_knowledge_search', 'tool_query_data'] : [],
  showKnowledgeSources: Boolean(initialAssistantReplyFromSession),
  showAnalyticsResult: Boolean(initialAssistantReplyFromSession),
  modelConfigs: initialModelConfigs,
  currentModelProvider: initialModelProvider,
};

export { createSessionTitle };
