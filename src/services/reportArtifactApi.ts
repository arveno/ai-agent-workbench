import type {
  ReportArtifactCreateInput,
  ReportArtifactCreateResult,
  ReportArtifactRecord,
  ReportArtifactListResult,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';
import type { RunReportState } from '@/types/run';
import { buildApiPath, requestCloudBasePrivateApi } from './cloudbaseApiClient';
import { ensureCloudBaseAccessToken } from './cloudbaseAuthClient';
import {
  createNetworkPersistenceResponse,
  readWorkbenchPersistenceResponse,
} from './persistenceApiClient';

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
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactListResult>> {
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

export async function fetchReportArtifact(
  reportId: string,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactRecord>> {
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

export async function createRunReportArtifact(
  runId: string,
  input: ReportArtifactCreateInput,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<ReportArtifactCreateResult>> {
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
        runtimeRunId: input.runtimeRunId ?? runId,
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

export async function updateRunReportState(
  conversationId: string,
  runId: string,
  reportState: Extract<RunReportState, 'generated' | 'skipped' | 'failed'>,
  _accessToken: string | null | undefined,
): Promise<WorkbenchPersistenceResponse<{ runId: string; reportState: RunReportState }>> {
  try {
    const cloudBaseToken = await ensureCloudBaseAccessToken();
    const response = await requestCloudBasePrivateApi(
      buildApiPath('/api/workbench/reports', { action: 'run-report-state' }),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          runId,
          runtimeRunId: runId,
          reportState,
        }),
        accessToken: cloudBaseToken,
      },
    );

    return await readPersistenceResponse<{ runId: string; reportState: RunReportState }>(
      response,
      '更新报告状态失败。',
    );
  } catch {
    return createNetworkErrorResponse('网络异常，暂不能更新报告状态。');
  }
}
