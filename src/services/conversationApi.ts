import type {
  ConversationCreateInput,
  ConversationListResult,
  ConversationRecord,
  ConversationStatus,
  ConversationUpdateInput,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { buildApiPath, isCloudBasePrivateApiEnabled, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';
import {
  createAuthRequiredPersistenceResponse,
  createLegacyJsonAuthHeaders,
  createNetworkPersistenceResponse,
  normalizeLegacyAccessToken,
  readWorkbenchPersistenceResponse,
} from './persistenceApiClient';

interface FetchConversationsParams {
  limit?: number;
  cursor?: string | null;
  status?: ConversationStatus;
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return createAuthRequiredPersistenceResponse('请先登录后使用 Workbench 持久化会话。');
}

function createNetworkErrorResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return createNetworkPersistenceResponse('网络异常，暂不能同步 Workbench 会话。');
}

function createUnsupportedCloudBaseResponse<TData>(message: string): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'invalid_request',
    message,
  };
}

async function readPersistenceResponse<TData>(response: Response): Promise<WorkbenchPersistenceResponse<TData>> {
  return readWorkbenchPersistenceResponse(response, 'Workbench 会话请求失败。');
}

export async function fetchConversations(
  params: FetchConversationsParams,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationListResult>> {
  const apiPath = buildApiPath('/api/workbench/conversations', {
    limit: params.limit,
    cursor: params.cursor,
    status: params.status,
  });

  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi(apiPath, {
        method: 'GET',
        accessToken: cloudBaseToken,
      });

      return await readPersistenceResponse<ConversationListResult>(response);
    } catch {
      return createNetworkErrorResponse();
    }
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(apiPath, {
      method: 'GET',
      headers: createLegacyJsonAuthHeaders(token),
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
  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/conversations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        accessToken: cloudBaseToken,
      });

      return await readPersistenceResponse<ConversationRecord>(response);
    } catch {
      return createNetworkErrorResponse();
    }
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(buildApiPath('/api/workbench/conversations'), {
      method: 'POST',
      headers: createLegacyJsonAuthHeaders(token),
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
  if (isCloudBasePrivateApiEnabled()) {
    const conversationResult = await fetchConversations({ limit: 50 }, null);

    if (!conversationResult.ok) {
      return conversationResult;
    }

    const conversation = conversationResult.data.conversations.find((item) => item.id === id);

    if (!conversation) {
      return {
        ok: false,
        errorCode: 'not_found',
        message: 'Workbench 会话不存在。',
      };
    }

    return {
      ok: true,
      data: conversation,
    };
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(buildApiPath(`/api/workbench/conversations/${encodeURIComponent(id)}`), {
      method: 'GET',
      headers: createLegacyJsonAuthHeaders(token),
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
  if (isCloudBasePrivateApiEnabled()) {
    return createUnsupportedCloudBaseResponse('CloudBase 会话更新接口尚未接入，当前仅支持列表和创建。');
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(buildApiPath(`/api/workbench/conversations/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: createLegacyJsonAuthHeaders(token),
      body: JSON.stringify(input),
    });

    return await readPersistenceResponse<ConversationRecord>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}
