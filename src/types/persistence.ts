export type JsonObject = Record<string, unknown>;

export type ConversationMode = 'mock' | 'agent' | 'mixed';
export type ConversationStatus = 'active' | 'running' | 'completed' | 'failed' | 'archived';
export type ConversationVisibility = 'private' | 'demo' | 'system';

export interface ConversationRecord {
  id: string;
  user_id: string;
  title: string;
  summary: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  visibility: ConversationVisibility;
  source_template_id: string | null;
  latest_run_id: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  metadata: JsonObject;
}

export interface ConversationCreateInput {
  title?: string;
  mode?: ConversationMode;
  summary?: string;
  metadata?: JsonObject;
}

export interface ConversationUpdateInput {
  title?: string;
  summary?: string | null;
  status?: ConversationStatus;
  metadata?: JsonObject;
  archived_at?: string | null;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageKind = 'text' | 'tool_summary' | 'report' | 'error' | 'system_notice';
export type MessageStatus = 'pending' | 'streaming' | 'completed' | 'failed';

export interface MessageRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  run_id: string | null;
  client_message_id: string | null;
  status: MessageStatus;
  created_at: string;
  metadata: JsonObject;
}

export interface MessageCreateInput {
  role: MessageRole;
  kind?: MessageKind;
  content: string;
  runId?: string | null;
  clientMessageId?: string | null;
  status?: MessageStatus;
  metadata?: JsonObject;
}

export type DemoTemplateCategory = 'intro' | 'analysis' | 'report' | 'rag' | 'long_context' | 'fallback';
export type DemoRecommendedMode = 'mock' | 'agent';
export type DemoTemplateVisibility = 'demo' | 'system';

export interface DemoTaskTemplateRecord {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: DemoTemplateCategory;
  recommended_mode: DemoRecommendedMode;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface DemoSeedMessage {
  role: MessageRole;
  kind?: MessageKind;
  content: string;
  status?: MessageStatus;
  metadata?: JsonObject;
}

export interface DemoConversationTemplateRecord {
  id: string;
  title: string;
  description: string;
  category: DemoTemplateCategory;
  visibility: DemoTemplateVisibility;
  seed_messages: DemoSeedMessage[];
  seed_runs: JsonObject[];
  seed_reports: JsonObject[];
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface ConversationListResult {
  conversations: ConversationRecord[];
  nextCursor: string | null;
}

export interface MessageListResult {
  messages: MessageRecord[];
  nextCursor: string | null;
}

export interface DemoTaskTemplateListResult {
  tasks: DemoTaskTemplateRecord[];
}

export interface DemoConversationTemplateListResult {
  conversations: DemoConversationTemplateRecord[];
}

export interface DemoConversationCopyResult {
  conversation: ConversationRecord;
  messages: MessageRecord[];
}

export type AgentRunRecordMode = 'mock' | 'agent';
export type AgentRunRecordStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

export interface AgentRunRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  usage_id: string | null;
  runtime_run_id: string | null;
  mode: AgentRunRecordMode;
  status: AgentRunRecordStatus;
  intent: string | null;
  prompt: string | null;
  plan: JsonObject;
  data_source_snapshot: JsonObject;
  chart_data: JsonObject;
  conclusion: string | null;
  conclusion_source: string | null;
  report_state: string | null;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  error_message: string | null;
  metadata: JsonObject;
}

export interface RunEventRecord {
  id: string;
  run_id: string;
  conversation_id: string;
  user_id: string;
  seq: number;
  event_type: string;
  payload: JsonObject;
  created_at: string;
}

export type ToolInvocationRecordStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ToolInvocationRecord {
  id: string;
  run_id: string;
  conversation_id: string;
  user_id: string;
  tool_name: string;
  display_name: string;
  status: ToolInvocationRecordStatus;
  input: JsonObject;
  input_summary: string | null;
  output: JsonObject;
  output_summary: string | null;
  started_at: string;
  finished_at: string | null;
  elapsed_ms: number | null;
  error: string | null;
  metadata: JsonObject;
}

export type ReportArtifactStatus = 'draft' | 'generated' | 'archived';

export interface ReportArtifactRecord {
  id: string;
  conversation_id: string;
  run_id: string | null;
  user_id: string;
  title: string;
  content_markdown: string;
  status: ReportArtifactStatus;
  version: number;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export type KnowledgeVisibility = 'private' | 'demo' | 'system';
export type KnowledgeSourceType = 'policy' | 'faq' | 'guide' | 'dataset_doc';
export type KnowledgeStatus = 'active' | 'disabled' | 'archived';

export interface KnowledgeSourceRecord {
  id: string;
  user_id: string | null;
  visibility: KnowledgeVisibility;
  name: string;
  type: KnowledgeSourceType;
  status: KnowledgeStatus;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface KnowledgeDocumentRecord {
  id: string;
  source_id: string;
  user_id: string | null;
  visibility: KnowledgeVisibility;
  title: string;
  uri: string | null;
  mime_type: string;
  status: KnowledgeStatus;
  content_text: string | null;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface KnowledgeChunkRecord {
  id: string;
  document_id: string;
  source_id: string;
  user_id: string | null;
  visibility: KnowledgeVisibility;
  chunk_index: number;
  content: string;
  content_tsv: unknown | null;
  metadata: JsonObject;
  created_at: string;
}

export interface RagSourceCitationRecord {
  citationId: string;
  chunkId: string;
  documentId: string;
  sourceId: string;
  title: string;
  sourceName: string;
  content: string;
  score: number;
}

export interface RagRetrievalLogRecord {
  id: string;
  run_id: string | null;
  conversation_id: string;
  user_id: string;
  query: string;
  top_k: number;
  results: RagSourceCitationRecord[];
  latency_ms: number | null;
  created_at: string;
  metadata: JsonObject;
}

export interface LatestRunResult {
  run: AgentRunRecord | null;
}

export interface RunEventListResult {
  events: RunEventRecord[];
}

export interface ToolInvocationListResult {
  tools: ToolInvocationRecord[];
}

export interface RagRetrievalLogListResult {
  retrievals: RagRetrievalLogRecord[];
}

export interface ReportArtifactListResult {
  reports: ReportArtifactRecord[];
}

export interface ReportArtifactCreateInput {
  conversationId: string;
  title: string;
  contentMarkdown: string;
  runtimeRunId?: string | null;
  metadata?: JsonObject;
}

export interface ReportArtifactCreateResult {
  report: ReportArtifactRecord;
}

export type WorkbenchPersistenceErrorCode =
  | 'auth_required'
  | 'auth_unavailable'
  | 'db_error'
  | 'invalid_request'
  | 'method_not_allowed'
  | 'not_found';

export interface WorkbenchPersistenceErrorResponse {
  ok: false;
  errorCode: WorkbenchPersistenceErrorCode;
  message: string;
}

export interface WorkbenchPersistenceSuccessResponse<TData> {
  ok: true;
  data: TData;
}

export type WorkbenchPersistenceResponse<TData> =
  | WorkbenchPersistenceSuccessResponse<TData>
  | WorkbenchPersistenceErrorResponse;
