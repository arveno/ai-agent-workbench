import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../../src/server/auth/supabaseAdmin';
import { readRouteId, sendWorkbenchError, verifyWorkbenchRequestUser } from '../../../../src/server/workbench/apiAuth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendWorkbenchError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const conversationId = readRouteId(req.query.id);

  if (!conversationId) {
    sendWorkbenchError(res, 400, 'invalid_request', 'Missing conversation id.');
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

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', verified.user.userId)
    .maybeSingle();

  if (conversationError || !conversation) {
    sendWorkbenchError(res, 404, 'not_found', '未找到 Workbench 会话。');
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('agent_runs')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', verified.user.userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    sendWorkbenchError(res, 500, 'db_error', '读取最近 Run 失败。');
    return;
  }

  res.status(200).json({
    ok: true,
    data: {
      run: data ?? null,
    },
  });
}
