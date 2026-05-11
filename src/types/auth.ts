import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export type AuthRole = 'anonymous' | 'demo_user';

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
  initializeAuth: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  getAuthSessionView: () => AuthSessionView;
}
