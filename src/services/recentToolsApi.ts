import type {
  RecentToolListResult,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createAuthRequiredResponse(): WorkbenchPersistenceResponse<RecentToolListResult> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message: '请先登录后查看最近使用工具。',
  };
}

async function readRecentToolsResponse(
  response: Response,
): Promise<WorkbenchPersistenceResponse<RecentToolListResult>> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (isRecord(payload) && payload.ok === true && 'data' in payload) {
    return {
      ok: true,
      data: payload.data as RecentToolListResult,
    };
  }

  if (isRecord(payload) && payload.ok === false) {
    return {
      ok: false,
      errorCode:
        payload.errorCode === 'auth_required' ||
        payload.errorCode === 'auth_unavailable' ||
        payload.errorCode === 'db_error' ||
        payload.errorCode === 'method_not_allowed'
          ? payload.errorCode
          : 'db_error',
      message: typeof payload.message === 'string' ? payload.message : '最近工具加载失败。',
    };
  }

  return {
    ok: false,
    errorCode: response.status === 401 ? 'auth_required' : 'db_error',
    message: '最近工具加载失败。',
  };
}

export async function fetchRecentTools(
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<RecentToolListResult>> {
  const token = accessToken?.trim();

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch('/api/workbench/recent-tools', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await readRecentToolsResponse(response);
  } catch {
    return {
      ok: false,
      errorCode: 'db_error',
      message: '网络异常，暂不能读取最近使用工具。',
    };
  }
}
