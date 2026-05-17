import cloudbase from '@cloudbase/js-sdk';

type CloudBaseApp = ReturnType<typeof cloudbase.init>;
type CloudBaseAuth = ReturnType<CloudBaseApp['auth']>;

export type CloudBaseSessionResult = Awaited<ReturnType<CloudBaseAuth['getSession']>>;
export type CloudBaseAnonymousSignInResult = Awaited<ReturnType<CloudBaseAuth['signInAnonymously']>>;
export type CloudBasePasswordSignInResult = Awaited<ReturnType<CloudBaseAuth['signInWithPassword']>>;
export type CloudBaseSignUpResult = Awaited<ReturnType<CloudBaseAuth['signUp']>>;

type CloudBaseAuthWithUsernameSignUp = CloudBaseAuth & {
  oauthInstance?: {
    authApi?: {
      signUp?: (params: { username: string; password: string }) => Promise<unknown>;
    };
  };
};

const DEFAULT_CLOUDBASE_REGION = 'ap-shanghai';

let cloudBaseApp: CloudBaseApp | null = null;

function getPublicEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getCloudBaseEnvId(): string {
  return getPublicEnvValue(import.meta.env.VITE_CLOUDBASE_ENV_ID);
}

function getCloudBaseRegion(): string {
  return getPublicEnvValue(import.meta.env.VITE_CLOUDBASE_REGION) || DEFAULT_CLOUDBASE_REGION;
}

export function isCloudBaseAuthConfigured(): boolean {
  return Boolean(getCloudBaseEnvId());
}

export function initCloudBaseAuth(): CloudBaseAuth {
  return getCloudBaseAuth();
}

function getCloudBaseApp(): CloudBaseApp {
  if (cloudBaseApp) {
    return cloudBaseApp;
  }

  const envId = getCloudBaseEnvId();

  if (!envId) {
    throw new Error('VITE_CLOUDBASE_ENV_ID is required before using CloudBase Auth.');
  }

  cloudBaseApp = cloudbase.init({
    env: envId,
    region: getCloudBaseRegion(),
  });

  return cloudBaseApp;
}

function getCloudBaseAuth(): CloudBaseAuth {
  return getCloudBaseApp().auth();
}

function normalizeUsername(username: string): string {
  return username.trim();
}

function assertUsernamePassword(username: string, password: string) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error('请输入 CloudBase 用户名。');
  }

  if (normalizedUsername.length < 5 || normalizedUsername.length > 24) {
    throw new Error('CloudBase 用户名需为 5-24 位。');
  }

  if (!/^[A-Za-z0-9_-]+$/.test(normalizedUsername)) {
    throw new Error('CloudBase 用户名仅支持英文字母、数字、下划线和连字符。');
  }

  if (!password) {
    throw new Error('请输入密码。');
  }
}

export function getCloudBaseAuthErrorMessage(error: unknown, fallbackMessage: string): string {
  if (typeof error === 'object' && error !== null) {
    const authError = error as {
      category?: unknown;
      code?: unknown;
      message?: unknown;
      helpMessage?: unknown;
      loginMethodHint?: unknown;
    };
    const helpMessage = typeof authError.helpMessage === 'string' ? authError.helpMessage.trim() : '';
    const message = typeof authError.message === 'string' ? authError.message.trim() : '';
    const code = authError.code === undefined ? '' : String(authError.code);
    const category = authError.category === undefined ? '' : String(authError.category);

    if (category === 'PROVIDER_NOT_ENABLED' || code === 'PROVIDER_NOT_ENABLED') {
      return 'CloudBase 用户名密码登录未开启，请在 CloudBase 控制台开启“用户名密码登录”后重试。';
    }

    if (code === 'invalid_username_or_password' || code === 'invalid_password') {
      return '用户名或密码不正确，请检查后重试。';
    }

    if (code === 'not_found') {
      return '用户不存在，请先注册。';
    }

    return helpMessage || message || fallbackMessage;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallbackMessage;
}

function createSignUpErrorResult(error: unknown): CloudBaseSignUpResult {
  return {
    data: {},
    error,
  } as CloudBaseSignUpResult;
}

async function signUpWithInternalUsernameApi(
  username: string,
  password: string,
): Promise<CloudBaseSignUpResult | null> {
  const auth = getCloudBaseAuth() as CloudBaseAuthWithUsernameSignUp;
  const signUp = auth.oauthInstance?.authApi?.signUp;

  if (typeof signUp !== 'function') {
    return null;
  }

  try {
    await signUp.call(auth.oauthInstance?.authApi, {
      username,
      password,
    });

    return {
      data: {},
      error: null,
    } as CloudBaseSignUpResult;
  } catch (error) {
    return createSignUpErrorResult(error);
  }
}

export async function signInCloudBaseAnonymously(): Promise<CloudBaseAnonymousSignInResult> {
  return getCloudBaseAuth().signInAnonymously({});
}

export async function signUpWithUsername(username: string, password: string): Promise<CloudBaseSignUpResult> {
  const normalizedUsername = normalizeUsername(username);
  assertUsernamePassword(normalizedUsername, password);

  const internalResult = await signUpWithInternalUsernameApi(normalizedUsername, password);

  if (internalResult) {
    return internalResult;
  }

  return getCloudBaseAuth().signUp({
    username: normalizedUsername,
    password,
  } as Parameters<CloudBaseAuth['signUp']>[0]);
}

export async function signInWithUsername(
  username: string,
  password: string,
): Promise<CloudBasePasswordSignInResult> {
  const normalizedUsername = normalizeUsername(username);
  assertUsernamePassword(normalizedUsername, password);

  return getCloudBaseAuth().signInWithPassword({
    username: normalizedUsername,
    password,
  });
}

export async function getCloudBaseSession(): Promise<CloudBaseSessionResult> {
  return getCloudBaseAuth().getSession();
}

export async function restoreCloudBaseSession(): Promise<CloudBaseSessionResult> {
  return getCloudBaseSession();
}

export async function getCloudBaseAccessToken(): Promise<string | null> {
  const result = await getCloudBaseSession();

  if (result.error) {
    throw new Error(getCloudBaseAuthErrorMessage(result.error, 'CloudBase session is unavailable.'));
  }

  return result.data.session?.access_token?.trim() || null;
}

export async function ensureCloudBaseAccessToken(): Promise<string> {
  const sessionResult = await restoreCloudBaseSession();

  if (sessionResult.error) {
    throw new Error(getCloudBaseAuthErrorMessage(sessionResult.error, 'CloudBase session is unavailable.'));
  }

  const token = sessionResult.data.session?.access_token?.trim() || null;

  if (!token) {
    throw new Error('请先登录 CloudBase 后使用私有能力。');
  }

  return token;
}

export async function signOutCloudBase(): Promise<void> {
  await getCloudBaseAuth().signOut();
}
