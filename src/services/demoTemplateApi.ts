import type {
  ConversationRecord,
  DemoConversationCopyResult,
  DemoConversationTemplateListResult,
  MessageListResult,
  MessageRecord,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { demoConversationTemplates, PHASE4_DEMO_TEMPLATE_KEYS } from '@/mocks/demoConversations';
import {
  buildApiPath,
  requestCloudBasePrivateApi,
  requestCloudBasePublicApi,
} from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';
import {
  createNetworkPersistenceResponse,
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

function readTemplateKey(value: Record<string, unknown>): string {
  const templateKey = value.templateKey;
  return typeof templateKey === 'string' ? templateKey : '';
}

function hasPhase4DemoConversations(conversations: DemoConversationTemplateListResult['conversations']): boolean {
  const templateKeys = new Set(conversations.map((conversation) => readTemplateKey(conversation.metadata)));
  return PHASE4_DEMO_TEMPLATE_KEYS.every((templateKey) => templateKeys.has(templateKey));
}

function createLocalDemoConversationResponse(): WorkbenchPersistenceResponse<DemoConversationTemplateListResult> {
  return {
    ok: true,
    data: {
      conversations: demoConversationTemplates,
    },
  };
}

async function readPersistenceResponse<TData>(
  response: Response,
  fallbackMessage: string,
): Promise<WorkbenchPersistenceResponse<TData>> {
  return readWorkbenchPersistenceResponse(response, fallbackMessage);
}

export async function fetchDemoConversations(): Promise<
  WorkbenchPersistenceResponse<DemoConversationTemplateListResult>
> {
  try {
    const response = await requestCloudBasePublicApi(buildApiPath('/api/workbench/demo-conversations'), {
      method: 'GET',
    });

    const result = await readPersistenceResponse<DemoConversationTemplateListResult>(response, '示例会话加载失败。');

    if (!result.ok) {
      return createLocalDemoConversationResponse();
    }

    return hasPhase4DemoConversations(result.data.conversations) ? result : createLocalDemoConversationResponse();
  } catch {
    return createLocalDemoConversationResponse();
  }
}

export async function copyDemoConversationTemplate(
  templateId: string,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<DemoConversationCopyResult>> {
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
