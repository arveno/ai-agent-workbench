import type { ServerModelProvider } from '../types';

async function throwNotConnected(): Promise<never> {
  throw new Error('OpenRouter 模型服务暂未接入');
}

export const openrouterProvider: ServerModelProvider = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  supportsStreaming: true,
  generateText: throwNotConnected,
  streamText: throwNotConnected,
};
