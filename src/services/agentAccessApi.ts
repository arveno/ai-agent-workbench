import type { AgentAccessStatus, AgentAccessView, UserRole } from '@/types/auth';
import { buildApiPath, isCloudBasePrivateApiEnabled, requestCloudBasePrivateApi } from './cloudbaseApiClient';

interface AgentAccessApiResponse {
  ok: boolean;
  access?: unknown;
}

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

function isAgentAccessStatus(value: unknown): value is AgentAccessStatus {
  return (
    value === 'anonymous' ||
    value === 'allowed' ||
    value === 'auth_required' ||
    value === 'quota_exceeded' ||
    value === 'forbidden' ||
    value === 'auth_unavailable'
  );
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'anonymous' || value === 'demo_user' || value === 'admin';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function normalizeAgentAccessView(value: unknown): AgentAccessView | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = value.status;
  const role = value.role;
  const quotaType = value.quotaType;

  if (!isAgentAccessStatus(status) || !isUserRole(role) || quotaType !== 'agent_run') {
    return null;
  }

  return {
    status,
    userId: readNullableString(value.userId),
    email: readNullableString(value.email),
    role,
    quotaType,
    quotaLimit: readNullableNumber(value.quotaLimit),
    quotaUsed: readNullableNumber(value.quotaUsed),
    quotaRemaining: readNullableNumber(value.quotaRemaining),
    canUseRealAgent: value.canUseRealAgent === true,
    reason: typeof value.reason === 'string' ? value.reason : DEFAULT_UNAVAILABLE_REASON,
  };
}

async function readAgentAccessResponse(response: Response): Promise<AgentAccessView> {
  const payload = (await response.json().catch(() => null)) as AgentAccessApiResponse | null;
  const access = normalizeAgentAccessView(payload?.access);

  if (access) {
    return access;
  }

  if (response.status === 401) {
    return createAnonymousAgentAccessView();
  }

  return createAgentAccessUnavailableView();
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

  if (isCloudBasePrivateApiEnabled()) {
    return fetchCloudBaseAgentAccessView(token, context);
  }

  try {
    const response = await fetch('/api/auth/agent-access', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await readAgentAccessResponse(response);
  } catch {
    return createAgentAccessUnavailableView('网络异常，暂不能读取真实 Agent 额度。');
  }
}
