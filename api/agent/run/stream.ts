import type { VercelRequest, VercelResponse } from '@vercel/node';
import { streamAgentRun } from '../../../src/server/agent/streamAgentRun';
import type { AgentRunRequest } from '../../../src/server/agent/types';
import type { RunEvent } from '../../../src/types/run';

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

function writeRunEvent(res: VercelResponse, event: RunEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeJsonError(res: VercelResponse, statusCode: number, errorMessage: string): void {
  res.status(statusCode).json({
    ok: false,
    errorMessage,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    writeJsonError(res, 405, 'Method not allowed');
    return;
  }

  const body = parseRequestBody(req.body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    writeJsonError(res, 400, 'Missing prompt');
    return;
  }

  if (!isProvider(body.provider)) {
    writeJsonError(res, 400, 'Invalid provider. Expected postgresql or supabase.');
    return;
  }

  if (body.modelProvider && body.modelProvider !== 'groq') {
    writeJsonError(res, 400, 'Invalid modelProvider. Expected groq.');
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  try {
    await streamAgentRun({
      prompt,
      provider: body.provider,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      emit: (event) => writeRunEvent(res, event),
    });
  } catch {
    writeRunEvent(res, {
      type: 'run_failed',
      runId: 'run_stream_error',
      errorMessage: 'Agent Run 执行失败，请检查数据源或模型配置。',
    });
  } finally {
    res.end();
  }
}
