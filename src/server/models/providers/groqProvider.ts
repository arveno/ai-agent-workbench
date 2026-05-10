import type { GenerateTextParams, GenerateTextResult, ServerModelProvider } from '../types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GroqStreamEvent = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

function getGroqApiKey(apiKey: string | undefined): string {
  const resolvedApiKey = apiKey?.trim() || process.env.GROQ_API_KEY?.trim() || '';

  if (!resolvedApiKey) {
    throw new Error('未配置 Groq API Key');
  }

  return resolvedApiKey;
}

function getGroqModel(model: string | undefined): string {
  return model?.trim() || DEFAULT_GROQ_MODEL;
}

function getTemperature(temperature: number | undefined): number {
  return typeof temperature === 'number' && Number.isFinite(temperature) ? temperature : 0.2;
}

function createGroqRequestBody(params: GenerateTextParams, stream: boolean): string {
  return JSON.stringify({
    model: getGroqModel(params.model),
    messages: params.messages,
    temperature: getTemperature(params.temperature),
    max_tokens: 600,
    stream,
  });
}

async function readGroqErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim() ? 'Groq 模型服务请求失败' : 'Groq 模型服务请求失败';
  } catch {
    return 'Groq 模型服务请求失败';
  }
}

function emitDeltaSafely(onDelta: (delta: string) => void, delta: string): void {
  try {
    onDelta(delta);
  } catch {
    throw new Error('模型流式输出处理失败');
  }
}

export const groqProvider: ServerModelProvider = {
  id: 'groq',
  displayName: 'Groq',
  supportsStreaming: true,
  generateText: async (params): Promise<GenerateTextResult> => {
    const apiKey = getGroqApiKey(params.apiKey);
    const model = getGroqModel(params.model);
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: createGroqRequestBody({ ...params, model }, false),
    });

    if (!response.ok) {
      throw new Error(await readGroqErrorMessage(response));
    }

    const data = (await response.json()) as GroqChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error('Groq 模型返回为空');
    }

    return {
      text,
      provider: 'groq',
      model,
    };
  },
  streamText: async (params): Promise<GenerateTextResult> => {
    const apiKey = getGroqApiKey(params.apiKey);
    const model = getGroqModel(params.model);
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: createGroqRequestBody({ ...params, model }, true),
    });

    if (!response.ok) {
      throw new Error(await readGroqErrorMessage(response));
    }

    if (!response.body) {
      throw new Error('Groq 模型流式响应不可用');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';

    const flushBufferLines = (): boolean => {
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line || !line.startsWith('data:')) {
          continue;
        }

        const dataText = line.slice('data:'.length).trim();

        if (!dataText) {
          continue;
        }

        if (dataText === '[DONE]') {
          return true;
        }

        try {
          const event = JSON.parse(dataText) as GroqStreamEvent;
          const delta = event.choices?.[0]?.delta?.content;

          if (delta) {
            text += delta;
            emitDeltaSafely(params.onDelta, delta);
          }
        } catch {
          // Ignore malformed provider stream chunks and keep reading.
        }
      }

      return false;
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      if (flushBufferLines()) {
        return {
          text,
          provider: 'groq',
          model,
        };
      }
    }

    buffer += decoder.decode();
    flushBufferLines();

    if (!text.trim()) {
      throw new Error('Groq 模型流式返回为空');
    }

    return {
      text,
      provider: 'groq',
      model,
    };
  },
};
