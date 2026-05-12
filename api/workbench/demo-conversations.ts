import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../src/server/auth/supabaseAdmin';
import type { WorkbenchPersistenceErrorCode } from '../../src/types/persistence';

function sendError(
  res: VercelResponse,
  statusCode: number,
  errorCode: WorkbenchPersistenceErrorCode,
  message: string,
): void {
  res.status(statusCode).json({
    ok: false,
    errorCode,
    message,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    sendError(res, 500, 'db_error', '示例会话暂不可用，请稍后重试。');
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('demo_conversation_templates')
    .select('*')
    .eq('is_enabled', true)
    .in('visibility', ['demo', 'system'])
    .order('sort_order', { ascending: true });

  if (error) {
    sendError(res, 500, 'db_error', '读取示例会话失败。');
    return;
  }

  res.status(200).json({
    ok: true,
    data: {
      conversations: data ?? [],
    },
  });
}
