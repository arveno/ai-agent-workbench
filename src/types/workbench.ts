export type SessionId = string;
import type { RunEvent, RunSnapshot } from './run';

export type {
  RunChartData,
  RunChartSeries,
  RunChartType,
  RunConclusionSource,
  RunDataSourceSnapshot,
  RunEvent,
  RunIntent,
  RunMode,
  RunPlanSnapshot,
  RunReportState,
  RunSnapshot,
  RunStatus,
  RunStep,
  RunStepStatus,
  RunToolInvocation,
  RunToolStatus,
} from './run';

export type { RagSourceChunk } from './rag';

export type {
  WorkbenchToolCategory,
  WorkbenchToolDefinition,
  WorkbenchToolId,
  WorkbenchToolRiskLevel,
  WorkbenchToolRuntime,
  WorkbenchToolStatus,
} from './toolRegistry';

export type TaskId = string;
export type ToolCallId = string;
export type KnowledgeSourceId = string;

export type AgentStepStatus = 'pending' | 'running' | 'success' | 'error';

export interface WorkbenchMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface WorkbenchSession {
  id: SessionId;
  title: string;
  updatedAt: number;
  messages: WorkbenchMessage[];
  taskId?: string;
}

export type Session = WorkbenchSession;

export interface ExampleTask {
  id: TaskId;
  title: string;
  description: string;
  prompt: string;
}

export interface AgentStep {
  id: string;
  title: string;
  status: AgentStepStatus;
}

export interface ToolCall {
  id: ToolCallId;
  title: string;
  toolName: string;
  params: string;
  result: string;
  status: 'success' | 'running' | 'error';
}

export interface KnowledgeSource {
  id: KnowledgeSourceId;
  title: string;
  summary: string;
  matchRate: number;
}

export interface AnalyticsResult {
  kpis: {
    averageScore: number;
    attendanceRate: number;
    abnormalCount: number;
  };
  gradeScores: Array<{
    grade: string;
    value: number;
  }>;
}

export type ChatMessage = WorkbenchMessage;

export type MessageStatus = 'idle' | 'streaming' | 'done' | 'stopped';
export type GenerationStatus = 'idle' | 'streaming' | 'done' | 'stopped' | 'error';
export type ConfirmStatus = 'waiting' | 'confirmed' | 'cancelled';
export type ModelProviderId =
  | 'mock'
  | 'groq'
  | 'gemini'
  | 'openrouter'
  | 'openai-api-key'
  | 'codex-oauth'
  | 'ollama';
export type ModelProvider = ModelProviderId;
export type ModelTestStatus = 'idle' | 'testing' | 'success' | 'error';
export type DataSourceProviderId = 'postgresql' | 'supabase' | 'mysql';
export type DataSourceConnectionStatus = 'idle' | 'connected' | 'disconnected' | 'testing' | 'error';
export type DataSourceTestableProviderId = Extract<DataSourceProviderId, 'postgresql' | 'supabase'>;
export type ToolRiskLevel = 'low' | 'medium' | 'high';
export type ToolStatus = 'enabled' | 'disabled' | 'comingSoon';
export type WorkflowStepStatus = 'ready' | 'running' | 'done' | 'waiting' | 'disabled';
export type WorkflowStepKind =
  | 'input'
  | 'intent'
  | 'schema'
  | 'toolSelect'
  | 'toolExecute'
  | 'chart'
  | 'answer'
  | 'runDisplay';

export interface DataSourceProvider {
  id: DataSourceProviderId;
  name: string;
  description: string;
  relationHint?: string;
  demoBadgeText?: string;
  status: DataSourceConnectionStatus;
  enabled: boolean;
  comingSoon?: boolean;
  meta: {
    connectionMode: string;
    database?: string;
    schemas?: string[];
    tableCount?: number;
    rowCountLabel?: string;
    updatedAt?: string;
  };
}

export interface DataSourceTestSuccessResponse {
  ok: true;
  provider: DataSourceTestableProviderId;
  status: 'connected';
  elapsedMs: number;
  serverTime: string;
  databaseVersion?: string;
}

export interface DataSourceTestErrorResponse {
  ok: false;
  provider?: DataSourceTestableProviderId;
  status: 'error';
  errorMessage: string;
  elapsedMs?: number;
}

export type DataSourceTestResponse = DataSourceTestSuccessResponse | DataSourceTestErrorResponse;

export interface DataSourceColumnSchema {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
}

export interface DataSourceTableSchema {
  schema: string;
  tableName: string;
  columns: DataSourceColumnSchema[];
}

export interface DataSourceSchemaSuccessResponse {
  ok: true;
  provider: DataSourceTestableProviderId;
  status: 'success';
  elapsedMs: number;
  readAt: string;
  schemas: string[];
  tableCount: number;
  tables: DataSourceTableSchema[];
}

export interface DataSourceSchemaErrorResponse {
  ok: false;
  provider?: DataSourceTestableProviderId;
  status: 'error';
  errorMessage: string;
  elapsedMs?: number;
}

export type DataSourceSchemaResponse = DataSourceSchemaSuccessResponse | DataSourceSchemaErrorResponse;

export interface AgentToolDefinition {
  id: string;
  name: string;
  description: string;
  status: ToolStatus;
  riskLevel: ToolRiskLevel;
  category: 'schema' | 'query' | 'analysis' | 'render' | 'knowledge' | 'report';
  inputSummary: string;
  outputSummary: string;
}

export interface WorkflowStepDefinition {
  id: string;
  kind: WorkflowStepKind;
  title: string;
  description: string;
  status: WorkflowStepStatus;
  toolName?: string;
  outputSummary?: string;
}

export type AgentRunStatus = 'running' | 'success' | 'error';
export type AgentRunPlanIntent = 'capability_intro' | 'data_analysis' | 'unsupported';
export type ReportActionState = 'pending' | 'generated' | 'skipped';

export type AgentRunStepStatus = 'pending' | 'running' | 'success' | 'error';

export interface AgentRunStep {
  id: string;
  title: string;
  status: AgentRunStepStatus;
  description?: string;
  elapsedMs?: number;
}

export interface AgentToolInvocationResult {
  id: string;
  toolId: string;
  toolName: string;
  status: 'success' | 'error';
  inputSummary: string;
  outputSummary: string;
  elapsedMs: number;
}

export interface AgentRunChartData {
  title: string;
  chartType: 'bar' | 'line';
  labels: string[];
  values: number[];
  summary: string;
}

export type AgentConclusionSource = 'model' | 'fallback';

export interface AgentRunPlanView {
  intent: AgentRunPlanIntent;
  shouldUseDataAnalysis: boolean;
  reason: string;
  metric?: 'avg_score' | 'attendance_rate' | 'homework_completion_rate' | 'abnormal_count';
  groupBy?: 'subject' | 'metric_month';
  timeRange?: {
    type: 'month' | 'latest_available_month' | 'none';
    month?: string;
    label?: string;
  };
  comparison?: 'none' | 'previous_month';
}

export interface AgentRunResult {
  id: string;
  status: AgentRunStatus;
  prompt: string;
  provider: DataSourceTestableProviderId;
  plan?: AgentRunPlanView;
  steps: AgentRunStep[];
  toolInvocations: AgentToolInvocationResult[];
  chartData?: AgentRunChartData;
  conclusion: string;
  conclusionSource: AgentConclusionSource;
  conclusionNotice?: string;
  createdAt: string;
  elapsedMs: number;
}

export interface AgentRunSuccessResponse {
  ok: true;
  run: AgentRunResult;
}

export interface AgentRunErrorResponse {
  ok: false;
  errorMessage: string;
}

export type AgentRunResponse = AgentRunSuccessResponse | AgentRunErrorResponse;

export interface ModelProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
}

export type ModelProviderConfigMap = Partial<Record<ModelProviderId, ModelProviderConfig>>;
export type ModelProviderTestStatusMap = Partial<Record<ModelProviderId, ModelTestStatus>>;

export interface ModelProviderOption {
  id: ModelProviderId;
  name: string;
  description: string;
  status: 'active' | 'available' | 'reserved';
}

export interface AssistantStreamState {
  content: string;
  status: MessageStatus;
}

export interface FinalMessage {
  content: string;
  status: 'hidden' | 'visible';
}

export interface SessionSlice {
  sessions: WorkbenchSession[];
  currentSessionId: string;
  currentTaskId: string;
  currentPrompt: string;
  activeAssistantMessageId: string;
  persistSessions: (sessions: WorkbenchSession[]) => void;
  createSession: () => string;
  switchSession: (sessionId: string) => void;
  setCurrentSessionId: (sessionId: string) => void;
  setCurrentTaskId: (taskId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
  upsertCurrentSessionMessages: (messages: WorkbenchMessage[]) => void;
  updateCurrentSessionAssistantMessage: (messageId: string, content: string) => void;
  appendUserMessageToCurrentSession: (content: string) => void;
  appendAssistantMessageToCurrentSession: (content: string) => void;
  startTask: (taskId: string, prompt: string) => void;
  hydrateFromUrl: (state: { sessionId?: string; taskId?: string }) => void;
}

export interface GenerationSlice {
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
  streamRunId: number;
  sendPrompt: (prompt: string) => void;
  regenerateFromAssistantMessage: (assistantMessageId: string) => void;
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
  stopGenerating: () => void;
  regenerate: () => Promise<void>;
  startAssistantStream: () => Promise<void>;
}

export interface ModelSlice {
  currentModelProvider: ModelProvider;
  isModelModalOpen: boolean;
  modelConfigs: ModelProviderConfigMap;
  modelTestStatusMap: ModelProviderTestStatusMap;
  openModelModal: () => void;
  closeModelModal: () => void;
  setCurrentModelProvider: (provider: ModelProviderId) => void;
  saveModelConfig: (providerId: ModelProviderId, config: ModelProviderConfig) => void;
  clearModelConfig: (providerId: ModelProviderId) => void;
  setModelTestStatus: (providerId: ModelProviderId, status: ModelTestStatus) => void;
}

export interface UiSlice {
  isDataSourceModalOpen: boolean;
  isToolLibraryModalOpen: boolean;
  isWorkflowModalOpen: boolean;
  chatDraft: string;
  currentAgentRun: AgentRunResult | null;
  agentRunStatus: 'idle' | 'running' | 'success' | 'error' | 'stopped';
  agentRunErrorMessage: string | null;
  activeAgentRunRequestId: string | null;
  activeAgentRunAbortController: AbortController | null;
  currentReportRunId: string | null;
  reportActionState: ReportActionState;
  openDataSourceModal: () => void;
  closeDataSourceModal: () => void;
  openToolLibraryModal: () => void;
  closeToolLibraryModal: () => void;
  openWorkflowModal: () => void;
  closeWorkflowModal: () => void;
  setChatDraft: (value: string) => void;
  clearChatDraft: () => void;
  runCurrentAgentAnalysis: (promptOverride?: string) => Promise<void>;
  clearCurrentAgentRun: () => void;
}

export interface RunSlice {
  currentRun: RunSnapshot | null;
  runEventLog: RunEvent[];
  setCurrentRun: (run: RunSnapshot | null) => void;
  clearCurrentRun: () => void;
  applyRunEvent: (event: RunEvent) => void;
}

export type WorkbenchStore = SessionSlice & GenerationSlice & ModelSlice & UiSlice & RunSlice;
