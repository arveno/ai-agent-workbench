import type {
  ReportArtifactCreateInput,
  ReportArtifactCreateResult,
  ReportArtifactRecord,
  ReportArtifactListResult,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import { buildApiPath, isCloudBasePrivateApiEnabled, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';
import {
  createAuthRequiredPersistenceResponse,
  createLegacyJsonAuthHeaders,
  createNetworkPersistenceResponse,
  normalizeLegacyAccessToken,
  readWorkbenchPersistenceResponse,
} from './persistenceApiClient';

function createAuthRequiredResponse<TData>(): WorkbenchPersistenceResponse<TData> {
  return createAuthRequiredPersistenceResponse('请先登录后使用报告 Artifact。');
}

function createNetworkErrorResponse<TData>(message: string): WorkbenchPersistenceResponse<TData> {
  return createNetworkPersistenceResponse(message);
}

async function readPersistenceResponse<TData>(
  response: Response,
  fallbackMessage: string,
): Promise<WorkbenchPersistenceResponse<TData>> {
  return readWorkbenchPersistenceResponse(response, fallbackMessage);
}

export async function fetchConversationReportArtifacts(
  conversationId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactListResult>> {
  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi(
        buildApiPath('/api/workbench/reports', { conversationId }),
        {
          method: 'GET',
          accessToken: cloudBaseToken,
        },
      );

      return await readPersistenceResponse<ReportArtifactListResult>(response, '读取报告 Artifact 失败。');
    } catch {
      return createNetworkErrorResponse('网络异常，暂不能读取报告 Artifact。');
    }
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(
      buildApiPath(`/api/workbench/conversations/${encodeURIComponent(conversationId)}/reports`),
      {
        method: 'GET',
        headers: createLegacyJsonAuthHeaders(token),
      },
    );

    return await readPersistenceResponse<ReportArtifactListResult>(response, '读取报告 Artifact 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能读取报告 Artifact。');
  }
}

export async function fetchReportArtifact(
  reportId: string,
  accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactRecord>> {
  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/reports', { id: reportId }), {
        method: 'GET',
        accessToken: cloudBaseToken,
      });

      return await readPersistenceResponse<ReportArtifactRecord>(response, '读取报告 Artifact 失败。');
    } catch {
      return createNetworkErrorResponse('网络异常，暂不能读取报告 Artifact。');
    }
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(buildApiPath(`/api/workbench/reports/${encodeURIComponent(reportId)}`), {
      method: 'GET',
      headers: createLegacyJsonAuthHeaders(token),
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
  if (isCloudBasePrivateApiEnabled()) {
    try {
      const cloudBaseToken = await ensureCloudBaseAccessToken();
      const metadata =
        input.runtimeRunId || runId
          ? {
              ...input.metadata,
              runtimeRunId: input.runtimeRunId ?? runId,
            }
          : input.metadata;
      const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/reports'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: input.conversationId,
          runId,
          title: input.title,
          contentMarkdown: input.contentMarkdown,
          status: 'generated',
          metadata,
        }),
        accessToken: cloudBaseToken,
      });
      const result = await readPersistenceResponse<ReportArtifactRecord>(response, '保存报告 Artifact 失败。');

      if (!result.ok) {
        return result;
      }

      return {
        ok: true,
        data: {
          report: result.data,
        },
      };
    } catch {
      return createNetworkErrorResponse('网络异常，暂不能保存报告 Artifact。');
    }
  }

  const token = normalizeLegacyAccessToken(accessToken);

  if (!token) {
    return createAuthRequiredResponse();
  }

  try {
    const response = await fetch(buildApiPath(`/api/workbench/runs/${encodeURIComponent(runId)}/report`), {
      method: 'POST',
      headers: createLegacyJsonAuthHeaders(token),
      body: JSON.stringify(input),
    });

    return await readPersistenceResponse<ReportArtifactCreateResult>(response, '保存报告 Artifact 失败。');
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能保存报告 Artifact。');
  }
}
