import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../src/server/auth/supabaseAdmin';
import { sendWorkbenchError, verifyWorkbenchRequestUser } from '../../src/server/workbench/apiAuth';
import type { RecentToolRecord, ToolInvocationRecordStatus } from '../../src/types/persistence';

interface ToolInvocationSummaryRow {
  tool_name: string;
  display_name: string;
  status: ToolInvocationRecordStatus;
  conversation_id: string;
  run_id: string;
  started_at: string;
  finished_at: string | null;
}

function getToolLastUsedAt(row: ToolInvocationSummaryRow): string {
  return row.finished_at ?? row.started_at;
}

function createRecentToolRecords(rows: ToolInvocationSummaryRow[]): RecentToolRecord[] {
  const grouped = new Map<string, RecentToolRecord>();

  for (const row of rows) {
    const existing = grouped.get(row.tool_name);

    if (!existing) {
      grouped.set(row.tool_name, {
        toolName: row.tool_name,
        displayName: row.display_name,
        usageCount: 1,
        lastUsedAt: getToolLastUsedAt(row),
        lastStatus: row.status,
        lastConversationId: row.conversation_id,
        lastRunId: row.run_id,
      });
      continue;
    }

    existing.usageCount += 1;
  }

  return [...grouped.values()]
    .sort((left, right) => new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime())
    .slice(0, 8);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendWorkbenchError(res, 405, 'method_not_allowed', 'Method not allowed');
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
    .from('tool_invocations')
    .select('tool_name, display_name, status, conversation_id, run_id, started_at, finished_at')
    .eq('user_id', verified.user.userId)
    .order('started_at', { ascending: false })
    .limit(200);

  if (error) {
    sendWorkbenchError(res, 500, 'db_error', '读取最近使用工具失败。');
    return;
  }

  res.status(200).json({
    ok: true,
    data: {
      tools: createRecentToolRecords(data ?? []),
    },
  });
}
