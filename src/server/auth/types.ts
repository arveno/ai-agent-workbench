import type { User } from '@supabase/supabase-js';

export type UserRole = 'anonymous' | 'demo_user' | 'admin';

export type QuotaType = 'agent_run';

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

export interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface AgentRunQuotaRow {
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

export interface AgentRunUsageRow {
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
