interface ChatApiResponse {
  content: string;
  provider: string;
  model: string;
}

interface ChatApiErrorResponse {
  error?: string;
}

async function parseErrorResponse(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await response.json()) as ChatApiErrorResponse;
      return data.error ?? 'Groq request failed';
    } catch {
      return 'Groq request failed';
    }
  }

  const text = await response.text();
  return text.trim() || 'Groq request failed';
}

export async function requestGroqChat(params: {
  prompt: string;
  apiKey?: string;
}): Promise<ChatApiResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.apiKey
        ? {
            'x-groq-api-key': params.apiKey,
          }
        : {}),
    },
    body: JSON.stringify({
      prompt: params.prompt,
    }),
  });

  const data = (await response.json()) as Partial<ChatApiResponse> & ChatApiErrorResponse;

  if (!response.ok) {
    throw new Error(data.error ?? 'Groq request failed');
  }

  if (!data.content || !data.provider || !data.model) {
    throw new Error('Invalid chat response');
  }

  return {
    content: data.content,
    provider: data.provider,
    model: data.model,
  };
}

export async function streamGroqChat(params: {
  prompt: string;
  apiKey?: string;
  onChunk: (chunk: string) => void;
}): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.apiKey
        ? {
            'x-groq-api-key': params.apiKey,
          }
        : {}),
    },
    body: JSON.stringify({
      prompt: params.prompt,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  if (!response.body) {
    throw new Error('Streaming response body is unavailable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      const tail = decoder.decode();
      if (tail) {
        params.onChunk(tail);
      }
      break;
    }

    const chunk = decoder.decode(value, { stream: true });

    if (chunk) {
      params.onChunk(chunk);
    }
  }
}
