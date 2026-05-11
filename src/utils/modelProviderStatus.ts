import type { HealthCheckResponse } from '@/types/health';
import type {
  ModelConfigs,
  ModelProviderConfig,
  ModelProviderId,
} from '@/types/workbench';
import type {
  ModelKeySource,
  ModelProviderAvailability,
  ModelProviderStatusView,
  ModelStatusTone,
} from '@/types/modelStatus';
import {
  MODEL_PROVIDER_METADATA,
  getModelProviderMetadata,
} from './modelProviderMetadata';

export interface BuildModelProviderStatusViewsParams {
  currentModelProvider: ModelProviderId;
  modelConfigs: ModelConfigs;
  health: HealthCheckResponse | null;
}

function hasLocalProviderConfig(providerId: ModelProviderId, config: ModelProviderConfig | undefined): boolean {
  if (providerId === 'mock' || providerId === 'codex-oauth') {
    return false;
  }

  if (providerId === 'ollama') {
    return Boolean(config?.baseUrl?.trim() && config?.modelName?.trim());
  }

  return false;
}

function getGroqStatus(params: {
  health: HealthCheckResponse | null;
}): {
  keySource: ModelKeySource;
  isConfigured: boolean;
  isAvailable: boolean;
  availability: ModelProviderAvailability;
  statusLabel: string;
  statusDescription: string;
  badgeTone: ModelStatusTone;
} {
  const serverConfigured = params.health?.services.groq.configured === true;
  if (serverConfigured) {
    return {
      keySource: 'server_env',
      isConfigured: true,
      isAvailable: true,
      availability: 'available',
      statusLabel: '服务端已配置',
      statusDescription: '服务端 GROQ_API_KEY 已配置，登录且有额度后可使用真实 Agent。',
      badgeTone: 'success',
    };
  }

  if (params.health?.services.groq.status === 'error') {
    return {
      keySource: 'none',
      isConfigured: false,
      isAvailable: false,
      availability: 'error',
      statusLabel: '连接异常',
      statusDescription: '服务端模型状态检查异常，可继续使用公开演示模式。',
      badgeTone: 'danger',
    };
  }

  return {
    keySource: 'none',
    isConfigured: false,
    isAvailable: false,
    availability: 'not_configured',
    statusLabel: '未配置',
    statusDescription: '未配置服务端 GROQ_API_KEY，真实 Agent 暂不可用，可继续使用公开演示模式。',
    badgeTone: 'warning',
  };
}

function createStatusView(params: {
  providerId: ModelProviderId;
  currentModelProvider: ModelProviderId;
  modelConfigs: ModelConfigs;
  health: HealthCheckResponse | null;
}): ModelProviderStatusView {
  const metadata = getModelProviderMetadata(params.providerId);
  const isActive = params.currentModelProvider === params.providerId;

  if (params.providerId === 'mock') {
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

  if (params.providerId === 'groq') {
    const groqStatus = getGroqStatus({
      health: params.health,
    });

    return {
      providerId: params.providerId,
      displayName: metadata.displayName,
      description: metadata.description,
      isActive,
      isConfigured: groqStatus.isConfigured,
      isAvailable: groqStatus.isAvailable,
      isReserved: false,
      keySource: groqStatus.keySource,
      availability: groqStatus.availability,
      statusLabel: groqStatus.statusLabel,
      statusDescription: groqStatus.statusDescription,
      badgeTone: groqStatus.badgeTone,
      supportsStreaming: metadata.supportsStreaming,
      isGatewayConnected: metadata.isGatewayConnected,
      capabilityLabels: metadata.capabilityLabels,
    };
  }

  if (metadata.isReserved) {
    return {
      providerId: params.providerId,
      displayName: metadata.displayName,
      description: metadata.description,
      isActive,
      isConfigured: false,
      isAvailable: false,
      isReserved: true,
      keySource: 'none',
      availability: 'reserved',
      statusLabel: '预留',
      statusDescription: '该模型入口已预留，暂未接入真实调用。',
      badgeTone: 'muted',
      supportsStreaming: metadata.supportsStreaming,
      isGatewayConnected: metadata.isGatewayConnected,
      capabilityLabels: metadata.capabilityLabels,
    };
  }

  const hasConfig = hasLocalProviderConfig(
    params.providerId,
    params.modelConfigs[params.providerId],
  );

  return {
    providerId: params.providerId,
    displayName: metadata.displayName,
    description: metadata.description,
    isActive,
    isConfigured: hasConfig,
    isAvailable: hasConfig,
    isReserved: false,
    keySource: 'none',
    availability: hasConfig ? 'available' : 'not_configured',
    statusLabel: hasConfig ? '已配置' : '未配置',
    statusDescription: hasConfig ? '当前模型配置已就绪。' : '未检测到当前模型配置。',
    badgeTone: hasConfig ? 'success' : 'warning',
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
        currentModelProvider: params.currentModelProvider,
        modelConfigs: params.modelConfigs,
        health: params.health,
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
    currentModelProvider: params.currentModelProvider,
    modelConfigs: params.modelConfigs,
    health: params.health,
  });
}
