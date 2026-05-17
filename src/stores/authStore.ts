import { useMemo } from 'react';
import { create } from 'zustand';
import {
  createAnonymousAgentAccessView,
  fetchAgentAccessView,
} from '@/services/agentAccessApi';
import { buildApiPath, requestCloudBasePrivateApi } from '@/services/cloudbaseApiClient';
import {
  getCloudBaseAuthErrorMessage,
  initCloudBaseAuth,
  isCloudBaseAuthConfigured,
  restoreCloudBaseSession,
  signInWithUsername as signInCloudBaseWithUsername,
  signOutCloudBase,
  signUpWithUsername as signUpCloudBaseWithUsername,
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

function toCloudBaseAuthErrorMessage(error: unknown, fallbackMessage = 'CloudBase 登录失败，请稍后重试。'): string {
  return getCloudBaseAuthErrorMessage(error, fallbackMessage);
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
    isAnonymous: value.isAnonymous === true || value.is_anonymous === true,
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

  if (status === 'loading') {
    return '登录状态检查中';
  }

  if (status === 'error') {
    return '登录状态异常';
  }

  if (status === 'authenticated') {
    return 'CloudBase 用户';
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
    isAuthConfigured: isCloudBaseAuthConfigured(),
  };
}

function createCloudBaseSignedOutState(error: string | null = null) {
  return {
    status: error ? ('error' as const) : ('anonymous' as const),
    session: null,
    user: null,
    currentUser: null,
    accessToken: null,
    isAuthenticated: false,
    isAnonymous: true,
    authProvider: 'cloudbase' as const,
    error,
    isInitialized: true,
    agentAccess: createAnonymousAgentAccessView(),
    isAgentAccessLoading: false,
    agentAccessError: null,
    isLoginModalOpen: false,
  };
}

async function resolveCloudBaseSession(accessToken: string): Promise<{
  session: AuthSession;
  user: AuthUser;
  currentUser: CloudBaseCurrentUser;
  accessToken: string;
}> {
  initCloudBaseAuth();

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

async function restoreAuthenticatedCloudBaseSession(): Promise<{
  session: AuthSession;
  user: AuthUser;
  currentUser: CloudBaseCurrentUser;
  accessToken: string;
} | null> {
  initCloudBaseAuth();

  const sessionResult = await restoreCloudBaseSession();

  if (sessionResult.error) {
    throw new Error(toCloudBaseAuthErrorMessage(sessionResult.error, 'CloudBase session 恢复失败。'));
  }

  const accessToken = sessionResult.data.session?.access_token?.trim() || null;

  if (!accessToken) {
    return null;
  }

  const cloudBaseAuth = await resolveCloudBaseSession(accessToken);

  if (cloudBaseAuth.user.isAnonymous) {
    await signOutCloudBase().catch(() => undefined);
    return null;
  }

  return cloudBaseAuth;
}

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  status: 'loading',
  session: null,
  user: null,
  currentUser: null,
  accessToken: null,
  isAuthenticated: false,
  isAnonymous: true,
  authProvider: 'cloudbase',
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
    if (get().isInitialized && get().authProvider === 'cloudbase') {
      return;
    }

    if (initializeAuthPromise !== null) {
      return initializeAuthPromise;
    }

    set({ status: 'loading', error: null, authProvider: 'cloudbase' });

    initializeAuthPromise = (async () => {
      try {
        const cloudBaseAuth = await restoreAuthenticatedCloudBaseSession();

        if (!cloudBaseAuth) {
          set(createCloudBaseSignedOutState());
          get().clearAgentAccess();
          return;
        }

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
        set(createCloudBaseSignedOutState(toCloudBaseAuthErrorMessage(error, 'CloudBase 登录状态检查失败。')));
      } finally {
        initializeAuthPromise = null;
      }
    })();

    return initializeAuthPromise;
  },

  signInWithPassword: async (username, password) => {
    set({ status: 'loading', error: null, authProvider: 'cloudbase' });

    try {
      const signInResult = await signInCloudBaseWithUsername(username, password);

      if (signInResult.error) {
        throw new Error(toCloudBaseAuthErrorMessage(signInResult.error, 'CloudBase 用户名密码登录失败。'));
      }

      const accessToken = signInResult.data.session?.access_token?.trim() || null;

      if (!accessToken) {
        throw new Error('CloudBase 登录成功但未返回 access token。');
      }

      const cloudBaseAuth = await resolveCloudBaseSession(accessToken);

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
        status: 'anonymous',
        session: null,
        user: null,
        currentUser: null,
        accessToken: null,
        isAuthenticated: false,
        isAnonymous: true,
        authProvider: 'cloudbase',
        error: toCloudBaseAuthErrorMessage(error, 'CloudBase 用户名密码登录失败。'),
        isInitialized: true,
        agentAccess: createAnonymousAgentAccessView(),
        isAgentAccessLoading: false,
        agentAccessError: null,
      });
      return false;
    }
  },

  signUpWithUsername: async (username, password) => {
    set({ status: 'loading', error: null, authProvider: 'cloudbase' });

    try {
      const signUpResult = await signUpCloudBaseWithUsername(username, password);

      if (signUpResult.error) {
        throw new Error(toCloudBaseAuthErrorMessage(signUpResult.error, 'CloudBase 用户名注册失败。'));
      }

      const signInResult = await signInCloudBaseWithUsername(username, password);

      if (signInResult.error) {
        throw new Error(toCloudBaseAuthErrorMessage(signInResult.error, '注册成功，请使用用户名和密码登录。'));
      }

      const accessToken = signInResult.data.session?.access_token?.trim() || null;

      if (!accessToken) {
        throw new Error('注册成功，请重新登录。');
      }

      const cloudBaseAuth = await resolveCloudBaseSession(accessToken);

      set({
        status: 'authenticated',
        session: cloudBaseAuth.session,
        user: cloudBaseAuth.user,
        currentUser: cloudBaseAuth.currentUser,
        accessToken: cloudBaseAuth.accessToken,
        isAuthenticated: true,
        isAnonymous: false,
        authProvider: 'cloudbase',
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
        authProvider: 'cloudbase',
        error: toCloudBaseAuthErrorMessage(error, 'CloudBase 用户名注册失败。'),
        isInitialized: true,
        agentAccess: createAnonymousAgentAccessView(),
        isAgentAccessLoading: false,
        agentAccessError: null,
      });
      return false;
    }
  },

  signOut: async () => {
    set({ status: 'loading', error: null, authProvider: 'cloudbase' });

    try {
      await signOutCloudBase();
      set(createCloudBaseSignedOutState());
      get().clearAgentAccess();
      return true;
    } catch (error) {
      set({
        status: get().user ? 'authenticated' : 'anonymous',
        error: toCloudBaseAuthErrorMessage(error, 'CloudBase 退出登录失败。'),
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
