import type { AgentAccessView, AuthSessionView } from '@/types/auth';

export type RealAgentAvailabilityStatus =
  | 'available'
  | 'login_required'
  | 'quota_exceeded'
  | 'auth_unavailable'
  | 'checking'
  | 'forbidden';

export interface RealAgentAvailabilityView {
  status: RealAgentAvailabilityStatus;
  canEnterRealAgent: boolean;
  title: string;
  description: string;
  actionLabel: string | null;
}

export interface BuildRealAgentAvailabilityViewParams {
  authView: AuthSessionView;
  agentAccess: AgentAccessView;
  isAgentAccessLoading: boolean;
}

function getRemainingQuotaDescription(agentAccess: AgentAccessView): string {
  if (agentAccess.role === 'admin') {
    return '当前账号可使用真实 Agent。';
  }

  if (typeof agentAccess.quotaRemaining === 'number') {
    return `本月剩余额度：${agentAccess.quotaRemaining} 次。`;
  }

  return '当前账号可使用真实 Agent。';
}

export function buildRealAgentAvailabilityView(
  params: BuildRealAgentAvailabilityViewParams,
): RealAgentAvailabilityView {
  const { authView, agentAccess, isAgentAccessLoading } = params;

  if (authView.status === 'loading') {
    return {
      status: 'checking',
      canEnterRealAgent: false,
      title: '正在检查登录状态',
      description: '正在确认当前浏览器会话是否已登录。',
      actionLabel: null,
    };
  }

  if (authView.status === 'error' || !authView.isAuthConfigured) {
    return {
      status: 'auth_unavailable',
      canEnterRealAgent: false,
      title: '真实 Agent 暂不可用',
      description: '登录能力暂不可用，可继续使用公开演示模式。',
      actionLabel: null,
    };
  }

  if (authView.status !== 'authenticated') {
    return {
      status: 'login_required',
      canEnterRealAgent: false,
      title: '需要登录',
      description: '登录后可使用真实 Agent 分析能力；公开演示模式无需登录。',
      actionLabel: '登录',
    };
  }

  if (isAgentAccessLoading) {
    return {
      status: 'checking',
      canEnterRealAgent: false,
      title: '正在检查额度',
      description: '正在读取当前账号的真实 Agent Run 额度。',
      actionLabel: null,
    };
  }

  if (agentAccess.status === 'allowed') {
    return {
      status: 'available',
      canEnterRealAgent: true,
      title: '真实 Agent 可用',
      description: getRemainingQuotaDescription(agentAccess),
      actionLabel: null,
    };
  }

  if (agentAccess.status === 'quota_exceeded') {
    return {
      status: 'quota_exceeded',
      canEnterRealAgent: false,
      title: '额度已用完',
      description: '本月真实 Agent Run 额度已用完，可继续使用公开演示模式。',
      actionLabel: null,
    };
  }

  if (agentAccess.status === 'auth_unavailable') {
    return {
      status: 'auth_unavailable',
      canEnterRealAgent: false,
      title: '真实 Agent 暂不可用',
      description: '服务端权限检查暂不可用，可继续使用公开演示模式。',
      actionLabel: null,
    };
  }

  if (agentAccess.status === 'forbidden') {
    return {
      status: 'forbidden',
      canEnterRealAgent: false,
      title: '暂无权限',
      description: '当前账号暂无真实 Agent 使用权限，可继续使用公开演示模式。',
      actionLabel: null,
    };
  }

  return {
    status: 'login_required',
    canEnterRealAgent: false,
    title: '需要登录',
    description: '请先登录后使用真实 Agent。公开演示模式仍可直接体验。',
    actionLabel: '登录',
  };
}

export function getRealAgentBlockedMessage(view: RealAgentAvailabilityView): string {
  if (view.status === 'login_required') {
    return '请先登录后使用真实 Agent。公开演示模式仍可直接体验。';
  }

  if (view.status === 'quota_exceeded') {
    return '本月真实 Agent Run 额度已用完，可继续使用公开演示模式。';
  }

  if (view.status === 'auth_unavailable' || view.status === 'checking') {
    return '真实 Agent 权限检查暂不可用，可继续使用公开演示模式。';
  }

  if (view.status === 'forbidden') {
    return '当前账号暂无真实 Agent 使用权限，可继续使用公开演示模式。';
  }

  return view.description;
}
