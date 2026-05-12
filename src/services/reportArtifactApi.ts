import type {
  ReportArtifactCreateInput,
  ReportArtifactCreateResult,
  ReportArtifactListResult,
  ReportArtifactRecord,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message: '请先登录后使用报告 Artifact。',
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
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchConversationReportArtifacts(
  conversationId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactListResult>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/conversations/${encodeURIComponent(conversationId)}/reports`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<ReportArtifactListResult>(response, '读取报告 Artifact 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能读取报告 Artifact。');
  }
}

export async function fetchReportArtifact(
  reportId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactRecord>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/reports/${encodeURIComponent(reportId)}`, {
      method: 'GET',
      headers: createHeaders(token),
    });

    return await readPersistenceResponse<ReportArtifactRecord>(response, '读取报告 Artifact 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能读取报告 Artifact。');
  }
}

export async function createRunReportArtifact(
  runId: string,
  input: ReportArtifactCreateInput,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactCreateResult>> {
  const token = normalizeAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(`/api/workbench/runs/${encodeURIComponent(runId)}/report`, {
      method: 'POST',
      headers: createHeaders(token),
      body: JSON.stringify(input),
    });

    return await readPersistenceResponse<ReportArtifactCreateResult>(response, '保存报告 Artifact 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能保存报告 Artifact。');
  }
}
