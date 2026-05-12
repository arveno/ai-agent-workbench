import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../../src/server/auth/supabaseAdmin';
import { isUuid, createReportArtifactRecord } from '../../../../src/server/workbench/runPersistence';
import {
  isRecord,
  parseRequestBody,
  readRouteId,
  sendWorkbenchError,
  verifyWorkbenchRequestUser,
} from '../../../../src/server/workbench/apiAuth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendWorkbenchError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const runId = readRouteId(req.query.id);

  if (!runId) {
    sendWorkbenchError(res, 400, 'invalid_request', 'Missing run id.');
    return;
  }

  const verified = await verifyWorkbenchRequestUser(req);

  if (!verified.ok) {
    sendWorkbenchError(res, verified.statusCode, verified.errorCode, verified.message);
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    sendWorkbenchError(res, 503, 'auth_unavailable', 'Supabase Admin Client 未配置。');
    return;
  }

  const body = parseRequestBody(req.body);
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '教学质量分析简版报告';
  const contentMarkdown = typeof body.contentMarkdown === 'string' ? body.contentMarkdown.trim() : '';
  const runtimeRunId = typeof body.runtimeRunId === 'string' && body.runtimeRunId.trim() ? body.runtimeRunId.trim() : runId;

  if (!conversationId || !contentMarkdown) {
    sendWorkbenchError(res, 400, 'invalid_request', 'Missing conversationId or contentMarkdown.');
    return;
  }

  let runQuery = supabaseAdmin
    .from('agent_runs')
    .select('id, conversation_id, runtime_run_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', verified.user.userId);

  runQuery = isUuid(runId) ? runQuery.or(`id.eq.${runId},runtime_run_id.eq.${runId}`) : runQuery.eq('runtime_run_id', runId);
  const { data: run, error: runError } = await runQuery.maybeSingle();

  if (runError || !run) {
    sendWorkbenchError(res, 404, 'not_found', '未找到 Run。');
    return;
  }

  const report = await createReportArtifactRecord({
    conversationId,
    userId: verified.user.userId,
    runId: run.id,
    title,
    contentMarkdown,
    metadata: {
      ...(isRecord(body.metadata) ? body.metadata : {}),
      runtimeRunId,
      persistedFrom: 'report_confirm',
    },
  });

  if (!report) {
    sendWorkbenchError(res, 500, 'db_error', '保存报告 Artifact 失败。');
    return;
  }

  res.status(200).json({
    ok: true,
    data: {
      report,
    },
  });
}
