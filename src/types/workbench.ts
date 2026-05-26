import type { RunSource as WorkbenchRunSource } from './rag';
import type {
  ConversationMode,
  ConversationStatus,
  DemoConversationTemplateRecord,
  ConversationVisibility,
} from './persistence';
import type { RunEvent, RunSnapshot } from './run';
import type { ModelProviderId } from '../utils/modelCatalogMetadata';

export type SessionId = string;

export type {
  ChatBlock,
  ChatBlockType,
  MessageChatBlock,
  ReportConfirmChatBlock,
  RunErrorChatBlock,
  RunStoppedChatBlock,
  StreamingAssistantChatBlock,
} from './chatBlocks';

export type {
  RunChartData,
  RunChartSeries,
  RunChartType,
  RunConclusionSource,
  RunDataSourceSnapshot,
  RunEvent,
  RunIntent,
  RunModelCostEstimate,
  RunModelTrace,
  RunModelTokenUsage,
  RunModelUsage,
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

export type { RunSource, RunSourceType } from './rag';

export type {
  WorkbenchToolCategory,
  WorkbenchToolDefinition,
  WorkbenchToolId,
  WorkbenchToolRiskLevel,
  WorkbenchToolRuntime,
  WorkbenchToolStatus,
} from './toolRegistry';

export type { ModelProviderId } from '../utils/modelCatalogMetadata';

export type TaskId = string;
export type KnowledgeSourceId = string;

export type WorkbenchMessageKind = 'normal' | 'report' | 'partial' | 'error';

export interface WorkbenchMessage {
  id: string;
  clientMessageId?: string;
  role: 'user' | 'assistant';
  kind: WorkbenchMessageKind;
  content: string;
  createdAt: number;
  runId?: string;
  reportSources?: WorkbenchRunSource[];
  reportSourceCount?: number;
}

export interface WorkbenchSession {
  id: SessionId;
  title: string;
  updatedAt: number;
  messages: WorkbenchMessage[];
  taskId?: string;
  runsById: Record<string, RunSnapshot>;
  latestRunId?: string;
  mode?: ConversationMode;
  status?: ConversationStatus;
  visibility?: ConversationVisibility;
  sourceTemplateId?: string;
  isReadOnly?: boolean;
  summary?: string | null;
  messageCount?: number;
}

export type Session = WorkbenchSession;

export interface ExampleTask {
  id: TaskId;
  title: string;
  description: string;
  prompt: string;
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
export type CapabilityStatus =
  | 'available'
  | 'connected'
  | 'active'
  | 'demo'
  | 'readonly'
  | 'not_checked'
  | 'not_configured'
  | 'planned'
  | 'fallback'
  | 'error'
  | 'disabled';
export type ModelProvider = ModelProviderId;
export type ModelTestStatus = 'idle' | 'testing' | 'success' | 'error';
export type DataSourceProviderId = 'mysql';
export type DataSourceConnectionStatus = 'idle' | 'connected' | 'disconnected' | 'testing' | 'error';
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

export interface WorkflowStepDefinition {
  id: string;
  kind: WorkflowStepKind;
  title: string;
  description: string;
  status: WorkflowStepStatus;
  toolName?: string;
  outputSummary?: string;
}

export type ReportActionState = 'pending' | 'generating' | 'generated' | 'skipped' | 'failed';

export interface AssistantStreamState {
  content: string;
  status: MessageStatus;
}

export interface SessionSlice {
  sessions: WorkbenchSession[];
  currentSessionId: string;
  currentTaskId: string;
  currentPrompt: string;
  activeAssistantMessageId: string;
  isConversationListLoading: boolean;
  isCreatingConversation: boolean;
  conversationListError: string | null;
  isMessagesLoading: boolean;
  messagesError: string | null;
  isOlderMessagesLoading: boolean;
  olderMessagesError: string | null;
  hasMoreMessages: boolean;
  oldestMessageCursor: string | null;
  persistenceError: string | null;
  isPersistentMode: boolean;
  persistentUserId: string | null;
  lastRestoredConversationId: string | null;
  persistSessions: (sessions: WorkbenchSession[], activeSessionId?: string) => void;
  createSession: () => Promise<string>;
  switchSession: (sessionId: string) => void;
  setCurrentSessionId: (sessionId: string) => void;
  setCurrentTaskId: (taskId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
  upsertCurrentSessionMessages: (messages: WorkbenchMessage[]) => void;
  updateCurrentSessionAssistantMessage: (messageId: string, content: string) => void;
  appendUserMessageToCurrentSession: (
    content: string,
    options?: {
      runId?: string;
      kind?: WorkbenchMessageKind;
    },
  ) => WorkbenchMessage | null;
  appendAssistantMessageToCurrentSession: (
    content: string,
    options?: {
      runId?: string;
      kind?: WorkbenchMessageKind;
    },
  ) => WorkbenchMessage | null;
  hydratePersistentWorkbench: (params?: { preferredSessionId?: string }) => Promise<string | null>;
  resetPersistentWorkbench: () => void;
  loadPersistentMessagesForSession: (sessionId: string) => Promise<void>;
  loadOlderMessagesForCurrentSession: () => Promise<void>;
  ensureCurrentPersistentConversation: () => Promise<string | null>;
  persistMessageToConversation: (
    conversationId: string,
    message: WorkbenchMessage,
    options?: {
      persistedRunId?: string | null;
    },
  ) => Promise<void>;
  hydrateFromUrl: (state: { sessionId?: string; taskId?: string }) => void;
}

export interface GenerationSlice {
  generationStatus: GenerationStatus;
  errorMessage?: string;
  realModelNotice: string;
  assistantStream: AssistantStreamState;
  confirmStatus: ConfirmStatus;
  streamRunId: number;
  sendPrompt: (prompt: string) => void;
  runMockPrompt: (prompt: string) => Promise<void>;
  runAgentStepsPreview: (runId: number) => Promise<void>;
  generateReportForRun: (runId: string) => void;
  skipReportForRun: (runId: string) => void;
  stopGenerating: () => void;
}

export interface ModelSlice {
  selectedModelId: ModelProvider;
  isModelModalOpen: boolean;
  openModelModal: () => void;
  closeModelModal: () => void;
  setSelectedModelId: (selectedModelId: ModelProviderId) => void;
}

export interface UiSlice {
  isDataSourceModalOpen: boolean;
  isToolLibraryModalOpen: boolean;
  isWorkflowModalOpen: boolean;
  chatDraft: string;
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
}

export interface RunSlice {
  currentRun: RunSnapshot | null;
  selectedRunId: string | null;
  runEventLog: RunEvent[];
  isLatestRunLoading: boolean;
  latestRunError: string | null;
  isRunEventsLoading: boolean;
  runEventsError: string | null;
  isReportArtifactsLoading: boolean;
  reportArtifactsError: string | null;
  isRagSourcesLoading: boolean;
  ragSourcesError: string | null;
  setCurrentRun: (run: RunSnapshot | null) => void;
  clearCurrentRun: () => void;
  applyRunEvent: (event: RunEvent) => void;
  selectRunForCurrentSession: (runId: string) => Promise<void>;
  loadLatestRunForConversation: (conversationId: string) => Promise<void>;
  loadReportArtifacts: (conversationId: string) => Promise<void>;
  loadRagRetrievals: (runId: string) => Promise<void>;
  saveReportArtifact: (params: {
    conversationId: string;
    runId: string;
    title: string;
    contentMarkdown: string;
  }) => Promise<void>;
}

export interface DemoTemplateSlice {
  demoConversations: DemoConversationTemplateRecord[];
  isDemoConversationsLoading: boolean;
  demoConversationsError: string | null;
  isCopyingDemoTemplate: boolean;
  copyDemoTemplateError: string | null;
  loadDemoConversations: () => Promise<void>;
  retryLoadDemoConversations: () => Promise<void>;
  openDemoConversationTemplate: (templateId: string) => string | null;
  copyDemoConversationTemplate: (templateId: string) => Promise<string | null>;
}

export type WorkbenchStore =
  SessionSlice &
  GenerationSlice &
  ModelSlice &
  UiSlice &
  RunSlice &
  DemoTemplateSlice;
