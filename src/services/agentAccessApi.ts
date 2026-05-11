import type { AgentAccessStatus, AgentAccessView, UserRole } from '@/types/auth';

interface AgentAccessApiResponse {
  ok: boolean;
  access?: unknown;
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

export async function fetchAgentAccessView(accessToken: string): Promise<AgentAccessView> {
  const token = accessToken.trim();

  if (!token) {
    return createAnonymousAgentAccessView();
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
