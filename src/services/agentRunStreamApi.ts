import type { DataSourceTestableProviderId, RunEvent } from '@/types/workbench';

const RUN_EVENT_TYPES = new Set<RunEvent['type']>([
  'run_started',
  'step_started',
  'step_completed',
  'step_failed',
  'tool_started',
  'tool_completed',
  'tool_failed',
  'chart_ready',
  'conclusion_delta',
  'conclusion_completed',
  'rag_sources_ready',
  'report_pending',
  'run_completed',
  'run_failed',
  'run_stopped',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRunEvent(value: unknown): value is RunEvent {
  if (!isRecord(value)) {
    return false;
  }

  const eventType = value.type;

  return typeof eventType === 'string' && RUN_EVENT_TYPES.has(eventType as RunEvent['type']);
}

function parseSseBlock(block: string): unknown | null {
  const dataText = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');

  if (!dataText) {
    return null;
  }

  try {
    return JSON.parse(dataText) as unknown;
  } catch {
    return null;
  }
}

function consumeSseBlocks(buffer: string, onEvent: (event: RunEvent) => void): string {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const remainingBuffer = blocks.pop() ?? '';

  for (const block of blocks) {
    const parsedEvent = parseSseBlock(block);

    if (isRunEvent(parsedEvent)) {
      onEvent(parsedEvent);
    }
  }

  return remainingBuffer;
}

async function readAgentRunStreamError(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const parsed = (await response.json()) as unknown;

      if (
        isRecord(parsed) &&
        typeof parsed.errorMessage === 'string' &&
        parsed.errorMessage.trim()
      ) {
        return parsed.errorMessage.trim();
      }
    }

    const text = await response.text();

    if (text.trim()) {
      return text.trim();
    }
  } catch {
    // Keep the caller on a safe product message when the error body is unreadable.
  }

  if (response.status === 401) {
    return '请先登录后使用真实 Agent。';
  }

  if (response.status === 429) {
    return '本月真实 Agent Run 额度已用完，可继续使用公开演示模式。';
  }

  if (response.status === 403) {
    return '当前账号暂无真实 Agent 使用权限。';
  }

  if (response.status === 503) {
    return '真实 Agent 权限检查暂不可用，可继续使用公开演示模式。';
  }

  return 'Agent Run 流式请求失败';
}

export async function streamAgentRunAnalysis(params: {
  prompt: string;
  provider: DataSourceTestableProviderId;
  conversationId: string;
  clientRunId?: string;
  accessToken?: string | null;
  signal?: AbortSignal;
  onEvent: (event: RunEvent) => void;
}): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const accessToken = params.accessToken?.trim();

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch('/api/agent/run/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: params.prompt,
      provider: params.provider,
      conversationId: params.conversationId,
      modelProvider: 'groq',
      clientRunId: params.clientRunId,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(await readAgentRunStreamError(response));
  }

  if (!response.body) {
    throw new Error('当前环境不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSseBlocks(buffer, params.onEvent);
  }

  buffer += decoder.decode();
  consumeSseBlocks(`${buffer}\n\n`, params.onEvent);
}
