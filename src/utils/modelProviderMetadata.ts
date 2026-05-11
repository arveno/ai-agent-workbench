import type { ModelProviderId } from '@/types/workbench';

export interface ModelProviderMetadata {
  id: ModelProviderId;
  displayName: string;
  description: string;
  isReserved: boolean;
  supportsStreaming: boolean;
  isGatewayConnected: boolean;
  capabilityLabels: string[];
}

export const MODEL_PROVIDER_METADATA: Record<ModelProviderId, ModelProviderMetadata> = {
  mock: {
    id: 'mock',
    displayName: '公开演示模式（Mock）',
    description: '使用本地 mock 流式输出，不依赖外部模型，适合稳定演示。',
    isReserved: false,
    supportsStreaming: true,
    isGatewayConnected: false,
    capabilityLabels: ['本地模拟', '支持流式', '稳定演示'],
  },
  groq: {
    id: 'groq',
    displayName: '真实 Agent（服务端模型）',
    description: '登录后通过服务端模型服务运行真实 Agent，按 Agent Run 额度使用。',
    isReserved: false,
    supportsStreaming: true,
    isGatewayConnected: true,
    capabilityLabels: ['服务端转发', '支持流式', 'Agent Run 额度', 'Model Gateway'],
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini API',
    description: '可使用 Google Gemini API 免费额度进行真实模型演示。',
    isReserved: true,
    supportsStreaming: false,
    isGatewayConnected: false,
    capabilityLabels: ['模型预留', '待接入 Model Gateway'],
  },
  openrouter: {
    id: 'openrouter',
    displayName: 'OpenRouter Free',
    description: '可通过 OpenRouter 免费模型接入多模型能力。',
    isReserved: true,
    supportsStreaming: false,
    isGatewayConnected: false,
    capabilityLabels: ['模型预留', '待接入 Model Gateway'],
  },
  'openai-api-key': {
    id: 'openai-api-key',
    displayName: 'OpenAI',
    description: '预留 OpenAI 服务端模型入口，后续由平台统一配置。',
    isReserved: true,
    supportsStreaming: false,
    isGatewayConnected: false,
    capabilityLabels: ['模型预留', '待接入 Model Gateway'],
  },
  'codex-oauth': {
    id: 'codex-oauth',
    displayName: 'OpenAI / Codex OAuth',
    description: '预留 ChatGPT / Codex 授权路线，适合类似 OpenClaw 的订阅侧模型连接方式。',
    isReserved: true,
    supportsStreaming: false,
    isGatewayConnected: false,
    capabilityLabels: ['OAuth 预留', '待接入 Model Gateway'],
  },
  ollama: {
    id: 'ollama',
    displayName: '本地 Ollama',
    description: '面向本地模型演示，暂未接入真实调用。',
    isReserved: true,
    supportsStreaming: false,
    isGatewayConnected: false,
    capabilityLabels: ['本地模型预留', '待接入 Model Gateway'],
  },
};

export function getModelProviderMetadata(
  providerId: ModelProviderId,
): ModelProviderMetadata {
  return MODEL_PROVIDER_METADATA[providerId];
}
