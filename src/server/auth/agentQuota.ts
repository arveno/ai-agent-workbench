import { getSupabaseAdminClient } from './supabaseAdmin';
import type { AgentRunQuotaConsumeStatus, AgentRunUsageFinalStatus } from './types';

export interface ConsumeAgentRunQuotaParams {
  userId: string;
  runId: string;
  metadata?: Record<string, unknown>;
}

export interface ConsumeAgentRunQuotaResult {
  ok: boolean;
  status: AgentRunQuotaConsumeStatus;
  usageId: string | null;
  quotaLimit: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  reason: string;
}

export interface FinishAgentRunUsageParams {
  usageId: string | null;
  status: AgentRunUsageFinalStatus;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FinishAgentRunUsageResult {
  ok: boolean;
  status: AgentRunUsageFinalStatus | 'quota_unavailable';
  reason: string;
}

function normalizeConsumeStatus(status: string | null | undefined): AgentRunQuotaConsumeStatus {
  if (
    status === 'allowed' ||
    status === 'quota_exceeded' ||
    status === 'forbidden' ||
    status === 'auth_unavailable' ||
    status === 'quota_unavailable'
  ) {
    return status;
  }

  return 'quota_unavailable';
}

function getSafeReason(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export async function consumeAgentRunQuota(
  params: ConsumeAgentRunQuotaParams
): Promise<ConsumeAgentRunQuotaResult> {
  const userId = params.userId.trim();

  if (!userId) {
    return {
      ok: false,
      status: 'forbidden',
      usageId: null,
      quotaLimit: null,
      quotaUsed: null,
      quotaRemaining: null,
      reason: '当前用户没有真实 Agent 使用权限。',
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 'auth_unavailable',
      usageId: null,
      quotaLimit: null,
      quotaUsed: null,
      quotaRemaining: null,
      reason: '服务端登录权限检查暂不可用。',
    };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('consume_agent_run_quota', {
      p_user_id: userId,
      p_run_id: params.runId.trim(),
      p_metadata: params.metadata ?? {},
    });

    if (error) {
      return {
        ok: false,
        status: 'quota_unavailable',
        usageId: null,
        quotaLimit: null,
        quotaUsed: null,
        quotaRemaining: null,
        reason: '真实 Agent Run 额度扣减暂不可用。',
      };
    }

    const row = data[0];

    if (!row) {
      return {
        ok: false,
        status: 'quota_unavailable',
        usageId: null,
        quotaLimit: null,
        quotaUsed: null,
        quotaRemaining: null,
        reason: '真实 Agent Run 额度扣减未返回结果。',
      };
    }

    const status = normalizeConsumeStatus(row.status);

    return {
      ok: row.ok === true && status === 'allowed',
      status,
      usageId: row.usage_id,
      quotaLimit: row.quota_limit,
      quotaUsed: row.quota_used,
      quotaRemaining: row.quota_remaining,
      reason: getSafeReason(row.reason, '真实 Agent Run 额度状态已更新。'),
    };
  } catch {
    return {
      ok: false,
      status: 'quota_unavailable',
      usageId: null,
      quotaLimit: null,
      quotaUsed: null,
      quotaRemaining: null,
      reason: '真实 Agent Run 额度扣减失败。',
    };
  }
}

export async function finishAgentRunUsage(
  params: FinishAgentRunUsageParams
): Promise<FinishAgentRunUsageResult> {
  const usageId = params.usageId?.trim();

  if (!usageId) {
    return {
      ok: false,
      status: 'quota_unavailable',
      reason: '缺少 Agent Run usage 记录。',
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 'quota_unavailable',
      reason: '服务端登录权限检查暂不可用。',
    };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('finish_agent_run_usage', {
      p_usage_id: usageId,
      p_status: params.status,
      p_error_code: params.errorCode ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (error) {
      return {
        ok: false,
        status: 'quota_unavailable',
        reason: 'Agent Run usage 更新失败。',
      };
    }

    const row = data[0];

    if (!row || row.ok !== true) {
      return {
        ok: false,
        status: 'quota_unavailable',
        reason: getSafeReason(row?.reason, 'Agent Run usage 更新未完成。'),
      };
    }

    return {
      ok: true,
      status: params.status,
      reason: getSafeReason(row.reason, 'Agent Run usage 已更新。'),
    };
  } catch {
    return {
      ok: false,
      status: 'quota_unavailable',
      reason: 'Agent Run usage 更新失败。',
    };
  }
}
