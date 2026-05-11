import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export type UserRole = 'anonymous' | 'demo_user' | 'admin';

export type AuthRole = Extract<UserRole, 'anonymous' | 'demo_user'>;

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
  quotaType: 'agent_run';
  quotaLimit: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  canUseRealAgent: boolean;
  reason: string;
}

export interface AuthSessionView {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  displayName: string;
  role: AuthRole;
  canUseRealAgent: boolean;
  isAuthConfigured: boolean;
}

export interface AuthStoreState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  error: string | null;
  isInitialized: boolean;
  agentAccess: AgentAccessView;
  isAgentAccessLoading: boolean;
  agentAccessError: string | null;
  initializeAuth: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  refreshAgentAccess: () => Promise<void>;
  clearAgentAccess: () => void;
  getAuthSessionView: () => AuthSessionView;
}
