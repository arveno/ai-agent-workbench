import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runAgent } from '../../src/server/agent/runAgent';
import type { AgentRunErrorResponse, AgentRunRequest, AgentRunSuccessResponse } from '../../src/server/agent/types';

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

function createErrorResponse(
  res: VercelResponse<AgentRunErrorResponse>,
  params: {
    statusCode: number;
    errorMessage: string;
  }
): void {
  res.status(params.statusCode).json({
    ok: false,
    errorMessage: params.errorMessage,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<AgentRunSuccessResponse | AgentRunErrorResponse>
) {
  if (req.method !== 'POST') {
    createErrorResponse(res, {
      statusCode: 405,
      errorMessage: 'Method not allowed',
    });
    return;
  }

  const body = parseRequestBody(req.body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    createErrorResponse(res, {
      statusCode: 400,
      errorMessage: 'Missing prompt',
    });
    return;
  }

  if (!isProvider(body.provider)) {
    createErrorResponse(res, {
      statusCode: 400,
      errorMessage: 'Invalid provider. Expected postgresql or supabase.',
    });
    return;
  }

  const modelProvider = body.modelProvider;

  if (modelProvider && modelProvider !== 'groq') {
    createErrorResponse(res, {
      statusCode: 400,
      errorMessage: 'Invalid modelProvider. Expected groq.',
    });
    return;
  }

  try {
    const runResult = await runAgent({
      prompt,
      provider: body.provider,
      modelProvider: 'groq',
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
    });

    res.status(200).json({
      ok: true,
      run: runResult,
    });
  } catch {
    createErrorResponse(res, {
      statusCode: 500,
      errorMessage: 'Agent Run 执行失败，请检查数据源连接、工具配置或模型配置。',
    });
  }
}
