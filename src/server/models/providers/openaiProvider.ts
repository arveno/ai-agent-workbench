import type { ServerModelProvider } from '../types';

async function throwNotConnected(): Promise<never> {
  throw new Error('OpenAI 模型服务暂未接入');
}

export const openaiProvider: ServerModelProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  supportsStreaming: true,
  generateText: throwNotConnected,
  streamText: throwNotConnected,
};
