import type {
  MessageCreateInput,
  MessageListResult,
  MessageRecord,
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

interface FetchConversationMessagesParams {
  limit?: number;
  before?: string | null;
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return createAuthRequiredPersistenceResponse('请先登录后使用 Workbench 消息持久化。');
}

function createNetworkErrorResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return createNetworkPersistenceResponse('网络异常，暂不能同步 Workbench 消息。');
}

async function readPersistenceResponse<TData>(response: Response): Promise<WorkbenchPersistenceResponse<TData>> {
  return readWorkbenchPersistenceResponse(response, 'Workbench 消息请求失败。');
}

export async function fetchConversationMessages(
  conversationId: string,
  params: FetchConversationMessagesParams,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<MessageListResult>> {
  const cloudBaseApiPath = buildApiPath('/api/workbench/messages', {
    conversationId,
    limit: params.limit,
    before: params.before,
  });

  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi(cloudBaseApiPath, {
        method: 'GET',
        accessToken: cloudBaseToken,
      });

      return await readPersistenceResponse<MessageListResult>(response);
    } catch {
      return createNetworkErrorResponse();
    }
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  const legacyApiPath = buildApiPath(`/api/workbench/conversations/${encodeURIComponent(conversationId)}/messages`, {
    limit: params.limit,
    before: params.before,
  });

  try {
    const response = await fetch(legacyApiPath, {
      method: 'GET',
      headers: createLegacyJsonAuthHeaders(token),
    });

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
      const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/messages'), {
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

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(
      buildApiPath(`/api/workbench/conversations/${encodeURIComponent(conversationId)}/messages`),
      {
        method: 'POST',
        headers: createLegacyJsonAuthHeaders(token),
        body: JSON.stringify(input),
      },
    );

    return await readPersistenceResponse<MessageRecord>(response);
  } catch {
    return createNetworkErrorResponse();
  }
}
