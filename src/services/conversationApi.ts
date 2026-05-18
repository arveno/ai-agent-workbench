import type {
  ConversationCreateInput,
  ConversationListResult,
  ConversationRecord,
  ConversationStatus,
  ConversationUpdateInput,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { buildApiPath, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';
import {
  createNetworkPersistenceResponse,
  readWorkbenchPersistenceResponse,
} from './persistenceApiClient';

interface FetchConversationsParams {
  limit?: number;
  cursor?: string | null;
  status?: ConversationStatus;
}

function createNetworkErrorResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return createNetworkPersistenceResponse('网络异常，暂不能同步 Workbench 会话。');
}

async function readPersistenceResponse<TData>(response: Response): Promise<WorkbenchPersistenceResponse<TData>> {
  return readWorkbenchPersistenceResponse(response, 'Workbench 会话请求失败。');
}

export async function fetchConversations(
  params: FetchConversationsParams,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationListResult>> {
  const apiPath = buildApiPath('/api/workbench/conversations', {
    limit: params.limit,
    cursor: params.cursor,
    status: params.status,
  });

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

export async function createConversation(
  input: ConversationCreateInput,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationRecord>> {
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

export async function fetchConversation(
  id: string,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationRecord>> {
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

export async function updateConversation(
  id: string,
  input: ConversationUpdateInput,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ConversationRecord>> {
  try {
    const cloudBaseToken = await ensureCloudBaseAccessToken();
    const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/conversations', { id }), {
      method: 'PATCH',
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
