import { useMemo } from 'react';
import { create } from 'zustand';
import { isSupabaseAuthConfigured, supabase } from '@/lib/supabaseClient';
import {
  createAgentAccessUnavailableView,
  createAnonymousAgentAccessView,
  fetchAgentAccessView,
} from '@/services/agentAccessApi';
import { buildApiPath, isCloudBasePrivateApiEnabled, requestCloudBasePrivateApi } from '@/services/cloudbaseApiClient';
import {
  ensureCloudBaseAccessToken,
  getCloudBaseSession,
  initCloudBaseAuth,
  isCloudBaseAuthConfigured,
  signInCloudBaseAnonymously,
  signOutCloudBase,
} from '@/services/cloudbaseAuthClient';
import type {
  AuthProvider,
  AuthSession,
  AuthSessionView,
  AuthStatus,
  AuthStoreState,
  AuthUser,
  CloudBaseCurrentUser,
  UserRole,
} from '@/types/auth';

let authSubscription: { unsubscribe: () => void } | null = null;
let initializeAuthPromise: Promise<void> | null = null;
let agentAccessRequestId = 0;

interface AuthMeResponse {
  ok?: boolean;
  data?: {
    currentUser?: unknown;
  };
  errorCode?: string;
  message?: string;
}

function toAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return '登录状态处理失败，请稍后重试。';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRole(value: unknown): UserRole {
  return value === 'admin' || value === 'demo_user' ? value : 'demo_user';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeCloudBaseCurrentUser(value: unknown): CloudBaseCurrentUser {
  if (!isRecord(value)) {
    throw new Error('CloudBase currentUser response is invalid.');
  }

  const userId = readNullableString(value.userId) ?? readNullableString(value.user_id);

  if (!userId) {
    throw new Error('CloudBase currentUser is missing userId.');
  }

  const displayName =
    readNullableString(value.displayName) ??
    readNullableString(value.display_name) ??
    readNullableString(value.name) ??
    null;

  return {
    userId,
    openid: readNullableString(value.openid) ?? readNullableString(value._openid),
    email: readNullableString(value.email),
    displayName,
    role: normalizeRole(value.role),
    isAnonymous: value.isAnonymous === false || value.is_anonymous === false ? false : true,
  };
}

async function fetchCloudBaseCurrentUser(accessToken: string): Promise<CloudBaseCurrentUser> {
  const response = await requestCloudBasePrivateApi(buildApiPath('/api/auth/me'), {
    method: 'GET',
    accessToken,
  });
  const payload = (await response.json().catch(() => null)) as AuthMeResponse | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || 'CloudBase auth-me request failed.');
  }

  return normalizeCloudBaseCurrentUser(payload?.data?.currentUser);
}

function createAuthUser(params: {
  id: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  provider: Exclude<AuthProvider, 'none'>;
  role: UserRole;
}): AuthUser {
  return {
    id: params.id,
    email: params.email,
    displayName: params.displayName,
    isAnonymous: params.isAnonymous,
    provider: params.provider,
    role: params.role,
  };
}

function createAuthSession(accessToken: string, user: AuthUser): AuthSession {
  return {
    access_token: accessToken,
    user,
    provider: user.provider,
  };
}

function getDisplayName(user: AuthUser | null, status: AuthStatus): string {
  if (user?.displayName) {
    return user.displayName;
  }

  if (user?.email) {
    return user.email;
  }

  if (user?.isAnonymous && user.provider === 'cloudbase') {
    return 'CloudBase 匿名用户';
  }

  if (status === 'loading') {
    return '登录状态检查中';
  }

  if (status === 'error') {
    return '登录状态异常';
  }

  return '未登录';
}

function createAuthSessionView(
  state: Pick<AuthStoreState, 'status' | 'user' | 'currentUser' | 'authProvider'>,
): AuthSessionView {
  const user = state.user;
  const role = state.currentUser?.role ?? user?.role ?? 'anonymous';
  const isAuthenticated = state.status === 'authenticated' && user !== null;

  return {
    status: state.status,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    displayName: getDisplayName(user, state.status),
    role: isAuthenticated ? role : 'anonymous',
    canUseRealAgent: isAuthenticated,
    isAuthConfigured: state.authProvider === 'cloudbase' ? isCloudBaseAuthConfigured() : isSupabaseAuthConfigured,
  };
}

function createAnonymousState() {
  return {
    status: 'anonymous' as const,
    session: null,
    user: null,
    currentUser: null,
    accessToken: null,
    isAuthenticated: false,
    isAnonymous: true,
    authProvider: 'none' as const,
    error: null,
    isInitialized: true,
    agentAccess: createAnonymousAgentAccessView(),
    isAgentAccessLoading: false,
    agentAccessError: null,
    isLoginModalOpen: false,
  };
}

async function resolveCloudBaseSession(): Promise<{
  session: AuthSession;
  user: AuthUser;
  currentUser: CloudBaseCurrentUser;
  accessToken: string;
}> {
  initCloudBaseAuth();

  const initialSession = await getCloudBaseSession();
  const initialToken = initialSession.error ? null : initialSession.data.session?.access_token?.trim() || null;

  if (!initialToken) {
    const signInResult = await signInCloudBaseAnonymously();

    if (signInResult.error) {
      throw new Error(toAuthErrorMessage(signInResult.error));
    }
  }

  const accessToken = await ensureCloudBaseAccessToken();
  const currentUser = await fetchCloudBaseCurrentUser(accessToken);
  const user = createAuthUser({
    id: currentUser.userId,
    email: currentUser.email,
    displayName: currentUser.displayName,
    isAnonymous: currentUser.isAnonymous,
    provider: 'cloudbase',
    role: currentUser.role,
  });

  return {
    session: createAuthSession(accessToken, user),
    user,
    currentUser,
    accessToken,
  };
}

function unsubscribeLegacyAuth() {
  authSubscription?.unsubscribe();
  authSubscription = null;
}

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  status: isCloudBasePrivateApiEnabled() ? 'loading' : isSupabaseAuthConfigured ? 'loading' : 'anonymous',
  session: null,
  user: null,
  currentUser: null,
  accessToken: null,
  isAuthenticated: false,
  isAnonymous: true,
  authProvider: isCloudBasePrivateApiEnabled() ? 'cloudbase' : 'supabase',
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
    if (!isCloudBasePrivateApiEnabled()) {
      if (!isSupabaseAuthConfigured || supabase === null) {
        set(createAnonymousState());
        return;
      }

      if (get().isInitialized && authSubscription !== null) {
        return;
      }

      if (initializeAuthPromise !== null) {
        return initializeAuthPromise;
      }

      set({ status: 'loading', error: null, authProvider: 'supabase' });

      initializeAuthPromise = (async () => {
        try {
          const { data, error } = await supabase.auth.getSession();

          if (error) {
            set({
              status: 'error',
              session: null,
              user: null,
              currentUser: null,
              accessToken: null,
              isAuthenticated: false,
              isAnonymous: true,
              authProvider: 'supabase',
              error: error.message,
              isInitialized: true,
            });
            return;
          }

          const legacyUser = data.session?.user
            ? createAuthUser({
                id: data.session.user.id,
                email: data.session.user.email ?? null,
                displayName: data.session.user.email ?? null,
                isAnonymous: false,
                provider: 'supabase',
                role: 'demo_user',
              })
            : null;
          const legacySession = data.session && legacyUser
            ? createAuthSession(data.session.access_token, legacyUser)
            : null;

          set({
            status: legacySession ? 'authenticated' : 'anonymous',
            session: legacySession,
            user: legacyUser,
            currentUser: null,
            accessToken: legacySession?.access_token ?? null,
            isAuthenticated: Boolean(legacySession),
            isAnonymous: !legacySession,
            authProvider: 'supabase',
            error: null,
            isInitialized: true,
          });

          if (legacySession) {
            void get().refreshAgentAccess();
          } else {
            get().clearAgentAccess();
          }

          if (authSubscription === null) {
            const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
              const nextUser = session?.user
                ? createAuthUser({
                    id: session.user.id,
                    email: session.user.email ?? null,
                    displayName: session.user.email ?? null,
                    isAnonymous: false,
                    provider: 'supabase',
                    role: 'demo_user',
                  })
                : null;
              const nextSession = session && nextUser ? createAuthSession(session.access_token, nextUser) : null;

              set({
                status: nextSession ? 'authenticated' : 'anonymous',
                session: nextSession,
                user: nextUser,
                currentUser: null,
                accessToken: nextSession?.access_token ?? null,
                isAuthenticated: Boolean(nextSession),
                isAnonymous: !nextSession,
                authProvider: 'supabase',
                error: null,
                isInitialized: true,
              });

              if (nextSession) {
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
            currentUser: null,
            accessToken: null,
            isAuthenticated: false,
            isAnonymous: true,
            authProvider: 'supabase',
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
    }

    unsubscribeLegacyAuth();

    if (get().isInitialized && get().authProvider === 'cloudbase' && get().accessToken) {
      return;
    }

    if (initializeAuthPromise !== null) {
      return initializeAuthPromise;
    }

    set({ status: 'loading', error: null, authProvider: 'cloudbase' });

    initializeAuthPromise = (async () => {
      try {
        const cloudBaseAuth = await resolveCloudBaseSession();

        set({
          status: 'authenticated',
          session: cloudBaseAuth.session,
          user: cloudBaseAuth.user,
          currentUser: cloudBaseAuth.currentUser,
          accessToken: cloudBaseAuth.accessToken,
          isAuthenticated: true,
          isAnonymous: cloudBaseAuth.user.isAnonymous,
          authProvider: 'cloudbase',
          error: null,
          isInitialized: true,
          isLoginModalOpen: false,
        });

        await get().refreshAgentAccess();
      } catch (error) {
        set({
          status: 'error',
          session: null,
          user: null,
          currentUser: null,
          accessToken: null,
          isAuthenticated: false,
          isAnonymous: true,
          authProvider: 'cloudbase',
          error: toAuthErrorMessage(error),
          isInitialized: true,
          agentAccess: createAgentAccessUnavailableView('CloudBase 登录状态检查失败，暂不能读取真实 Agent 额度。'),
          isAgentAccessLoading: false,
          agentAccessError: 'CloudBase 登录状态检查失败，暂不能读取真实 Agent 额度。',
        });
      } finally {
        initializeAuthPromise = null;
      }
    })();

    return initializeAuthPromise;
  },

  signInWithPassword: async (email, password) => {
    if (isCloudBasePrivateApiEnabled()) {
      void email;
      void password;
      set({ status: 'loading', error: null, authProvider: 'cloudbase' });

      try {
        const cloudBaseAuth = await resolveCloudBaseSession();

        set({
          status: 'authenticated',
          session: cloudBaseAuth.session,
          user: cloudBaseAuth.user,
          currentUser: cloudBaseAuth.currentUser,
          accessToken: cloudBaseAuth.accessToken,
          isAuthenticated: true,
          isAnonymous: cloudBaseAuth.user.isAnonymous,
          authProvider: 'cloudbase',
          error: null,
          isInitialized: true,
          isLoginModalOpen: false,
        });
        await get().refreshAgentAccess();
        return true;
      } catch (error) {
        set({
          status: 'error',
          error: toAuthErrorMessage(error),
          isInitialized: true,
        });
        return false;
      }
    }

    if (!isSupabaseAuthConfigured || supabase === null) {
      set({
        ...createAnonymousState(),
        authProvider: 'supabase',
        error: 'Supabase Auth 未配置，当前只能使用公开演示模式。',
      });
      return false;
    }

    set({ status: 'loading', error: null, authProvider: 'supabase' });

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
          currentUser: null,
          accessToken: null,
          isAuthenticated: false,
          isAnonymous: true,
          authProvider: 'supabase',
          error: error.message,
          isInitialized: true,
          agentAccess: createAnonymousAgentAccessView(),
          isAgentAccessLoading: false,
          agentAccessError: null,
        });
        return false;
      }

      const legacyUser = data.user
        ? createAuthUser({
            id: data.user.id,
            email: data.user.email ?? null,
            displayName: data.user.email ?? null,
            isAnonymous: false,
            provider: 'supabase',
            role: 'demo_user',
          })
        : null;
      const legacySession = data.session && legacyUser ? createAuthSession(data.session.access_token, legacyUser) : null;

      set({
        status: legacySession ? 'authenticated' : 'anonymous',
        session: legacySession,
        user: legacyUser,
        currentUser: null,
        accessToken: legacySession?.access_token ?? null,
        isAuthenticated: Boolean(legacySession),
        isAnonymous: !legacySession,
        authProvider: 'supabase',
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
        currentUser: null,
        accessToken: null,
        isAuthenticated: false,
        isAnonymous: true,
        authProvider: 'supabase',
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
    if (isCloudBasePrivateApiEnabled()) {
      set({ status: 'loading', error: null, authProvider: 'cloudbase' });

      try {
        await signOutCloudBase();
        const cloudBaseAuth = await resolveCloudBaseSession();

        set({
          status: 'authenticated',
          session: cloudBaseAuth.session,
          user: cloudBaseAuth.user,
          currentUser: cloudBaseAuth.currentUser,
          accessToken: cloudBaseAuth.accessToken,
          isAuthenticated: true,
          isAnonymous: cloudBaseAuth.user.isAnonymous,
          authProvider: 'cloudbase',
          error: null,
          isInitialized: true,
          isLoginModalOpen: false,
        });
        await get().refreshAgentAccess();
        return true;
      } catch (error) {
        set({
          status: get().user ? 'authenticated' : 'error',
          error: toAuthErrorMessage(error),
          isInitialized: true,
        });
        return false;
      }
    }

    if (!isSupabaseAuthConfigured || supabase === null) {
      set(createAnonymousState());
      return true;
    }

    set({ status: 'loading', error: null, authProvider: 'supabase' });

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
        currentUser: null,
        accessToken: null,
        isAuthenticated: false,
        isAnonymous: true,
        authProvider: 'supabase',
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
    const accessToken = get().accessToken?.trim() || get().session?.access_token?.trim() || null;
    const userId = get().user?.id ?? null;

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

    const access = await fetchAgentAccessView(accessToken, {
      userId,
      email: get().user?.email ?? null,
      role: get().currentUser?.role ?? get().user?.role ?? 'demo_user',
    });

    if (requestId !== agentAccessRequestId || get().user?.id !== userId) {
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
  const currentUser = useAuthStore((state) => state.currentUser);
  const authProvider = useAuthStore((state) => state.authProvider);

  return useMemo(
    () => createAuthSessionView({ status, user, currentUser, authProvider }),
    [authProvider, currentUser, status, user],
  );
}
