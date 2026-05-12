import type {
  ConversationCreateInput,
  ConversationListResult,
  ConversationRecord,
  ConversationStatus,
  ConversationUpdateInput,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';

interface FetchConversationsParams {
  limit?: number;
  cursor?: string | null;
  status?: ConversationStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message: '请先登录后使用 Workbench 持久化会话。',
  };
}

function createNetworkErrorResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'db_error',
    message: '网络异常，暂不能同步 Workbench 会话。',
  };
}

async function readPersistenceResponse<TData>(response: Response): Promise<WorkbenchPersistenceResponse<TData>> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (isRecord(payload) && payload.ok === true && 'data' in payload) {
    return {
      ok: true,
      data: payload.data as TData,
    };
  }

  if (isRecord(payload) && payload.ok === false) {
    return {
      ok: false,
      errorCode:
        payload.errorCode === 'auth_required' ||
        payload.errorCode === 'auth_unavailable' ||
        payload.errorCode === 'db_error' ||
        payload.errorCode === 'invalid_request' ||
        payload.errorCode === 'method_not_allowed' ||
        payload.errorCode === 'not_found'
          ? payload.errorCode
          : 'db_error',
      message: typeof payload.message === 'string' ? payload.message : 'Workbench 会话请求失败。',
    };
  }

  return {
    ok: false,
    errorCode: response.status === 401 ? 'auth_required' : 'db_error',
    message: 'Workbench 会话请求失败。',
  };
}

function createHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

function normalizeAccessToken(accessToken: string | null | undefined): string | null {
  const token = accessToken?.trim();
  return token ? token : null;
}

export async function fetchConversations(
  params: FetchConversationsParams,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationListResult>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  const searchParams = new URLSearchParams();

  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }

  if (params.cursor) {
    searchParams.set('cursor', params.cursor);
  }

  if (params.status) {
    searchParams.set('status', params.status);
  }

  const query = searchParams.toString();

  try {
    const response = await fetch(`/api/workbench/conversations${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<ConversationListResult>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}

export async function createConversation(
  input: ConversationCreateInput,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationRecord>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch('/api/workbench/conversations', {
      method: 'POST',
      headers: createHeaders(token),
      body: JSON.stringify(input),
    });

    return await readPersistenceResponse<ConversationRecord>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}

export async function fetchConversation(
  id: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationRecord>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/conversations/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<ConversationRecord>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}

export async function updateConversation(
  id: string,
  input: ConversationUpdateInput,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationRecord>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: createHeaders(token),
      body: JSON.stringify(input),
    });

    return await readPersistenceResponse<ConversationRecord>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}
