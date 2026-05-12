import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../../src/server/auth/supabaseAdmin';
import { isUuid } from '../../../../src/server/workbench/runPersistence';
import { readRouteId, sendWorkbenchError, verifyWorkbenchRequestUser } from '../../../../src/server/workbench/apiAuth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
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

  let runQuery = supabaseAdmin.from('agent_runs').select('id').eq('user_id', verified.user.userId);
  runQuery = isUuid(runId) ? runQuery.or(`id.eq.${runId},runtime_run_id.eq.${runId}`) : runQuery.eq('runtime_run_id', runId);
  const { data: run, error: runError } = await runQuery.maybeSingle();

  if (runError || !run) {
    sendWorkbenchError(res, 404, 'not_found', '未找到 Run。');
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('rag_retrieval_logs')
    .select('*')
    .eq('run_id', run.id)
    .eq('user_id', verified.user.userId)
    .order('created_at', { ascending: true });

  if (error) {
    sendWorkbenchError(res, 500, 'db_error', '读取 RAG 检索记录失败。');
    return;
  }

  res.status(200).json({
    ok: true,
    data: {
      retrievals: data ?? [],
    },
  });
}
