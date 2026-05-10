import type { ServerModelProvider } from '../types';

async function throwNotConnected(): Promise<never> {
  throw new Error('Ollama 模型服务暂未接入');
}

export const ollamaProvider: ServerModelProvider = {
  id: 'ollama',
  displayName: 'Ollama',
  supportsStreaming: true,
  generateText: throwNotConnected,
  streamText: throwNotConnected,
};
