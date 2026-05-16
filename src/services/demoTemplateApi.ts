import type {
  ConversationRecord,
  DemoConversationCopyResult,
  DemoConversationTemplateListResult,
  DemoTaskTemplateListResult,
  MessageListResult,
  MessageRecord,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import {
  buildApiPath,
  isCloudBasePrivateApiEnabled,
  requestCloudBasePrivateApi,
  requestCloudBasePublicApi,
} from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';
import {
  createAuthRequiredPersistenceResponse,
  createLegacyAuthHeaders,
  createNetworkPersistenceResponse,
  normalizeLegacyAccessToken,
  readWorkbenchPersistenceResponse,
} from './persistenceApiClient';

interface CloudBaseDemoConversationCopyResult {
  conversation: ConversationRecord;
  messages?: MessageRecord[];
  messagesCount?: number;
}

function createNetworkErrorResponse<TData>(message: string): WorkbenchPersistenceResponse<TData> {
  return createNetworkPersistenceResponse(message);
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return createAuthRequiredPersistenceResponse('请先登录后复制示例会话。');
}

async function readPersistenceResponse<TData>(
  response: Response,
  fallbackMessage: string,
): Promise<WorkbenchPersistenceResponse<TData>> {
  return readWorkbenchPersistenceResponse(response, fallbackMessage);
}

export async function fetchDemoTasks(): Promise<WorkbenchPersistenceResponse<DemoTaskTemplateListResult>> {
  try {
    const response = await requestCloudBasePublicApi(buildApiPath('/api/workbench/demo-tasks'), {
      method: 'GET',
    });

    return await readPersistenceResponse<DemoTaskTemplateListResult>(response, '示例任务加载失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能加载示例任务。');
  }
}

export async function fetchDemoConversations(): Promise<
  WorkbenchPersistenceResponse<DemoConversationTemplateListResult>
> {
  try {
    const response = await requestCloudBasePublicApi(buildApiPath('/api/workbench/demo-conversations'), {
      method: 'GET',
    });

    return await readPersistenceResponse<DemoConversationTemplateListResult>(response, '示例会话加载失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能加载示例会话。');
  }
}

export async function copyDemoConversationTemplate(
  templateId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<DemoConversationCopyResult>> {
  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/demo-copy'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ templateId }),
        accessToken: cloudBaseToken,
      });
      const copyResult = await readPersistenceResponse<CloudBaseDemoConversationCopyResult>(
        response,
        '复制示例会话失败。',
      );

      if (!copyResult.ok) {
        return copyResult;
      }

      if (Array.isArray(copyResult.data.messages)) {
        return {
          ok: true,
          data: {
            conversation: copyResult.data.conversation,
            messages: copyResult.data.messages,
          },
        };
      }

      const conversationId = copyResult.data.conversation.id;
      const messagesResponse = await requestCloudBasePrivateApi(
        buildApiPath('/api/workbench/messages', {
          conversationId,
          limit: 100,
        }),
        {
          method: 'GET',
          accessToken: cloudBaseToken,
        },
      );
      const messagesResult = await readPersistenceResponse<MessageListResult>(
        messagesResponse,
        '读取复制后的示例会话消息失败。',
      );

      if (!messagesResult.ok) {
        return messagesResult;
      }

      return {
        ok: true,
        data: {
          conversation: copyResult.data.conversation,
          messages: messagesResult.data.messages,
        },
      };
    } catch {
      return createNetworkErrorResponse('网络异常，暂不能复制示例会话。');
    }
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(
      buildApiPath(`/api/workbench/demo-conversations/${encodeURIComponent(templateId)}/copy`),
      {
        method: 'POST',
        headers: createLegacyAuthHeaders(token),
      },
    );

    return await readPersistenceResponse<DemoConversationCopyResult>(response, '复制示例会话失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能复制示例会话。');
  }
}
