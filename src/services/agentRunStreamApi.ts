import type { DataSourceTestableProviderId, RunEvent } from '@/types/workbench';

const RUN_EVENT_TYPES = new Set<RunEvent['type']>([
  'run_started',
  'step_started',
  'step_completed',
  'tool_started',
  'tool_completed',
  'chart_ready',
  'conclusion_delta',
  'conclusion_completed',
  'report_pending',
  'report_generated',
  'report_skipped',
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

export async function streamAgentRunAnalysis(params: {
  prompt: string;
  provider: DataSourceTestableProviderId;
  apiKey?: string;
  signal?: AbortSignal;
  onEvent: (event: RunEvent) => void;
}): Promise<void> {
  const response = await fetch('/api/agent/run/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: params.prompt,
      provider: params.provider,
      modelProvider: 'groq',
      apiKey: params.apiKey,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error('Agent Run 流式请求失败');
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
