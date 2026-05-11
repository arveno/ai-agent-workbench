import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  consumeAgentRunQuota,
  finishAgentRunUsage,
  type ConsumeAgentRunQuotaResult,
} from '../../../src/server/auth/agentQuota';
import { getAgentAccessViewByUserId } from '../../../src/server/auth/agentAccess';
import type { AgentAccessStatus, AgentAccessView, AgentRunUsageFinalStatus } from '../../../src/server/auth/types';
import { verifySupabaseAccessToken } from '../../../src/server/auth/verifySupabaseToken';
import { streamAgentRun } from '../../../src/server/agent/streamAgentRun';
import type { AgentRunRequest } from '../../../src/server/agent/types';
import type { RunEvent } from '../../../src/types/run';

type AgentRunStreamRequest = Partial<AgentRunRequest> & {
  clientRunId?: unknown;
};

type AgentRunStreamErrorCode =
  | 'auth_required'
  | 'forbidden'
  | 'quota_exceeded'
  | 'auth_unavailable'
  | 'quota_unavailable'
  | 'invalid_request'
  | 'method_not_allowed';

function parseRequestBody(body: unknown): AgentRunStreamRequest {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as AgentRunStreamRequest;
    } catch {
      return {};
    }
  }

  if (typeof body === 'object' && body !== null) {
    return body as AgentRunStreamRequest;
  }

  return {};
}

function isProvider(value: unknown): value is AgentRunRequest['provider'] {
  return value === 'postgresql' || value === 'supabase';
}

function writeRunEvent(res: VercelResponse, event: RunEvent): void {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeJsonError(
  res: VercelResponse,
  statusCode: number,
  errorCode: AgentRunStreamErrorCode,
  errorMessage: string
): void {
  res.status(statusCode).json({
    ok: false,
    errorCode,
    errorMessage,
  });
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

function createFallbackRunId(): string {
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

function mapAccessStatusToErrorCode(status: AgentAccessStatus): AgentRunStreamErrorCode {
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

function mapQuotaStatusToErrorCode(status: ConsumeAgentRunQuotaResult['status']): AgentRunStreamErrorCode {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    writeJsonError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const body = parseRequestBody(req.body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    writeJsonError(res, 400, 'invalid_request', 'Missing prompt');
    return;
  }

  if (!isProvider(body.provider)) {
    writeJsonError(res, 400, 'invalid_request', 'Invalid provider. Expected postgresql or supabase.');
    return;
  }

  if (body.modelProvider && body.modelProvider !== 'groq') {
    writeJsonError(res, 400, 'invalid_request', 'Invalid modelProvider. Expected groq.');
    return;
  }

  const runId =
    typeof body.clientRunId === 'string' && body.clientRunId.trim()
      ? body.clientRunId.trim()
      : createFallbackRunId();

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    writeJsonError(res, 401, 'auth_required', '请先登录后使用真实 Agent。');
    return;
  }

  const verified = await verifySupabaseAccessToken(accessToken);

  if (!verified.ok) {
    writeJsonError(
      res,
      verified.errorCode === 'auth_unavailable' ? 503 : 401,
      verified.errorCode === 'auth_unavailable' ? 'auth_unavailable' : 'auth_required',
      verified.errorCode === 'auth_unavailable'
        ? '真实 Agent 权限检查暂不可用，可继续使用公开演示模式。'
        : '请先登录后使用真实 Agent。'
    );
    return;
  }

  const access = await getAgentAccessViewByUserId(verified.user.userId);

  if (!access.canUseRealAgent) {
    writeJsonError(
      res,
      mapAccessStatusToHttpStatus(access.status),
      mapAccessStatusToErrorCode(access.status),
      getSafeAccessReason(access)
    );
    return;
  }

  const quota = await consumeAgentRunQuota({
    userId: verified.user.userId,
    runId,
    metadata: {
      endpoint: '/api/agent/run/stream',
      provider: body.provider,
      quotaType: 'agent_run',
    },
  });

  if (!quota.ok || !quota.usageId) {
    writeJsonError(
      res,
      mapQuotaStatusToHttpStatus(quota.status),
      mapQuotaStatusToErrorCode(quota.status),
      quota.reason
    );
    return;
  }

  let usageFinalStatus: AgentRunUsageFinalStatus = 'completed';
  let usageErrorCode: string | null = null;
  let streamFinished = false;
  let clientDisconnected = false;

  res.on('close', () => {
    if (!streamFinished) {
      clientDisconnected = true;
    }
  });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  try {
    await streamAgentRun({
      prompt,
      provider: body.provider,
      clientRunId: runId,
      emit: (event) => {
        if (event.type === 'run_failed') {
          usageFinalStatus = 'failed';
          usageErrorCode = 'agent_run_failed';
        }

        if (event.type === 'run_stopped') {
          usageFinalStatus = 'stopped';
        }

        writeRunEvent(res, event);
      },
    });
  } catch {
    usageFinalStatus = 'failed';
    usageErrorCode = 'agent_stream_failed';
    writeRunEvent(res, {
      type: 'run_failed',
      runId,
      errorMessage: 'Agent Run 执行失败，请检查数据源或模型配置。',
    });
  } finally {
    streamFinished = true;

    await finishAgentRunUsage({
      usageId: quota.usageId,
      status: clientDisconnected && usageFinalStatus === 'completed' ? 'stopped' : usageFinalStatus,
      errorCode: clientDisconnected && usageFinalStatus === 'completed' ? null : usageErrorCode,
      metadata: {
        endpoint: '/api/agent/run/stream',
        provider: body.provider,
      },
    });

    res.end();
  }
}
