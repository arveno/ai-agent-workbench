import type {
  MessageCreateInput,
  MessageListResult,
  MessageRecord,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { isCloudBasePrivateApiEnabled, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';

interface FetchConversationMessagesParams {
  limit?: number;
  before?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message: '请先登录后使用 Workbench 消息持久化。',
  };
}

function createNetworkErrorResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'db_error',
    message: '网络异常，暂不能同步 Workbench 消息。',
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
        payload.errorCode === 'validation_error'
          ? 'invalid_request'
          : payload.errorCode === 'auth_invalid'
            ? 'auth_required'
            : payload.errorCode === 'auth_required' ||
                payload.errorCode === 'auth_unavailable' ||
                payload.errorCode === 'db_error' ||
                payload.errorCode === 'invalid_request' ||
                payload.errorCode === 'method_not_allowed' ||
                payload.errorCode === 'not_found'
              ? payload.errorCode
              : 'db_error',
      message: typeof payload.message === 'string' ? payload.message : 'Workbench 消息请求失败。',
    };
  }

  return {
    ok: false,
    errorCode: response.status === 401 ? 'auth_required' : 'db_error',
    message: 'Workbench 消息请求失败。',
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

export async function fetchConversationMessages(
  conversationId: string,
  params: FetchConversationMessagesParams,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<MessageListResult>> {
  const searchParams = new URLSearchParams();
  searchParams.set('conversationId', conversationId);

  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }

  if (params.before) {
    searchParams.set('before', params.before);
  }

  const query = searchParams.toString();

  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi(`/api/workbench/messages?${query}`, {
        method: 'GET',
        accessToken: cloudBaseToken,
      });

      return await readPersistenceResponse<MessageListResult>(response);
    } catch {
      return createNetworkErrorResponse();
    }
  }

  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  searchParams.delete('conversationId');
  const legacyQuery = searchParams.toString();

  try {
    const response = await fetch(
      `/api/workbench/conversations/${encodeURIComponent(conversationId)}/messages${legacyQuery ? `?${legacyQuery}` : ''}`,
      {
        method: 'GET',
        headers: createHeaders(token),
      },
    );

    return await readPersistenceResponse<MessageListResult>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}

export async function createConversationMessage(
  conversationId: string,
  input: MessageCreateInput,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<MessageRecord>> {
  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi('/api/workbench/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...input,
          conversationId,
        }),
        accessToken: cloudBaseToken,
      });

      return await readPersistenceResponse<MessageRecord>(response);
    } catch {
      return createNetworkErrorResponse();
    }
  }

  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: createHeaders(token),
      body: JSON.stringify(input),
    });

    return await readPersistenceResponse<MessageRecord>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}
