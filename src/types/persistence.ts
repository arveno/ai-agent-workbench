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
