import { mockSessions } from '../../mocks/sessions';
import type {
  AssistantStreamState,
  GenerationStatus,
  ModelProviderConfigMap,
  ModelProviderId,
  RunSnapshot,
  WorkbenchMessage,
  WorkbenchMessageKind,
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
export const WORKBENCH_SESSION_STORAGE_VERSION = 2;

interface PersistedWorkbenchState {
  version: number;
  sessions: WorkbenchSession[];
  activeSessionId: string;
}

interface WorkbenchSessionStorageState {
  sessions: WorkbenchSession[];
  activeSessionId: string;
}

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

export function createWorkbenchMessage(params: {
  role: WorkbenchMessage['role'];
  content: string;
  kind?: WorkbenchMessageKind;
  runId?: string;
  createdAt?: number;
}): WorkbenchMessage {
  const message: WorkbenchMessage = {
    id: `m_${params.role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: params.role,
    kind: params.kind ?? 'normal',
    content: params.content,
    createdAt: params.createdAt ?? Date.now(),
  };

  if (params.runId?.trim()) {
    message.runId = params.runId;
  }

  return message;
}

export function createEmptySession(params?: {
  title?: string;
  taskId?: string;
}): WorkbenchSession {
  return {
    id: createSessionId(),
    title: params?.title ?? '新会话',
    updatedAt: Date.now(),
    taskId: params?.taskId,
    messages: [],
    runsById: {},
    latestRunId: undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunStatus(value: unknown): value is RunSnapshot['status'] {
  return (
    value === 'idle' ||
    value === 'pending' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error' ||
    value === 'stopped'
  );
}

function isRunStepStatus(value: unknown): value is RunSnapshot['steps'][number]['status'] {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error' ||
    value === 'skipped' ||
    value === 'stopped'
  );
}

function isRunToolStatus(value: unknown): value is RunSnapshot['toolInvocations'][number]['status'] {
  return isRunStepStatus(value);
}

function isRunMode(value: unknown): value is RunSnapshot['mode'] {
  return value === 'mock' || value === 'agent';
}

function isRunIntent(value: unknown): value is RunSnapshot['intent'] {
  return (
    value === 'capability_intro' ||
    value === 'data_analysis' ||
    value === 'unsupported' ||
    value === 'unknown'
  );
}

function isRunConclusionSource(value: unknown): value is RunSnapshot['conclusionSource'] {
  return value === 'model' || value === 'fallback' || value === 'mock' || value === 'none';
}

function isRunReportState(value: unknown): value is RunSnapshot['reportState'] {
  return value === 'hidden' || value === 'pending' || value === 'generated' || value === 'skipped';
}

function settleInterruptedRun(run: RunSnapshot): RunSnapshot {
  if (run.status !== 'running' && run.status !== 'pending') {
    return run;
  }

  const timestamp = new Date().toISOString();

  return {
    ...run,
    status: 'stopped',
    updatedAt: timestamp,
    steps: run.steps.map((step) =>
      step.status === 'running'
        ? {
            ...step,
            status: 'stopped',
            completedAt: step.completedAt ?? timestamp,
          }
        : step,
    ),
    toolInvocations: run.toolInvocations.map((tool) =>
      tool.status === 'running'
        ? {
            ...tool,
            status: 'stopped',
            completedAt: tool.completedAt ?? timestamp,
          }
        : tool,
    ),
  };
}

function normalizeRunSnapshot(rawValue: unknown): RunSnapshot | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const run = rawValue as Partial<RunSnapshot>;

  if (
    typeof run.id !== 'string' ||
    (run.sessionId !== undefined && typeof run.sessionId !== 'string') ||
    !isRunMode(run.mode) ||
    !isRunStatus(run.status) ||
    !isRunIntent(run.intent) ||
    typeof run.prompt !== 'string' ||
    !Array.isArray(run.steps) ||
    !run.steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.id === 'string' &&
        typeof step.title === 'string' &&
        isRunStepStatus(step.status),
    ) ||
    !Array.isArray(run.toolInvocations) ||
    !run.toolInvocations.every(
      (tool) =>
        isRecord(tool) &&
        typeof tool.id === 'string' &&
        typeof tool.toolId === 'string' &&
        typeof tool.toolName === 'string' &&
        typeof tool.displayName === 'string' &&
        isRunToolStatus(tool.status),
    ) ||
    typeof run.conclusion !== 'string' ||
    !isRunConclusionSource(run.conclusionSource) ||
    !isRunReportState(run.reportState) ||
    typeof run.createdAt !== 'string' ||
    typeof run.updatedAt !== 'string'
  ) {
    return null;
  }

  return settleInterruptedRun(run as RunSnapshot);
}

function normalizeRunsById(rawValue: unknown): Record<string, RunSnapshot> | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const runsById: Record<string, RunSnapshot> = {};

  for (const [runId, rawRun] of Object.entries(rawValue)) {
    const normalizedRun = normalizeRunSnapshot(rawRun);

    if (!normalizedRun || normalizedRun.id !== runId) {
      return null;
    }

    runsById[runId] = normalizedRun;
  }

  return runsById;
}

export function getSessionLatestRun(session: WorkbenchSession | undefined): RunSnapshot | null {
  if (!session?.latestRunId) {
    return null;
  }

  return session.runsById[session.latestRunId] ?? null;
}

export function upsertRunIntoSessions(
  sessions: WorkbenchSession[],
  currentSessionId: string,
  run: RunSnapshot,
): WorkbenchSession[] {
  let didUpdate = false;
  const timestamp = Date.now();

  const nextSessions = sessions.map((session) => {
    if (session.id !== currentSessionId) {
      return session;
    }

    didUpdate = true;
    const runWithSession: RunSnapshot = {
      ...run,
      sessionId: run.sessionId ?? currentSessionId,
    };

    return {
      ...session,
      updatedAt: timestamp,
      runsById: {
        ...session.runsById,
        [runWithSession.id]: runWithSession,
      },
      latestRunId: runWithSession.id,
    };
  });

  return didUpdate ? sortSessionsByUpdatedAt(nextSessions) : sessions;
}

export function sortSessionsByUpdatedAt(sessions: WorkbenchSession[]): WorkbenchSession[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

function createDefaultSessions(): WorkbenchSession[] {
  return sortSessionsByUpdatedAt(
    mockSessions.map((session) => ({
      ...session,
      messages: session.messages.map((message) => ({ ...message })),
      runsById: { ...session.runsById },
    })),
  );
}

function normalizeWorkbenchMessage(rawValue: unknown): WorkbenchMessage | null {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const message = rawValue as Partial<WorkbenchMessage>;

  if (
    typeof message.id !== 'string' ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    (message.kind !== 'normal' &&
      message.kind !== 'report' &&
      message.kind !== 'partial' &&
      message.kind !== 'error') ||
    typeof message.content !== 'string' ||
    typeof message.createdAt !== 'number' ||
    (message.runId !== undefined && typeof message.runId !== 'string')
  ) {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    kind: message.kind,
    content: message.content,
    createdAt: message.createdAt,
    runId: message.runId,
  };
}

function normalizeWorkbenchSession(rawValue: unknown): WorkbenchSession | null {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const session = rawValue as Partial<WorkbenchSession>;

  const runsById = normalizeRunsById(session.runsById);

  if (
    typeof session.id !== 'string' ||
    typeof session.title !== 'string' ||
    !runsById ||
    (session.latestRunId !== undefined && typeof session.latestRunId !== 'string')
  ) {
    return null;
  }

  if (session.latestRunId && !runsById[session.latestRunId]) {
    return null;
  }

  if (!Array.isArray(session.messages)) {
    return null;
  }

  const messages = session.messages.map((message) => normalizeWorkbenchMessage(message));

  if (messages.some((message) => message === null)) {
    return null;
  }

  return {
    id: session.id,
    title: session.title,
    updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : Date.now(),
    taskId: typeof session.taskId === 'string' ? session.taskId : undefined,
    messages: messages.filter((message): message is WorkbenchMessage => message !== null),
    runsById,
    latestRunId: session.latestRunId,
  };
}

function clearPersistedWorkbenchState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(WORKBENCH_SESSIONS_SESSION_KEY);
}

export function persistWorkbenchSessions(sessions: WorkbenchSession[], activeSessionId: string): void {
  writeSessionStorageJson<PersistedWorkbenchState>(WORKBENCH_SESSIONS_SESSION_KEY, {
    version: WORKBENCH_SESSION_STORAGE_VERSION,
    sessions,
    activeSessionId,
  });
}

export function getInitialWorkbenchSessionState(): WorkbenchSessionStorageState {
  const defaultSessions = createDefaultSessions();
  const defaultState: WorkbenchSessionStorageState = {
    sessions: defaultSessions,
    activeSessionId: defaultSessions[0]?.id ?? 's_001',
  };

  if (typeof window === 'undefined') {
    return defaultState;
  }

  const parsedValue = readSessionStorageJson<unknown>(WORKBENCH_SESSIONS_SESSION_KEY, null);

  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    clearPersistedWorkbenchState();
    return defaultState;
  }

  const persistedState = parsedValue as Partial<PersistedWorkbenchState>;

  if (
    persistedState.version !== WORKBENCH_SESSION_STORAGE_VERSION ||
    !Array.isArray(persistedState.sessions) ||
    typeof persistedState.activeSessionId !== 'string'
  ) {
    clearPersistedWorkbenchState();
    return defaultState;
  }

  const normalizedSessions = persistedState.sessions.map((session) => normalizeWorkbenchSession(session));

  if (normalizedSessions.length === 0 || normalizedSessions.some((session) => session === null)) {
    clearPersistedWorkbenchState();
    return defaultState;
  }

  const sessions = sortSessionsByUpdatedAt(
    normalizedSessions.filter((session): session is WorkbenchSession => session !== null),
  );
  const hasActiveSession = sessions.some((session) => session.id === persistedState.activeSessionId);

  if (!hasActiveSession) {
    clearPersistedWorkbenchState();
    return defaultState;
  }

  persistWorkbenchSessions(sessions, persistedState.activeSessionId);

  return {
    sessions,
    activeSessionId: persistedState.activeSessionId,
  };
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
const initialSessionState = getInitialWorkbenchSessionState();
const initialSessions = initialSessionState.sessions;
const initialCurrentSession =
  initialSessions.find((session) => session.id === initialSessionState.activeSessionId) ?? initialSessions[0];
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
  modelConfigs: initialModelConfigs,
  currentModelProvider: initialModelProvider,
};

export { createSessionTitle };
