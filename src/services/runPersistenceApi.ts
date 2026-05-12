import type {
  AgentRunRecord,
  LatestRunResult,
  RunEventListResult,
  ToolInvocationListResult,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message: '请先登录后读取 Run 持久化数据。',
  };
}

function createNetworkErrorResponse<TData>(message: string): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'db_error',
    message,
  };
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
        payload.errorCode === 'auth_required' ||
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

function createHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchLatestRunForConversation(
  conversationId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<LatestRunResult>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/conversations/${encodeURIComponent(conversationId)}/latest-run`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<LatestRunResult>(response, '读取最近 Run 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能读取最近 Run。');
  }
}

export async function fetchRun(
  runId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<AgentRunRecord>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/runs/${encodeURIComponent(runId)}`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<AgentRunRecord>(response, '读取 Run 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能读取 Run。');
  }
}

export async function fetchRunEvents(
  runId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<RunEventListResult>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/runs/${encodeURIComponent(runId)}/events`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<RunEventListResult>(response, '读取 Run Events 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能读取 Run Events。');
  }
}

export async function fetchToolInvocations(
  runId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ToolInvocationListResult>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/runs/${encodeURIComponent(runId)}/tools`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<ToolInvocationListResult>(response, '读取工具调用失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能读取工具调用。');
  }
}
