import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createAuthUnavailableAccessView,
  getAgentAccessViewByUserId,
} from '../../src/server/auth/agentAccess';
import type { AgentAccessView } from '../../src/server/auth/types';
import { verifySupabaseAccessToken } from '../../src/server/auth/verifySupabaseToken';

interface AgentAccessApiResponse {
  ok: boolean;
  access: AgentAccessView;
}

function createAuthRequiredAccessView(reason: string): AgentAccessView {
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

function getHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function getBearerToken(req: VercelRequest): string | null {
  const authorization = getHeaderValue(req.headers.authorization).trim();

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authorization.slice('bearer '.length).trim();
  return token || null;
}

function sendResponse(
  res: VercelResponse<AgentAccessApiResponse | { ok: false; errorMessage: string }>,
  statusCode: number,
  response: AgentAccessApiResponse,
): void {
  res.status(statusCode).json(response);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<AgentAccessApiResponse | { ok: false; errorMessage: string }>,
) {
  if (req.method !== 'GET') {
    res.status(405).json({
      ok: false,
      errorMessage: 'Method not allowed',
    });
    return;
  }

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    sendResponse(res, 401, {
      ok: false,
      access: createAuthRequiredAccessView('请先登录后查看真实 Agent 额度。'),
    });
    return;
  }

  const verified = await verifySupabaseAccessToken(accessToken);

  if (!verified.ok) {
    if (verified.errorCode === 'auth_unavailable') {
      sendResponse(res, 503, {
        ok: false,
        access: createAuthUnavailableAccessView('服务端登录权限检查暂不可用。'),
      });
      return;
    }

    sendResponse(res, 401, {
      ok: false,
      access: createAuthRequiredAccessView('请先登录后查看真实 Agent 额度。'),
    });
    return;
  }

  const access = await getAgentAccessViewByUserId(verified.user.userId);

  sendResponse(res, 200, {
    ok: true,
    access,
  });
}
