export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export type UserRole = 'anonymous' | 'demo_user' | 'admin';

export type AuthRole = UserRole;

export type AuthProvider = 'cloudbase' | 'none';

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

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  provider: Exclude<AuthProvider, 'none'>;
  role: UserRole;
}

export interface AuthSession {
  access_token: string;
  user: AuthUser;
  provider: Exclude<AuthProvider, 'none'>;
}

export interface CloudBaseCurrentUser {
  userId: string;
  openid: string | null;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  isAnonymous: boolean;
}

export interface AuthStoreState {
  status: AuthStatus;
  session: AuthSession | null;
  user: AuthUser | null;
  currentUser: CloudBaseCurrentUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  authProvider: AuthProvider;
  error: string | null;
  isInitialized: boolean;
  agentAccess: AgentAccessView;
  isAgentAccessLoading: boolean;
  agentAccessError: string | null;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  initializeAuth: () => Promise<void>;
  signInWithPassword: (username: string, password: string) => Promise<boolean>;
  signUpWithUsername: (username: string, password: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  refreshAgentAccess: () => Promise<void>;
  clearAgentAccess: () => void;
  getAuthSessionView: () => AuthSessionView;
}
