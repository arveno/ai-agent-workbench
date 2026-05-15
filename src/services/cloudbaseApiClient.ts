function getPublicEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeApiPath(path: string): string {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    return '/';
  }

  return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
}

function normalizeAccessToken(accessToken: string | null | undefined): string {
  const token = accessToken?.trim();

  if (!token) {
    throw new Error('CloudBase private API requires an explicit CloudBase access token.');
  }

  return token;
}

export interface CloudBaseApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: HeadersInit;
}

export interface CloudBasePrivateApiRequestOptions extends CloudBaseApiRequestOptions {
  accessToken: string | null | undefined;
}

export function buildCloudBaseApiUrl(path: string): string {
  const apiBaseUrl = getPublicEnvValue(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '');
  const apiPath = normalizeApiPath(path);

  return apiBaseUrl ? `${apiBaseUrl}${apiPath}` : apiPath;
}

export function isCloudBasePrivateApiEnabled(): boolean {
  return getPublicEnvValue(import.meta.env.VITE_ENABLE_CLOUDBASE_PRIVATE_API).toLowerCase() === 'true';
}

export async function requestCloudBasePublicApi(
  path: string,
  options: CloudBaseApiRequestOptions = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.delete('Authorization');

  return fetch(buildCloudBaseApiUrl(path), {
    ...options,
    headers,
  });
}

export async function requestCloudBasePrivateApi(
  path: string,
  options: CloudBasePrivateApiRequestOptions,
): Promise<Response> {
  if (!isCloudBasePrivateApiEnabled()) {
    throw new Error('CloudBase private API is disabled. Set VITE_ENABLE_CLOUDBASE_PRIVATE_API=true for migration tests.');
  }

  const { accessToken, headers: requestHeaders, ...requestOptions } = options;
  const headers = new Headers(requestHeaders);
  headers.set('Authorization', `Bearer ${normalizeAccessToken(accessToken)}`);

  return fetch(buildCloudBaseApiUrl(path), {
    ...requestOptions,
    headers,
  });
}
