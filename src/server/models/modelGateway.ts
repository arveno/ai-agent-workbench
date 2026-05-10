import { geminiProvider } from './providers/geminiProvider';
import { groqProvider } from './providers/groqProvider';
import { ollamaProvider } from './providers/ollamaProvider';
import { openaiProvider } from './providers/openaiProvider';
import { openrouterProvider } from './providers/openrouterProvider';
import type {
  GenerateTextParams,
  GenerateTextResult,
  ServerModelProvider,
  ServerModelProviderId,
  StreamTextParams,
} from './types';

const MODEL_PROVIDER_REGISTRY: Record<ServerModelProviderId, ServerModelProvider> = {
  groq: groqProvider,
  openai: openaiProvider,
  openrouter: openrouterProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

export function getServerModelProvider(provider: ServerModelProviderId): ServerModelProvider {
  return MODEL_PROVIDER_REGISTRY[provider];
}

function toModelGatewayError(error: unknown): Error {
  if (error instanceof Error && error.message.trim()) {
    return new Error(error.message);
  }

  return new Error('当前模型服务暂不可用');
}

export async function generateTextWithModelGateway(
  params: GenerateTextParams,
): Promise<GenerateTextResult> {
  try {
    return await getServerModelProvider(params.provider).generateText(params);
  } catch (error) {
    throw toModelGatewayError(error);
  }
}

export async function streamTextWithModelGateway(
  params: StreamTextParams,
): Promise<GenerateTextResult> {
  try {
    return await getServerModelProvider(params.provider).streamText(params);
  } catch (error) {
    throw toModelGatewayError(error);
  }
}
