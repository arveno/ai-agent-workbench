import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../src/server/auth/supabaseAdmin';
import { readRouteId, sendWorkbenchError, verifyWorkbenchRequestUser } from '../../../src/server/workbench/apiAuth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendWorkbenchError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const reportId = readRouteId(req.query.id);

  if (!reportId) {
    sendWorkbenchError(res, 400, 'invalid_request', 'Missing report id.');
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

  const { data, error } = await supabaseAdmin
    .from('report_artifacts')
    .select('*')
    .eq('id', reportId)
    .eq('user_id', verified.user.userId)
    .maybeSingle();

  if (error) {
    sendWorkbenchError(res, 500, 'db_error', '读取报告 Artifact 失败。');
    return;
  }

  if (!data) {
    sendWorkbenchError(res, 404, 'not_found', '未找到报告 Artifact。');
    return;
  }

  res.status(200).json({
    ok: true,
    data,
  });
}
