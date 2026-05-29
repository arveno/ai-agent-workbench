import type {
  AssistantStreamState,
  GenerationStatus,
  ModelProviderId,
  WorkbenchMessage,
  WorkbenchMessageKind,
  WorkbenchSession,
} from '../../types/workbench';
import type { RestoredRunAdapterInput, RunViewModel, RunViewModelConclusionSection } from '../../domain/run/view-model';
import type { RunSource } from '../../types/rag';
import { RunViewModelFactory } from '../../domain/run/view-model';
import { isModelProviderId as isKnownModelProviderId } from '../../utils/modelCatalogMetadata';
import { createSessionTitle } from '../../utils/sessionTitle';
import { readSessionStorageJson, writeSessionStorageJson } from '../../utils/sessionStorage';

export const DEFAULT_ASSISTANT_REPLY =
  '我将先检索相关指标口径与教学质量分析规则，再查询本月各年级成绩与出勤数据，随后给出异常项和简短分析结论。';
export const FINAL_REPORT_SUMMARY =
  '已基于当前数据生成简短分析结论：本月教学质量整体保持稳定，但七年级平均分和八年级出勤率出现明显波动，建议优先查看七年级周测成绩明细和八年级班级出勤记录，并将两个指标加入后续跟踪。';
export const SELECTED_MODEL_ID_SESSION_KEY = 'ai-agent-workbench-selected-model-id';
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
}): WorkbenchSession {
  return {
    id: createSessionId(),
    title: params?.title ?? '新会话',
    updatedAt: Date.now(),
    messages: [],
    runsById: {},
    latestRunId: undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunStatus(value: unknown): value is RunViewModel['status'] {
  return (
    value === 'idle' ||
    value === 'pending' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error' ||
    value === 'stopped'
  );
}

function isRunStepStatus(value: unknown): value is RunViewModel['steps'][number]['status'] {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error' ||
    value === 'skipped' ||
    value === 'stopped'
  );
}

function isRunToolStatus(value: unknown): value is RunViewModel['toolInvocations'][number]['status'] {
  return isRunStepStatus(value);
}

function isRunMode(value: unknown): value is RunViewModel['mode'] {
  return value === 'mock' || value === 'agent';
}

function isRunIntent(value: unknown): value is RunViewModel['intent'] {
  return (
    value === 'capability_intro' ||
    value === 'data_analysis' ||
    value === 'knowledge_qa' ||
    value === 'unsupported' ||
    value === 'unknown'
  );
}

function isRunConclusionSource(value: unknown): value is RunViewModel['conclusionSource'] {
  return value === 'model' || value === 'fallback' || value === 'mock' || value === 'none';
}

function isRunReportState(value: unknown): value is RunViewModel['reportState'] {
  return (
    value === 'hidden' ||
    value === 'pending' ||
    value === 'generating' ||
    value === 'generated' ||
    value === 'skipped' ||
    value === 'failed'
  );
}

function isRunPlan(value: unknown): value is NonNullable<RunViewModel['plan']> {
  return (
    isRecord(value) &&
    isRunIntent(value.intent) &&
    typeof value.shouldUseDataAnalysis === 'boolean' &&
    (value.reason === undefined || typeof value.reason === 'string') &&
    (value.metric === undefined || typeof value.metric === 'string') &&
    (value.groupBy === undefined || typeof value.groupBy === 'string') &&
    (value.timeRangeLabel === undefined || typeof value.timeRangeLabel === 'string') &&
    (value.comparison === undefined || value.comparison === 'none' || value.comparison === 'previous_month')
  );
}

function isRunDataSource(value: unknown): value is NonNullable<RunViewModel['dataSource']> {
  return (
    isRecord(value) &&
    (value.provider === 'mock' || value.provider === 'cloudbase_mysql') &&
    typeof value.name === 'string' &&
    typeof value.typeLabel === 'string' &&
    (value.schema === undefined || typeof value.schema === 'string') &&
    (value.tableCount === undefined || typeof value.tableCount === 'number')
  );
}

function isRunChartData(value: unknown): value is NonNullable<RunViewModel['chartData']> {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    (value.chartType === 'bar' || value.chartType === 'line') &&
    Array.isArray(value.labels) &&
    value.labels.every((label) => typeof label === 'string') &&
    Array.isArray(value.series) &&
    value.series.every(
      (series) =>
        isRecord(series) &&
        typeof series.name === 'string' &&
        Array.isArray(series.values) &&
        series.values.every((item) => typeof item === 'number'),
    ) &&
    (value.summary === undefined || typeof value.summary === 'string')
  );
}

function isRunStep(value: unknown): value is RunViewModel['steps'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isRunStepStatus(value.status) &&
    (value.description === undefined || typeof value.description === 'string') &&
    (value.startedAt === undefined || typeof value.startedAt === 'string') &&
    (value.completedAt === undefined || typeof value.completedAt === 'string') &&
    (value.elapsedMs === undefined || typeof value.elapsedMs === 'number')
  );
}

function isRunToolInvocation(value: unknown): value is RunViewModel['toolInvocations'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.toolId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.displayName === 'string' &&
    isRunToolStatus(value.status) &&
    typeof value.inputSummary === 'string' &&
    typeof value.outputSummary === 'string' &&
    (value.startedAt === undefined || typeof value.startedAt === 'string') &&
    (value.completedAt === undefined || typeof value.completedAt === 'string') &&
    (value.elapsedMs === undefined || typeof value.elapsedMs === 'number')
  );
}

function isRunSource(value: unknown): value is RunSource {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.runId === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.sourceOrder === 'number' &&
    typeof value.title === 'string' &&
    typeof value.preview === 'string' &&
    (value.sourceType === 'knowledge' ||
      value.sourceType === 'tool' ||
      value.sourceType === 'report' ||
      value.sourceType === 'manual') &&
    typeof value.createdAt === 'string'
  );
}

function isRunConclusionSection(value: unknown): value is RunViewModelConclusionSection {
  return (
    isRecord(value) &&
    (value.title === undefined || value.title === null || typeof value.title === 'string') &&
    typeof value.markdownText === 'string' &&
    typeof value.plainText === 'string'
  );
}

function isRunAgentConclusion(value: unknown): value is NonNullable<RunViewModel['agentConclusion']> {
  return (
    isRecord(value) &&
    typeof value.markdownText === 'string' &&
    typeof value.plainText === 'string' &&
    (value.sections === undefined ||
      (Array.isArray(value.sections) && value.sections.every((section) => isRunConclusionSection(section)))) &&
    (value.notice === undefined || value.notice === null || typeof value.notice === 'string') &&
    (value.rawText === undefined || typeof value.rawText === 'string')
  );
}

function isRunModelTrace(value: unknown): value is NonNullable<RunViewModel['modelTrace']> {
  return (
    isRecord(value) &&
    typeof value.selectedModelId === 'string' &&
    (typeof value.provider === 'string' || value.provider === null) &&
    (typeof value.model === 'string' || value.model === null) &&
    (typeof value.latencyMs === 'number' || value.latencyMs === null) &&
    isRecord(value.usage) &&
    isRecord(value.costEstimate) &&
    (value.fallbackReason === null || typeof value.fallbackReason === 'string') &&
    (value.modelErrorType === null || typeof value.modelErrorType === 'string') &&
    isRunConclusionSource(value.conclusionSource)
  );
}

function settleInterruptedRun(run: RunViewModel): RunViewModel {
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

function normalizeRunViewModel(rawValue: unknown, sessionId: string): RunViewModel | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const run = rawValue;
  const steps = run.steps;
  const toolInvocations = run.toolInvocations;
  const sources = run.sources;

  if (
    typeof run.id !== 'string' ||
    (run.sessionId !== undefined && typeof run.sessionId !== 'string') ||
    (run.displayRunId !== undefined && typeof run.displayRunId !== 'string') ||
    !isRunMode(run.mode) ||
    !isRunStatus(run.status) ||
    !isRunIntent(run.intent) ||
    typeof run.prompt !== 'string' ||
    !Array.isArray(steps) ||
    !steps.every((step) => isRunStep(step)) ||
    !Array.isArray(toolInvocations) ||
    (sources !== undefined && (!Array.isArray(sources) || !sources.every((source) => isRunSource(source)))) ||
    !toolInvocations.every((tool) => isRunToolInvocation(tool)) ||
    typeof run.conclusion !== 'string' ||
    !isRunConclusionSource(run.conclusionSource) ||
    !isRunReportState(run.reportState) ||
    typeof run.createdAt !== 'string' ||
    typeof run.updatedAt !== 'string'
  ) {
    return null;
  }

  const restoredRun: RestoredRunAdapterInput = {
    id: run.id,
    sessionId,
    clientRunId: typeof run.clientRunId === 'string' ? run.clientRunId : undefined,
    displayRunId: typeof run.displayRunId === 'string' ? run.displayRunId : undefined,
    mode: run.mode,
    status: run.status,
    intent: run.intent,
    prompt: run.prompt,
    plan: isRunPlan(run.plan) ? run.plan : undefined,
    dataSource: isRunDataSource(run.dataSource) ? run.dataSource : undefined,
    steps,
    toolInvocations,
    sources,
    chartData: isRunChartData(run.chartData) ? run.chartData : undefined,
    conclusion: run.conclusion,
    conclusionSource: run.conclusionSource,
    agentConclusion: isRunAgentConclusion(run.agentConclusion) ? run.agentConclusion : undefined,
    modelTrace: isRunModelTrace(run.modelTrace) ? run.modelTrace : undefined,
    reportState: run.reportState,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: typeof run.startedAt === 'string' ? run.startedAt : undefined,
    completedAt: typeof run.completedAt === 'string' ? run.completedAt : undefined,
    elapsedMs: typeof run.elapsedMs === 'number' ? run.elapsedMs : undefined,
    errorMessage: typeof run.errorMessage === 'string' ? run.errorMessage : undefined,
  };

  return settleInterruptedRun(
    RunViewModelFactory.fromRestoredRunAdapter(restoredRun),
  );
}

function normalizeRunsById(rawValue: unknown, sessionId: string): Record<string, RunViewModel> | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const runsById: Record<string, RunViewModel> = {};

  for (const [runId, rawRun] of Object.entries(rawValue)) {
    const normalizedRun = normalizeRunViewModel(rawRun, sessionId);

    if (!normalizedRun || normalizedRun.id !== runId) {
      return null;
    }

    runsById[runId] = normalizedRun;
  }

  return runsById;
}

export function getSessionLatestRun(session: WorkbenchSession | undefined): RunViewModel | null {
  if (!session?.latestRunId) {
    return null;
  }

  return session.runsById[session.latestRunId] ?? null;
}

export function upsertRunIntoSessions(
  sessions: WorkbenchSession[],
  currentSessionId: string,
  run: RunViewModel,
): WorkbenchSession[] {
  let didUpdate = false;
  const timestamp = Date.now();

  const nextSessions = sessions.map((session) => {
    if (session.id !== currentSessionId) {
      return session;
    }

    didUpdate = true;

    return {
      ...session,
      updatedAt: timestamp,
      runsById: {
        ...session.runsById,
        [run.id]: run,
      },
      latestRunId: run.id,
    };
  });

  return didUpdate ? sortSessionsByUpdatedAt(nextSessions) : sessions;
}

export function sortSessionsByUpdatedAt(sessions: WorkbenchSession[]): WorkbenchSession[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
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

  if (
    typeof session.id !== 'string' ||
    typeof session.title !== 'string' ||
    (session.latestRunId !== undefined && typeof session.latestRunId !== 'string')
  ) {
    return null;
  }

  const runsById = normalizeRunsById(session.runsById, session.id);

  if (!runsById) {
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

export function clearPersistedWorkbenchState(): void {
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
  const defaultState: WorkbenchSessionStorageState = {
    sessions: [],
    activeSessionId: '',
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
  const hasActiveSession =
    !persistedState.activeSessionId ||
    sessions.some((session) => session.id === persistedState.activeSessionId);
  const activeSessionId = hasActiveSession ? persistedState.activeSessionId : '';

  persistWorkbenchSessions(sessions, activeSessionId);

  return {
    sessions,
    activeSessionId,
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

export function isModelProviderId(value: string): value is ModelProviderId {
  return isKnownModelProviderId(value);
}

export function getInitialSelectedModelId(): ModelProviderId {
  if (typeof window === 'undefined') {
    return 'mock-agent';
  }

  window.sessionStorage.removeItem(SELECTED_MODEL_ID_SESSION_KEY);

  return 'mock-agent';
}

const initialSelectedModelId = getInitialSelectedModelId();
const initialSessionState = getInitialWorkbenchSessionState();
const initialSessions = initialSessionState.sessions;
const initialCurrentSession =
  initialSessionState.activeSessionId
    ? initialSessions.find((session) => session.id === initialSessionState.activeSessionId)
    : undefined;
const initialCurrentTaskId = initialCurrentSession?.taskId ?? '';
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
  selectedModelId: ModelProviderId;
}

export const initialWorkbenchState: InitialWorkbenchState = {
  sessions: initialSessions,
  currentSessionId: initialCurrentSession?.id ?? '',
  currentTaskId: initialCurrentTaskId,
  currentPrompt: initialPromptFromSession,
  activeAssistantMessageId: initialActiveAssistantMessageId,
  generationStatus: initialAssistantReplyFromSession ? 'done' : 'idle',
  assistantStream: {
    content: initialAssistantReplyFromSession,
    status: initialAssistantReplyFromSession ? 'done' : 'idle',
  },
  selectedModelId: initialSelectedModelId,
};

export { createSessionTitle };
