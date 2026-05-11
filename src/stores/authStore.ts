import { create } from 'zustand';
import { useMemo } from 'react';
import { isSupabaseAuthConfigured, supabase } from '@/lib/supabaseClient';
import {
  createAgentAccessUnavailableView,
  createAnonymousAgentAccessView,
  fetchAgentAccessView,
} from '@/services/agentAccessApi';
import type { AuthSessionView, AuthStoreState, AuthStatus } from '@/types/auth';

let authSubscription: { unsubscribe: () => void } | null = null;
let initializeAuthPromise: Promise<void> | null = null;
let agentAccessRequestId = 0;

function toAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return '登录状态处理失败，请稍后重试。';
}

function getDisplayName(email: string | null, status: AuthStatus): string {
  if (email) {
    return email;
  }

  if (status === 'loading') {
    return '登录状态检查中';
  }

  if (status === 'error') {
    return '登录状态异常';
  }

  return '未登录';
}

function createAuthSessionView(state: Pick<AuthStoreState, 'status' | 'user'>): AuthSessionView {
  const email = state.user?.email ?? null;
  const isAuthenticated = state.status === 'authenticated' && state.user !== null;

  return {
    status: state.status,
    userId: state.user?.id ?? null,
    email,
    displayName: getDisplayName(email, state.status),
    role: isAuthenticated ? 'demo_user' : 'anonymous',
    canUseRealAgent: isAuthenticated,
    isAuthConfigured: isSupabaseAuthConfigured,
  };
}

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  status: isSupabaseAuthConfigured ? 'loading' : 'anonymous',
  session: null,
  user: null,
  error: null,
  isInitialized: false,
  agentAccess: createAnonymousAgentAccessView(),
  isAgentAccessLoading: false,
  agentAccessError: null,
  isLoginModalOpen: false,
  openLoginModal: () => {
    set({ isLoginModalOpen: true });
  },
  closeLoginModal: () => {
    set({ isLoginModalOpen: false });
  },

  initializeAuth: async () => {
    if (!isSupabaseAuthConfigured || supabase === null) {
      set({
        status: 'anonymous',
        session: null,
        user: null,
        error: null,
        isInitialized: true,
        agentAccess: createAnonymousAgentAccessView(),
        isAgentAccessLoading: false,
        agentAccessError: null,
        isLoginModalOpen: false,
      });
      return;
    }

    if (get().isInitialized && authSubscription !== null) {
      return;
    }

    if (initializeAuthPromise !== null) {
      return initializeAuthPromise;
    }

    set({ status: 'loading', error: null });

    initializeAuthPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          set({
            status: 'error',
            session: null,
            user: null,
            error: error.message,
            isInitialized: true,
          });
          return;
        }

        set({
          status: data.session ? 'authenticated' : 'anonymous',
          session: data.session,
          user: data.session?.user ?? null,
          error: null,
          isInitialized: true,
        });

        if (data.session) {
          void get().refreshAgentAccess();
        } else {
          get().clearAgentAccess();
        }

        if (authSubscription === null) {
          const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            set({
              status: session ? 'authenticated' : 'anonymous',
              session,
              user: session?.user ?? null,
              error: null,
              isInitialized: true,
            });

            if (session) {
              void get().refreshAgentAccess();
            } else {
              get().clearAgentAccess();
            }
          });

          authSubscription = authListener.subscription;
        }
      } catch (error) {
        set({
          status: 'error',
          session: null,
          user: null,
          error: toAuthErrorMessage(error),
          isInitialized: true,
          agentAccess: createAgentAccessUnavailableView('登录状态检查失败，暂不能读取真实 Agent 额度。'),
          isAgentAccessLoading: false,
          agentAccessError: '登录状态检查失败，暂不能读取真实 Agent 额度。',
        });
      } finally {
        initializeAuthPromise = null;
      }
    })();

    return initializeAuthPromise;
  },

  signInWithPassword: async (email, password) => {
    if (!isSupabaseAuthConfigured || supabase === null) {
      set({
        status: 'anonymous',
        error: 'Supabase Auth 未配置，当前只能使用公开演示模式。',
        isInitialized: true,
        agentAccess: createAnonymousAgentAccessView(),
        isAgentAccessLoading: false,
        agentAccessError: null,
        isLoginModalOpen: false,
      });
      return false;
    }

    set({ status: 'loading', error: null });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        set({
          status: 'anonymous',
          session: null,
          user: null,
          error: error.message,
          isInitialized: true,
          agentAccess: createAnonymousAgentAccessView(),
          isAgentAccessLoading: false,
          agentAccessError: null,
        });
        return false;
      }

      set({
        status: data.session ? 'authenticated' : 'anonymous',
        session: data.session,
        user: data.user,
        error: null,
        isInitialized: true,
        isLoginModalOpen: false,
      });
      await get().refreshAgentAccess();
      return true;
    } catch (error) {
      set({
        status: 'anonymous',
        session: null,
        user: null,
        error: toAuthErrorMessage(error),
        isInitialized: true,
        agentAccess: createAnonymousAgentAccessView(),
        isAgentAccessLoading: false,
        agentAccessError: null,
        isLoginModalOpen: false,
      });
      return false;
    }
  },

  signOut: async () => {
    if (!isSupabaseAuthConfigured || supabase === null) {
      set({
        status: 'anonymous',
        session: null,
        user: null,
        error: null,
        isInitialized: true,
        agentAccess: createAnonymousAgentAccessView(),
        isAgentAccessLoading: false,
        agentAccessError: null,
        isLoginModalOpen: false,
      });
      return true;
    }

    set({ status: 'loading', error: null });

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        set({
          status: get().user ? 'authenticated' : 'anonymous',
          error: error.message,
          isInitialized: true,
        });
        return false;
      }

      set({
        status: 'anonymous',
        session: null,
        user: null,
        error: null,
        isInitialized: true,
        isLoginModalOpen: false,
      });
      get().clearAgentAccess();
      return true;
    } catch (error) {
      set({
        status: get().user ? 'authenticated' : 'anonymous',
        error: toAuthErrorMessage(error),
        isInitialized: true,
      });
      return false;
    }
  },

  refreshAgentAccess: async () => {
    const session = get().session;
    const accessToken = session?.access_token?.trim();
    const userId = session?.user.id ?? null;

    if (!accessToken || !userId) {
      get().clearAgentAccess();
      return;
    }

    const requestId = agentAccessRequestId + 1;
    agentAccessRequestId = requestId;
    set({
      isAgentAccessLoading: true,
      agentAccessError: null,
    });

    const access = await fetchAgentAccessView(accessToken);

    if (requestId !== agentAccessRequestId || get().session?.user.id !== userId) {
      return;
    }

    set({
      agentAccess: access,
      isAgentAccessLoading: false,
      agentAccessError: access.status === 'auth_unavailable' ? access.reason : null,
    });
  },

  clearAgentAccess: () => {
    agentAccessRequestId += 1;
    set({
      agentAccess: createAnonymousAgentAccessView(),
      isAgentAccessLoading: false,
      agentAccessError: null,
    });
  },

  getAuthSessionView: () => createAuthSessionView(get()),
}));

export function useAuthSessionView(): AuthSessionView {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  return useMemo(() => createAuthSessionView({ status, user }), [status, user]);
}
