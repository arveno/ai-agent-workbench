import type { User } from '@supabase/supabase-js';
import type {
  AgentRunRecord,
  ConversationRecord,
  DemoConversationTemplateRecord,
  DemoTaskTemplateRecord,
  MessageRecord,
  ReportArtifactRecord,
  RunEventRecord,
  ToolInvocationRecord,
} from '../../types/persistence';

export type UserRole = 'anonymous' | 'demo_user' | 'admin';

export type QuotaType = 'agent_run';

export type AgentRunUsageFinalStatus = 'completed' | 'failed' | 'stopped';

export type AgentRunQuotaConsumeStatus =
  | 'allowed'
  | 'quota_exceeded'
  | 'forbidden'
  | 'auth_unavailable'
  | 'quota_unavailable';

export type AgentAccessStatus =
  | 'anonymous'
  | 'allowed'
  | 'auth_required'
  | 'quota_exceeded'
  | 'forbidden'
  | 'auth_unavailable';

export interface AgentAccessView {
  status: AgentAccessStatus;
  userId: string | null;
  email: string | null;
  role: UserRole;
  quotaType: QuotaType;
  quotaLimit: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  canUseRealAgent: boolean;
  reason: string;
}

export interface ProfileRow extends Record<string, unknown> {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface AgentRunQuotaRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  quota_type: QuotaType;
  quota_limit: number;
  quota_used: number;
  period_start: string;
  period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunUsageRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  run_id: string | null;
  quota_type: QuotaType;
  status: 'started' | 'completed' | 'failed' | 'stopped';
  started_at: string;
  finished_at: string | null;
  error_code: string | null;
  metadata: Record<string, unknown>;
}

export interface ConversationRow extends ConversationRecord, Record<string, unknown> {}

export interface MessageRow extends MessageRecord, Record<string, unknown> {}

export interface DemoTaskTemplateRow extends DemoTaskTemplateRecord, Record<string, unknown> {}

export interface DemoConversationTemplateRow extends DemoConversationTemplateRecord, Record<string, unknown> {}

export interface AgentRunRow extends AgentRunRecord, Record<string, unknown> {}

export interface RunEventRow extends RunEventRecord, Record<string, unknown> {}

export interface ToolInvocationRow extends ToolInvocationRecord, Record<string, unknown> {}

export interface ReportArtifactRow extends ReportArtifactRecord, Record<string, unknown> {}

export interface ServerAuthDatabase {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & Pick<ProfileRow, 'id'>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      agent_run_quota: {
        Row: AgentRunQuotaRow;
        Insert: Partial<AgentRunQuotaRow> & Pick<AgentRunQuotaRow, 'user_id'>;
        Update: Partial<AgentRunQuotaRow>;
        Relationships: [];
      };
      agent_run_usage: {
        Row: AgentRunUsageRow;
        Insert: Partial<AgentRunUsageRow> & Pick<AgentRunUsageRow, 'user_id' | 'status'>;
        Update: Partial<AgentRunUsageRow>;
        Relationships: [];
      };
      conversations: {
        Row: ConversationRow;
        Insert: Partial<ConversationRow> & Pick<ConversationRow, 'user_id'>;
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Partial<MessageRow> & Pick<MessageRow, 'conversation_id' | 'user_id' | 'role'>;
        Update: Partial<MessageRow>;
        Relationships: [];
      };
      demo_task_templates: {
        Row: DemoTaskTemplateRow;
        Insert: Partial<DemoTaskTemplateRow> & Pick<DemoTaskTemplateRow, 'title' | 'prompt' | 'category'>;
        Update: Partial<DemoTaskTemplateRow>;
        Relationships: [];
      };
      demo_conversation_templates: {
        Row: DemoConversationTemplateRow;
        Insert: Partial<DemoConversationTemplateRow> & Pick<DemoConversationTemplateRow, 'title' | 'category'>;
        Update: Partial<DemoConversationTemplateRow>;
        Relationships: [];
      };
      agent_runs: {
        Row: AgentRunRow;
        Insert: Partial<AgentRunRow> & Pick<AgentRunRow, 'conversation_id' | 'user_id'>;
        Update: Partial<AgentRunRow>;
        Relationships: [];
      };
      run_events: {
        Row: RunEventRow;
        Insert: Partial<RunEventRow> & Pick<RunEventRow, 'run_id' | 'conversation_id' | 'user_id' | 'seq' | 'event_type'>;
        Update: Partial<RunEventRow>;
        Relationships: [];
      };
      tool_invocations: {
        Row: ToolInvocationRow;
        Insert: Partial<ToolInvocationRow> & Pick<ToolInvocationRow, 'run_id' | 'conversation_id' | 'user_id' | 'tool_name' | 'display_name'>;
        Update: Partial<ToolInvocationRow>;
        Relationships: [];
      };
      report_artifacts: {
        Row: ReportArtifactRow;
        Insert: Partial<ReportArtifactRow> & Pick<ReportArtifactRow, 'conversation_id' | 'user_id' | 'title' | 'content_markdown'>;
        Update: Partial<ReportArtifactRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      consume_agent_run_quota: {
        Args: {
          p_user_id: string;
          p_run_id: string;
          p_metadata?: Record<string, unknown>;
        };
        Returns: Array<{
          ok: boolean;
          status: string;
          quota_limit: number | null;
          quota_used: number | null;
          quota_remaining: number | null;
          usage_id: string | null;
          reason: string;
        }>;
      };
      finish_agent_run_usage: {
        Args: {
          p_usage_id: string;
          p_status: AgentRunUsageFinalStatus;
          p_error_code?: string | null;
          p_metadata?: Record<string, unknown>;
        };
        Returns: Array<{
          ok: boolean;
          status: string;
          reason: string;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface VerifiedSupabaseUser {
  userId: string;
  email: string | null;
  user: User;
}

export type VerifySupabaseAccessTokenResult =
  | {
      ok: true;
      user: VerifiedSupabaseUser;
    }
  | {
      ok: false;
      errorCode: 'auth_unavailable' | 'invalid_token';
      message: string;
    };
