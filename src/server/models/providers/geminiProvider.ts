import type { ServerModelProvider } from '../types';

async function throwNotConnected(): Promise<never> {
  throw new Error('Gemini 模型服务暂未接入');
}

export const geminiProvider: ServerModelProvider = {
  id: 'gemini',
  displayName: 'Gemini',
  supportsStreaming: true,
  generateText: throwNotConnected,
  streamText: throwNotConnected,
};
