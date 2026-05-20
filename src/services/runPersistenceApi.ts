import type {
  AgentRunRecord,
  LatestRunResult,
  RunEventListResult,
  RunEventRecord,
  ToolInvocationRecord,
  ToolInvocationListResult,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { buildApiPath, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface RunPersistenceBundleResult {
  run: AgentRunRecord | null;
  events: RunEventRecord[];
  toolInvocations: ToolInvocationRecord[];
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
): Promise<WorkbenchPersistenceResponse<RunPersistenceBundleResult>> {
  return fetchCloudBaseRunBundle(
    { conversationId, latest: 1 },
    '读取最近 Run 失败。',
  );
}

export async function fetchLatestRunForConversation(
  conversationId: string,
): Promise<WorkbenchPersistenceResponse<LatestRunResult>> {
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

export async function fetchRun(
  runId: string,
): Promise<WorkbenchPersistenceResponse<AgentRunRecord>> {
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

export async function fetchRunBundle(
  runId: string,
): Promise<WorkbenchPersistenceResponse<RunPersistenceBundleResult>> {
  return fetchCloudBaseRunBundle({ runId }, '读取 Run 失败。');
}

export async function fetchRunEvents(
  runId: string,
): Promise<WorkbenchPersistenceResponse<RunEventListResult>> {
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

export async function fetchToolInvocations(
  runId: string,
): Promise<WorkbenchPersistenceResponse<ToolInvocationListResult>> {
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
