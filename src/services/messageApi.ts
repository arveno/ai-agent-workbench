import type {
  MessageCreateInput,
  MessageListResult,
  MessageRecord,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { buildApiPath, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';
import {
  createNetworkPersistenceResponse,
  readWorkbenchPersistenceResponse,
} from './persistenceApiClient';

interface FetchConversationMessagesParams {
  limit?: number;
  before?: string | null;
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
): Promise<WorkbenchPersistenceResponse<MessageListResult>> {
  const cloudBaseApiPath = buildApiPath('/api/workbench/messages', {
    conversationId,
    limit: params.limit,
    before: params.before,
  });

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

export async function createConversationMessage(
  conversationId: string,
  input: MessageCreateInput,
): Promise<WorkbenchPersistenceResponse<MessageRecord>> {
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
