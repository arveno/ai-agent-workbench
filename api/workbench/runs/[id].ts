import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../src/server/auth/supabaseAdmin';
import { isUuid } from '../../../src/server/workbench/runPersistence';
import { readRouteId, sendWorkbenchError, verifyWorkbenchRequestUser } from '../../../src/server/workbench/apiAuth';

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

  let query = supabaseAdmin.from('agent_runs').select('*').eq('user_id', verified.user.userId);

  query = isUuid(runId) ? query.or(`id.eq.${runId},runtime_run_id.eq.${runId}`) : query.eq('runtime_run_id', runId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    sendWorkbenchError(res, 500, 'db_error', '读取 Run 失败。');
    return;
  }

  if (!data) {
    sendWorkbenchError(res, 404, 'not_found', '未找到 Run。');
    return;
  }

  res.status(200).json({
    ok: true,
    data,
  });
}
