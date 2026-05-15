import type {
  ConversationRecord,
  DemoConversationCopyResult,
  DemoConversationTemplateListResult,
  DemoTaskTemplateListResult,
  MessageListResult,
  MessageRecord,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { isCloudBasePrivateApiEnabled, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';

interface CloudBaseDemoConversationCopyResult {
  conversation: ConversationRecord;
  messages?: MessageRecord[];
  messagesCount?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createNetworkErrorResponse<TData>(message: string): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'db_error',
    message,
  };
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message: '请先登录后复制示例会话。',
  };
}

function getPublicEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildApiUrl(path: string): string {
  const apiBaseUrl = getPublicEnvValue(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '');
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

async function readPersistenceResponse<TData>(
  response: Response,
  fallbackMessage: string,
): Promise<WorkbenchPersistenceResponse<TData>> {
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
      message: typeof payload.message === 'string' ? payload.message : fallbackMessage,
    };
  }

  return {
    ok: false,
    errorCode: response.status === 401 ? 'auth_required' : 'db_error',
    message: fallbackMessage,
  };
}

function normalizeAccessToken(accessToken: string | null | undefined): string | null {
  const token = accessToken?.trim();
  return token ? token : null;
}

export async function fetchDemoTasks(): Promise<WorkbenchPersistenceResponse<DemoTaskTemplateListResult>> {
  try {
    const response = await fetch(buildApiUrl('/api/workbench/demo-tasks'), {
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
    const response = await fetch(buildApiUrl('/api/workbench/demo-conversations'), {
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
      const response = await requestCloudBasePrivateApi('/api/workbench/demo-copy', {
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
        `/api/workbench/messages?conversationId=${encodeURIComponent(conversationId)}&limit=100`,
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

  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/demo-conversations/${encodeURIComponent(templateId)}/copy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await readPersistenceResponse<DemoConversationCopyResult>(response, '复制示例会话失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能复制示例会话。');
  }
}
