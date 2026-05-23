export const MODEL_PROVIDER_IDS = [
  'mock-agent',
  'siliconflow-qwen-free',
  'siliconflow-glm-free',
  'zhipu-glm-flash-free',
] as const;

export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

export interface ModelProviderMetadata {
  id: ModelProviderId;
  displayName: string;
  shortName: string;
  logoText: string;
  description: string;
  isReserved: boolean;
  supportsStreaming: boolean;
  isGatewayConnected: boolean;
  capabilityLabels: string[];
}

export const MODEL_PROVIDER_METADATA: Record<ModelProviderId, ModelProviderMetadata> = {
  'mock-agent': {
    id: 'mock-agent',
    displayName: '公开演示模式（Mock）',
    shortName: 'Mock 模式',
    logoText: 'Mock',
    description: '使用本地 mock 流式输出，不依赖外部模型，适合稳定演示。',
    isReserved: false,
    supportsStreaming: true,
    isGatewayConnected: false,
    capabilityLabels: ['本地模拟', '支持流式', '稳定演示'],
  },
  'siliconflow-qwen-free': {
    id: 'siliconflow-qwen-free',
    displayName: 'SiliconFlow Qwen Free',
    shortName: 'Qwen Free',
    logoText: 'Qwen',
    description: '通过服务端 Model Gateway 调用 Qwen 轻量模型，适合中文分析与总结。',
    isReserved: false,
    supportsStreaming: true,
    isGatewayConnected: true,
    capabilityLabels: ['服务端转发', '支持流式', 'Agent Run 额度', 'Model Gateway', '免费模型'],
  },
  'siliconflow-glm-free': {
    id: 'siliconflow-glm-free',
    displayName: 'SiliconFlow GLM Free',
    shortName: 'SiliconFlow GLM',
    logoText: 'GLM',
    description: '通过服务端 Model Gateway 调用 GLM 轻量模型，适合低成本真实 Agent 演示。',
    isReserved: false,
    supportsStreaming: true,
    isGatewayConnected: true,
    capabilityLabels: ['服务端转发', '支持流式', 'Agent Run 额度', 'Model Gateway', '免费模型'],
  },
  'zhipu-glm-flash-free': {
    id: 'zhipu-glm-flash-free',
    displayName: 'Zhipu GLM Flash Free',
    shortName: 'Zhipu GLM Flash',
    logoText: 'GLM',
    description: '通过服务端 Model Gateway 调用智谱 GLM Flash 模型，使用独立服务端配置。',
    isReserved: false,
    supportsStreaming: true,
    isGatewayConnected: true,
    capabilityLabels: ['服务端转发', '支持流式', 'Agent Run 额度', 'Model Gateway', '免费模型'],
  },
};

export function getModelProviderMetadata(
  providerId: ModelProviderId,
): ModelProviderMetadata {
  return MODEL_PROVIDER_METADATA[providerId];
}

export function getModelProviderList(): ModelProviderMetadata[] {
  return MODEL_PROVIDER_IDS.map((providerId) => getModelProviderMetadata(providerId));
}

export function isModelProviderId(value: string): value is ModelProviderId {
  return MODEL_PROVIDER_IDS.includes(value as ModelProviderId);
}
