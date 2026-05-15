import cloudbase from '@cloudbase/js-sdk';

type CloudBaseApp = ReturnType<typeof cloudbase.init>;
type CloudBaseAuth = ReturnType<CloudBaseApp['auth']>;

export type CloudBaseSessionResult = Awaited<ReturnType<CloudBaseAuth['getSession']>>;
export type CloudBaseAnonymousSignInResult = Awaited<ReturnType<CloudBaseAuth['signInAnonymously']>>;

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

function getAuthErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }

  return fallbackMessage;
}

export async function signInCloudBaseAnonymously(): Promise<CloudBaseAnonymousSignInResult> {
  return getCloudBaseAuth().signInAnonymously({});
}

export async function getCloudBaseSession(): Promise<CloudBaseSessionResult> {
  return getCloudBaseAuth().getSession();
}

export async function getCloudBaseAccessToken(): Promise<string | null> {
  const result = await getCloudBaseSession();

  if (result.error) {
    throw new Error(getAuthErrorMessage(result.error, 'CloudBase session is unavailable.'));
  }

  return result.data.session?.access_token?.trim() || null;
}

export async function ensureCloudBaseAccessToken(): Promise<string> {
  const sessionResult = await getCloudBaseSession();
  const currentToken = sessionResult.error ? null : sessionResult.data.session?.access_token?.trim() || null;

  if (currentToken) {
    return currentToken;
  }

  const signInResult = await signInCloudBaseAnonymously();

  if (signInResult.error) {
    throw new Error(getAuthErrorMessage(signInResult.error, 'CloudBase anonymous sign-in failed.'));
  }

  const signInToken = signInResult.data.session?.access_token?.trim();

  if (signInToken) {
    return signInToken;
  }

  const nextSessionResult = await getCloudBaseSession();
  const nextToken = nextSessionResult.error ? null : nextSessionResult.data.session?.access_token?.trim() || null;

  if (!nextToken) {
    throw new Error('CloudBase anonymous sign-in did not return an access token.');
  }

  return nextToken;
}
