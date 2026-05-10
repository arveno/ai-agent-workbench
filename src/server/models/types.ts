export type ServerModelProviderId = 'groq' | 'openai' | 'openrouter' | 'gemini' | 'ollama';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateTextParams {
  provider: ServerModelProviderId;
  apiKey?: string;
  model?: string;
  messages: ModelMessage[];
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  provider: ServerModelProviderId;
  model?: string;
}

export interface StreamTextParams extends GenerateTextParams {
  onDelta: (delta: string) => void;
}

export interface ServerModelProvider {
  id: ServerModelProviderId;
  displayName: string;
  supportsStreaming: boolean;
  generateText: (params: GenerateTextParams) => Promise<GenerateTextResult>;
  streamText: (params: StreamTextParams) => Promise<GenerateTextResult>;
}
