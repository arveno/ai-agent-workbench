import type { AgentAccessView, UserRole } from '@/types/auth';
import { buildApiPath, requestCloudBasePrivateApi } from './cloudbaseApiClient';

interface AgentAccessContext {
  userId: string | null;
  email: string | null;
  role: UserRole;
}

interface CloudBaseQuotaApiResponse {
  ok?: boolean;
  data?: {
    quota?: unknown;
  };
  message?: string;
}

const DEFAULT_ANONYMOUS_REASON = '请先登录后查看真实 Agent 额度。';
const DEFAULT_UNAVAILABLE_REASON = '额度暂不可用。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function createAnonymousAgentAccessView(reason = DEFAULT_ANONYMOUS_REASON): AgentAccessView {
  return {
    status: 'auth_required',
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

export function createAgentAccessUnavailableView(reason = DEFAULT_UNAVAILABLE_REASON): AgentAccessView {
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

function normalizeCloudBaseQuotaAccessView(value: unknown, context?: AgentAccessContext): AgentAccessView | null {
  if (!isRecord(value)) {
    return null;
  }

  const quotaLimit = readNumberValue(value.quotaLimit ?? value.quota_limit);
  const quotaUsed = readNumberValue(value.quotaUsed ?? value.quota_used);
  const quotaRemaining = readNumberValue(value.remaining ?? value.quotaRemaining ?? value.quota_remaining);
  const role = context?.role ?? 'demo_user';
  const canUseRealAgent = role === 'admin' || (quotaRemaining !== null && quotaRemaining > 0);

  return {
    status: canUseRealAgent ? 'allowed' : 'quota_exceeded',
    userId: context?.userId ?? null,
    email: context?.email ?? null,
    role,
    quotaType: 'agent_run',
    quotaLimit,
    quotaUsed,
    quotaRemaining,
    canUseRealAgent,
    reason: canUseRealAgent ? 'CloudBase Agent Run 可用。' : '本月真实 Agent Run 额度已用完。',
  };
}

async function fetchCloudBaseAgentAccessView(
  accessToken: string,
  context?: AgentAccessContext,
): Promise<AgentAccessView> {
  try {
    const response = await requestCloudBasePrivateApi(buildApiPath('/api/workbench/quota'), {
      method: 'GET',
      accessToken,
    });
    const payload = (await response.json().catch(() => null)) as CloudBaseQuotaApiResponse | null;

    if (!response.ok || payload?.ok === false) {
      if (response.status === 401) {
        return createAnonymousAgentAccessView();
      }

      return createAgentAccessUnavailableView(payload?.message || DEFAULT_UNAVAILABLE_REASON);
    }

    return normalizeCloudBaseQuotaAccessView(payload?.data?.quota, context) ?? createAgentAccessUnavailableView();
  } catch {
    return createAgentAccessUnavailableView('网络异常，暂不能读取 CloudBase Agent Run 额度。');
  }
}

export async function fetchAgentAccessView(
  accessToken: string,
  context?: AgentAccessContext,
): Promise<AgentAccessView> {
  const token = accessToken.trim();

  if (!token) {
    return createAnonymousAgentAccessView();
  }

  return fetchCloudBaseAgentAccessView(token, context);
}
