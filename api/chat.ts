import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ChatRequestBody {
  prompt?: string;
  stream?: boolean;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface GroqStreamEvent {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function readGroqErrorResponse(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await response.json()) as GroqChatResponse | GroqStreamEvent;
      return data.error?.message ?? 'Groq request failed';
    } catch {
      return 'Groq request failed';
    }
  }

  const text = await response.text();
  return text.trim() || 'Groq request failed';
}

async function handleStreamResponse(groqResponse: Response, res: VercelResponse): Promise<void> {
  if (!groqResponse.body) {
    res.status(502).json({
      error: 'Missing stream body',
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const reader = groqResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
        const contentChunk = event.choices?.[0]?.delta?.content;

        if (contentChunk) {
          res.write(contentChunk);
        }
      } catch {
        // Ignore malformed event lines and continue parsing stream.
      }
    }

    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const shouldFinish = flushBufferLines();
      if (shouldFinish) {
        res.end();
        return;
      }
    }

    buffer += decoder.decode();

    if (buffer) {
      const lines = buffer.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line || !line.startsWith('data:')) {
          continue;
        }

        const dataText = line.slice('data:'.length).trim();

        if (!dataText || dataText === '[DONE]') {
          continue;
        }

        try {
          const event = JSON.parse(dataText) as GroqStreamEvent;
          const contentChunk = event.choices?.[0]?.delta?.content;

          if (contentChunk) {
            res.write(contentChunk);
          }
        } catch {
          // Ignore malformed tail chunk.
        }
      }
    }

    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: getErrorMessage(error),
      });
      return;
    }

    res.end();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed',
    });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: 'Missing GROQ_API_KEY',
    });
    return;
  }

  const body = req.body as ChatRequestBody;
  const prompt = body.prompt?.trim();
  const shouldStream = body.stream === true;

  if (!prompt) {
    res.status(400).json({
      error: 'Missing prompt',
    });
    return;
  }

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content:
        '你是一个教育数据分析助手。回答要简洁、专业。请围绕异常指标、可能原因、下一步建议来组织答案。',
    },
    {
      role: 'user',
      content: prompt,
    },
  ];

  try {
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 600,
        stream: shouldStream,
      }),
    });

    if (!groqResponse.ok) {
      const errorMessage = await readGroqErrorResponse(groqResponse);
      res.status(groqResponse.status).json({
        error: errorMessage,
      });
      return;
    }

    if (shouldStream) {
      await handleStreamResponse(groqResponse, res);
      return;
    }

    const data = (await groqResponse.json()) as GroqChatResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      res.status(502).json({
        error: 'Empty model response',
      });
      return;
    }

    res.status(200).json({
      content,
      provider: 'groq',
      model: GROQ_MODEL,
    });
  } catch (error) {
    res.status(500).json({
      error: getErrorMessage(error),
    });
  }
}
