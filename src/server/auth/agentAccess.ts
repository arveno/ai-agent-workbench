import { getSupabaseAdminClient } from './supabaseAdmin';
import type { AgentAccessView, AgentRunQuotaRow, ProfileRow, UserRole } from './types';

const DEFAULT_DEMO_AGENT_RUN_LIMIT = 20;

export function createAnonymousAgentAccessView(): AgentAccessView {
  return {
    status: 'anonymous',
    userId: null,
    email: null,
    role: 'anonymous',
    quotaType: 'agent_run',
    quotaLimit: 0,
    quotaUsed: 0,
    quotaRemaining: 0,
    canUseRealAgent: false,
    reason: '请登录后体验真实 Agent。',
  };
}

export function createAuthUnavailableAccessView(reason: string): AgentAccessView {
  return {
    status: 'auth_unavailable',
    userId: null,
    email: null,
    role: 'anonymous',
    quotaType: 'agent_run',
    quotaLimit: null,
    quotaUsed: null,
    quotaRemaining: null,
    canUseRealAgent: false,
    reason,
  };
}

function createForbiddenAccessView(params: {
  userId: string;
  email: string | null;
  role?: UserRole;
  reason: string;
}): AgentAccessView {
  return {
    status: 'forbidden',
    userId: params.userId,
    email: params.email,
    role: params.role ?? 'demo_user',
    quotaType: 'agent_run',
    quotaLimit: null,
    quotaUsed: null,
    quotaRemaining: null,
    canUseRealAgent: false,
    reason: params.reason,
  };
}

function normalizeUserRole(role: string): UserRole | null {
  if (role === 'demo_user' || role === 'admin') {
    return role;
  }

  return null;
}

function createAdminAccessView(profile: ProfileRow): AgentAccessView {
  return {
    status: 'allowed',
    userId: profile.id,
    email: profile.email,
    role: 'admin',
    quotaType: 'agent_run',
    quotaLimit: null,
    quotaUsed: null,
    quotaRemaining: null,
    canUseRealAgent: true,
    reason: 'Admin 用户可使用真实 Agent。',
  };
}

function createDemoAccessView(profile: ProfileRow, quota: AgentRunQuotaRow | null): AgentAccessView {
  const quotaLimit = quota?.quota_limit ?? DEFAULT_DEMO_AGENT_RUN_LIMIT;
  const quotaUsed = quota?.quota_used ?? 0;
  const quotaRemaining = Math.max(quotaLimit - quotaUsed, 0);

  if (quotaRemaining <= 0) {
    return {
      status: 'quota_exceeded',
      userId: profile.id,
      email: profile.email,
      role: 'demo_user',
      quotaType: 'agent_run',
      quotaLimit,
      quotaUsed,
      quotaRemaining,
      canUseRealAgent: false,
      reason: '今日真实 Agent Run 额度已用完，可继续使用公开演示模式。',
    };
  }

  return {
    status: 'allowed',
    userId: profile.id,
    email: profile.email,
    role: 'demo_user',
    quotaType: 'agent_run',
    quotaLimit,
    quotaUsed,
    quotaRemaining,
    canUseRealAgent: true,
    reason: 'Demo 用户仍有真实 Agent Run 可用额度。',
  };
}

export async function getAgentAccessViewByUserId(userId: string): Promise<AgentAccessView> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return createAnonymousAgentAccessView();
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return createAuthUnavailableAccessView('Supabase Admin Client 未配置，暂不能检查真实 Agent 权限。');
  }

  try {
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id,email,display_name,role,created_at,updated_at')
      .eq('id', normalizedUserId)
      .maybeSingle();
    const profile = profileData as ProfileRow | null;

    if (profileError) {
      return createAuthUnavailableAccessView('读取用户权限信息失败。');
    }

    if (!profile) {
      return createForbiddenAccessView({
        userId: normalizedUserId,
        email: null,
        reason: '当前用户尚未创建 profile，暂不能使用真实 Agent。',
      });
    }

    const role = normalizeUserRole(profile.role);

    if (!role) {
      return createForbiddenAccessView({
        userId: profile.id,
        email: profile.email,
        reason: '当前用户角色无效，暂不能使用真实 Agent。',
      });
    }

    if (role === 'admin') {
      return createAdminAccessView(profile);
    }

    const { data: quotaData, error: quotaError } = await supabaseAdmin
      .from('agent_run_quota')
      .select('id,user_id,quota_type,quota_limit,quota_used,period_start,period_end,created_at,updated_at')
      .eq('user_id', profile.id)
      .eq('quota_type', 'agent_run')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    const quota = quotaData as AgentRunQuotaRow | null;

    if (quotaError) {
      return createAuthUnavailableAccessView('读取真实 Agent Run 额度失败。');
    }

    return createDemoAccessView(profile, quota);
  } catch {
    return createAuthUnavailableAccessView('检查真实 Agent 权限失败。');
  }
}
