import type {
  ModelProviderId,
} from '@/types/workbench';
import type {
  ModelProviderAvailability,
  ModelProviderStatusView,
  ModelStatusTone,
} from '@/types/modelStatus';
import {
  MODEL_PROVIDER_METADATA,
  getModelProviderMetadata,
} from './modelCatalogMetadata';

export interface BuildModelProviderStatusViewsParams {
  selectedModelId: ModelProviderId;
}

function getGatewayModelStatus(): {
  isConfigured: boolean;
  isAvailable: boolean;
  availability: ModelProviderAvailability;
  statusLabel: string;
  statusDescription: string;
  badgeTone: ModelStatusTone;
} {
  return {
    isConfigured: true,
    isAvailable: true,
    availability: 'available',
    statusLabel: '服务端受控',
    statusDescription: '模型由 CloudBase 函数端白名单 Model Gateway 解析，前端只提交模型 ID。',
    badgeTone: 'success',
  };
}

function createStatusView(params: {
  providerId: ModelProviderId;
  selectedModelId: ModelProviderId;
}): ModelProviderStatusView {
  const metadata = getModelProviderMetadata(params.providerId);
  const isActive = params.selectedModelId === params.providerId;

  if (params.providerId === 'mock-agent') {
    return {
      providerId: params.providerId,
      displayName: metadata.displayName,
      description: metadata.description,
      isActive,
      isConfigured: true,
      isAvailable: true,
      isReserved: false,
      keySource: 'none',
      availability: 'available',
      statusLabel: '公开演示可用',
      statusDescription: '不依赖外部模型和数据库，可完整体验 Agent Workbench 流程。',
      badgeTone: 'success',
      supportsStreaming: metadata.supportsStreaming,
      isGatewayConnected: metadata.isGatewayConnected,
      capabilityLabels: metadata.capabilityLabels,
    };
  }

  const gatewayStatus = getGatewayModelStatus();

  return {
    providerId: params.providerId,
    displayName: metadata.displayName,
    description: metadata.description,
    isActive,
    isConfigured: gatewayStatus.isConfigured,
    isAvailable: gatewayStatus.isAvailable,
    isReserved: metadata.isReserved,
    keySource: 'none',
    availability: gatewayStatus.availability,
    statusLabel: gatewayStatus.statusLabel,
    statusDescription: gatewayStatus.statusDescription,
    badgeTone: gatewayStatus.badgeTone,
    supportsStreaming: metadata.supportsStreaming,
    isGatewayConnected: metadata.isGatewayConnected,
    capabilityLabels: metadata.capabilityLabels,
  };
}

export function buildModelProviderStatusViews(
  params: BuildModelProviderStatusViewsParams,
): ModelProviderStatusView[] {
  return (Object.keys(MODEL_PROVIDER_METADATA) as ModelProviderId[]).map(
    (providerId) =>
      createStatusView({
        providerId,
        selectedModelId: params.selectedModelId,
      }),
  );
}

export function getModelProviderStatusView(
  params: BuildModelProviderStatusViewsParams & {
    providerId: ModelProviderId;
  },
): ModelProviderStatusView {
  const view = buildModelProviderStatusViews(params).find(
    (item) => item.providerId === params.providerId,
  );

  if (view) {
    return view;
  }

  return createStatusView({
    providerId: params.providerId,
    selectedModelId: params.selectedModelId,
  });
}
