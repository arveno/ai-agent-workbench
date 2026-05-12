import type {
  RagRetrievalLogListResult,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createAuthRequiredResponse(): WorkbenchPersistenceResponse<RagRetrievalLogListResult> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message: '请先登录后读取 RAG 检索来源。',
  };
}

async function readRagRetrievalResponse(
  response: Response,
): Promise<WorkbenchPersistenceResponse<RagRetrievalLogListResult>> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (isRecord(payload) && payload.ok === true && 'data' in payload) {
    return {
      ok: true,
      data: payload.data as RagRetrievalLogListResult,
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
      message: typeof payload.message === 'string' ? payload.message : '读取 RAG 检索来源失败。',
    };
  }

  return {
    ok: false,
    errorCode: response.status === 401 ? 'auth_required' : 'db_error',
    message: '读取 RAG 检索来源失败。',
  };
}

export async function fetchRagRetrievals(
  runId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<RagRetrievalLogListResult>> {
  const token = accessToken?.trim();

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/runs/${encodeURIComponent(runId)}/rag-retrievals`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await readRagRetrievalResponse(response);
  } catch {
    return {
      ok: false,
      errorCode: 'db_error',
      message: '网络异常，暂不能读取 RAG 检索来源。',
    };
  }
}
