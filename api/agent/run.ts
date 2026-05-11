import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAgentAccessViewByUserId } from '../../src/server/auth/agentAccess';
import {
  consumeAgentRunQuota,
  finishAgentRunUsage,
  type ConsumeAgentRunQuotaResult,
} from '../../src/server/auth/agentQuota';
import type { AgentAccessStatus, AgentAccessView } from '../../src/server/auth/types';
import { verifySupabaseAccessToken } from '../../src/server/auth/verifySupabaseToken';
import { runAgent } from '../../src/server/agent/runAgent';
import type { AgentRunErrorResponse, AgentRunRequest, AgentRunSuccessResponse } from '../../src/server/agent/types';

type AgentRunErrorCode =
  | 'auth_required'
  | 'forbidden'
  | 'quota_exceeded'
  | 'auth_unavailable'
  | 'quota_unavailable'
  | 'invalid_request'
  | 'method_not_allowed';

type ProtectedAgentRunErrorResponse = AgentRunErrorResponse & {
  errorCode?: AgentRunErrorCode;
};

function parseRequestBody(body: unknown): Partial<AgentRunRequest> {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Partial<AgentRunRequest>;
    } catch {
      return {};
    }
  }

  if (typeof body === 'object' && body !== null) {
    return body as Partial<AgentRunRequest>;
  }

  return {};
}

function isProvider(value: unknown): value is AgentRunRequest['provider'] {
  return value === 'postgresql' || value === 'supabase';
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

function createLegacyRunId(): string {
  return `agent_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapAccessStatusToHttpStatus(status: AgentAccessStatus): number {
  if (status === 'quota_exceeded') {
    return 429;
  }

  if (status === 'forbidden') {
    return 403;
  }

  if (status === 'auth_unavailable') {
    return 503;
  }

  return 401;
}

function mapAccessStatusToErrorCode(status: AgentAccessStatus): AgentRunErrorCode {
  if (status === 'quota_exceeded') {
    return 'quota_exceeded';
  }

  if (status === 'forbidden') {
    return 'forbidden';
  }

  if (status === 'auth_unavailable') {
    return 'auth_unavailable';
  }

  return 'auth_required';
}

function mapQuotaStatusToHttpStatus(status: ConsumeAgentRunQuotaResult['status']): number {
  if (status === 'quota_exceeded') {
    return 429;
  }

  if (status === 'forbidden') {
    return 403;
  }

  if (status === 'auth_unavailable' || status === 'quota_unavailable') {
    return 503;
  }

  return 403;
}

function mapQuotaStatusToErrorCode(status: ConsumeAgentRunQuotaResult['status']): AgentRunErrorCode {
  if (status === 'quota_exceeded') {
    return 'quota_exceeded';
  }

  if (status === 'forbidden') {
    return 'forbidden';
  }

  if (status === 'auth_unavailable') {
    return 'auth_unavailable';
  }

  if (status === 'quota_unavailable') {
    return 'quota_unavailable';
  }

  return 'forbidden';
}

function getSafeAccessReason(access: AgentAccessView): string {
  if (access.reason.trim()) {
    return access.reason;
  }

  if (access.status === 'quota_exceeded') {
    return '本月真实 Agent Run 额度已用完，可继续使用公开演示模式。';
  }

  if (access.status === 'auth_unavailable') {
    return '真实 Agent 权限检查暂不可用，可继续使用公开演示模式。';
  }

  if (access.status === 'forbidden') {
    return '当前账号暂无真实 Agent 使用权限。';
  }

  return '请先登录后使用真实 Agent。';
}

function createErrorResponse(
  res: VercelResponse<ProtectedAgentRunErrorResponse>,
  params: {
    statusCode: number;
    errorMessage: string;
    errorCode?: AgentRunErrorCode;
  }
): void {
  res.status(params.statusCode).json({
    ok: false,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<AgentRunSuccessResponse | ProtectedAgentRunErrorResponse>
) {
  if (req.method !== 'POST') {
    createErrorResponse(res, {
      statusCode: 405,
      errorCode: 'method_not_allowed',
      errorMessage: 'Method not allowed',
    });
    return;
  }

  const body = parseRequestBody(req.body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    createErrorResponse(res, {
      statusCode: 400,
      errorCode: 'invalid_request',
      errorMessage: 'Missing prompt',
    });
    return;
  }

  if (!isProvider(body.provider)) {
    createErrorResponse(res, {
      statusCode: 400,
      errorCode: 'invalid_request',
      errorMessage: 'Invalid provider. Expected postgresql or supabase.',
    });
    return;
  }

  const modelProvider = body.modelProvider;

  if (modelProvider && modelProvider !== 'groq') {
    createErrorResponse(res, {
      statusCode: 400,
      errorCode: 'invalid_request',
      errorMessage: 'Invalid modelProvider. Expected groq.',
    });
    return;
  }

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    createErrorResponse(res, {
      statusCode: 401,
      errorCode: 'auth_required',
      errorMessage: '请先登录后使用真实 Agent。',
    });
    return;
  }

  const verified = await verifySupabaseAccessToken(accessToken);

  if (!verified.ok) {
    createErrorResponse(res, {
      statusCode: verified.errorCode === 'auth_unavailable' ? 503 : 401,
      errorCode: verified.errorCode === 'auth_unavailable' ? 'auth_unavailable' : 'auth_required',
      errorMessage:
        verified.errorCode === 'auth_unavailable'
          ? '真实 Agent 权限检查暂不可用，可继续使用公开演示模式。'
          : '请先登录后使用真实 Agent。',
    });
    return;
  }

  const access = await getAgentAccessViewByUserId(verified.user.userId);

  if (!access.canUseRealAgent) {
    createErrorResponse(res, {
      statusCode: mapAccessStatusToHttpStatus(access.status),
      errorCode: mapAccessStatusToErrorCode(access.status),
      errorMessage: getSafeAccessReason(access),
    });
    return;
  }

  const usageRunId = createLegacyRunId();
  const quota = await consumeAgentRunQuota({
    userId: verified.user.userId,
    runId: usageRunId,
    metadata: {
      endpoint: '/api/agent/run',
      provider: body.provider,
      quotaType: 'agent_run',
    },
  });

  if (!quota.ok || !quota.usageId) {
    createErrorResponse(res, {
      statusCode: mapQuotaStatusToHttpStatus(quota.status),
      errorCode: mapQuotaStatusToErrorCode(quota.status),
      errorMessage: quota.reason,
    });
    return;
  }

  try {
    const runResult = await runAgent({
      prompt,
      provider: body.provider,
      modelProvider: 'groq',
    });

    await finishAgentRunUsage({
      usageId: quota.usageId,
      status: 'completed',
      metadata: {
        endpoint: '/api/agent/run',
        provider: body.provider,
        resultRunId: runResult.id,
      },
    });
    res.status(200).json({
      ok: true,
      run: runResult,
    });
  } catch {
    await finishAgentRunUsage({
      usageId: quota.usageId,
      status: 'failed',
      errorCode: 'agent_run_failed',
      metadata: {
        endpoint: '/api/agent/run',
        provider: body.provider,
      },
    });
    createErrorResponse(res, {
      statusCode: 500,
      errorMessage: 'Agent Run 执行失败，请检查数据源连接、工具配置或模型配置。',
    });
  }
}
