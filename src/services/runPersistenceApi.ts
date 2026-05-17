import type {
  AgentRunRecord,
  LatestRunResult,
  RunEventListResult,
  RunEventRecord,
  ToolInvocationRecord,
  ToolInvocationListResult,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { buildApiPath, isCloudBasePrivateApiEnabled, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface RunPersistenceBundleResult {
  run: AgentRunRecord | null;
  events: RunEventRecord[];
  toolInvocations: ToolInvocationRecord[];
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

function toCloudBaseRunBundle(value: unknown): RunPersistenceBundleResult {
  const data = isRecord(value) ? value : {};
  return {
    run: isRecord(data.run) ? (data.run as unknown as AgentRunRecord) : null,
    events: Array.isArray(data.events) ? (data.events as RunEventRecord[]) : [],
    toolInvocations: Array.isArray(data.toolInvocations)
      ? (data.toolInvocations as ToolInvocationRecord[])
      : [],
  };
}

async function fetchCloudBaseRunBundle(
  query: { conversationId?: string; runId?: string; latest?: 1 },
  fallbackMessage: string,
): Promise<WorkbenchPersistenceResponse<RunPersistenceBundleResult>> {
  try {
    const cloudBaseToken = await ensureCloudBaseAccessToken();
    const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/runs', query), {
      method: 'GET',
      accessToken: cloudBaseToken,
    });
    const result = await readPersistenceResponse<unknown>(response, fallbackMessage);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: toCloudBaseRunBundle(result.data),
    };
  } catch {
    return createNetworkErrorResponse(fallbackMessage);
  }
}

export async function fetchLatestRunBundleForConversation(
  conversationId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<RunPersistenceBundleResult>> {
  if (isCloudBasePrivateApiEnabled()) {
    return fetchCloudBaseRunBundle(
      { conversationId, latest: 1 },
      '读取最近 Run 失败。',
    );
  }

  const latestRunResult = await fetchLatestRunForConversation(conversationId, accessToken);

  if (!latestRunResult.ok) {
    return latestRunResult;
  }

  if (!latestRunResult.data.run) {
    return {
      ok: true,
      data: {
        run: null,
        events: [],
        toolInvocations: [],
      },
    };
  }

  const runId = latestRunResult.data.run.runtime_run_id ?? latestRunResult.data.run.id;
  const [eventsResult, toolsResult] = await Promise.all([
    fetchRunEvents(runId, accessToken),
    fetchToolInvocations(runId, accessToken),
  ]);

  if (!eventsResult.ok) {
    return eventsResult;
  }

  if (!toolsResult.ok) {
    return toolsResult;
  }

  return {
    ok: true,
    data: {
      run: latestRunResult.data.run,
      events: eventsResult.data.events,
      toolInvocations: toolsResult.data.tools,
    },
  };
}

export async function fetchLatestRunForConversation(
  conversationId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<LatestRunResult>> {
  if (isCloudBasePrivateApiEnabled()) {
    const result = await fetchCloudBaseRunBundle(
      { conversationId, latest: 1 },
      '读取最近 Run 失败。',
    );

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        run: result.data.run,
      },
    };
  }

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
  if (isCloudBasePrivateApiEnabled()) {
    const result = await fetchCloudBaseRunBundle({ runId }, '读取 Run 失败。');

    if (!result.ok) {
      return result;
    }

    if (!result.data.run) {
      return {
        ok: false,
        errorCode: 'not_found',
        message: 'Run 不存在。',
      };
    }

    return {
      ok: true,
      data: result.data.run,
    };
  }

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
  if (isCloudBasePrivateApiEnabled()) {
    const result = await fetchCloudBaseRunBundle({ runId }, '读取 Run Events 失败。');

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        events: result.data.events,
      },
    };
  }

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
  if (isCloudBasePrivateApiEnabled()) {
    const result = await fetchCloudBaseRunBundle({ runId }, '读取工具调用失败。');

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        tools: result.data.toolInvocations,
      },
    };
  }

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
