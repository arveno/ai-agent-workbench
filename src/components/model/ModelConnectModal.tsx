import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildRealAgentAvailabilityView, type RealAgentAvailabilityView } from '@/services/agentAccessViewModel';
import type { HealthCheckResponse } from '@/types/health';
import type { ModelProviderStatusView } from '@/types/modelStatus';
import { buildModelProviderStatusViews } from '@/utils/modelProviderStatus';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { requestHealthCheck } from '../../services/healthApi';
import type { ModelProviderId } from '../../types/workbench';

interface ProviderOption {
  id: ModelProviderId;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'mock',
  },
  {
    id: 'groq',
  },
];

const providerLogoMap: Partial<Record<ModelProviderId, string>> = {
  groq: '/brands/groq.svg',
  gemini: '/brands/gemini.svg',
  openrouter: '/brands/openrouter.svg',
  'openai-api-key': '/brands/openai.svg',
  'codex-oauth': '/brands/openai.svg',
  ollama: '/brands/ollama.svg',
};

const providerFallbackTextMap: Record<ModelProviderId, string> = {
  mock: 'Mock',
  groq: 'Groq',
  gemini: 'Gemini',
  openrouter: 'OR',
  'openai-api-key': 'OpenAI',
  'codex-oauth': 'OpenAI',
  ollama: 'Ollama',
};

type ModelTabId = 'all' | 'configured' | 'usable' | 'reserved';

interface ModelTabDefinition {
  id: ModelTabId;
  label: string;
  description: string;
}

const MODEL_TABS: ModelTabDefinition[] = [
  {
    id: 'all',
    label: '全部模型',
    description: '查看当前工作台展示的全部模型服务入口。',
  },
  {
    id: 'configured',
    label: '已就绪',
    description: '公开演示模式或服务端模型环境已配置的入口。',
  },
  {
    id: 'usable',
    label: '可启用',
    description: '当前主流程可切换的公开演示和真实 Agent 模型服务。',
  },
  {
    id: 'reserved',
    label: '预留',
    description: '已在 UI 中预留入口，后续再接入 Model Gateway 的模型服务。',
  },
];

interface ModelProviderLogoProps {
  providerId: ModelProviderId;
  alt: string;
}

function ModelProviderLogo({ providerId, alt }: ModelProviderLogoProps) {
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  if (providerId === 'mock') {
    return <AppIcon icon={icons.brand} size={20} />;
  }

  const logoSrc = providerLogoMap[providerId];

  if (!logoSrc || logoLoadFailed) {
    return <span className="model-option-logo-fallback">{providerFallbackTextMap[providerId]}</span>;
  }

  return (
    <img
      src={logoSrc}
      alt={alt}
      className="model-option-logo"
      onError={() => {
        setLogoLoadFailed(true);
      }}
    />
  );
}

function getCapabilityClassName(label: string): string {
  if (label === 'Model Gateway') {
    return 'model-badge model-badge-gateway';
  }

  if (label.includes('预留') || label.includes('待接入')) {
    return 'model-badge model-badge-muted';
  }

  if (label === '服务端转发' || label === '支持流式' || label === 'Agent Run 额度') {
    return 'model-badge model-badge-blue';
  }

  return 'model-badge model-badge-green';
}

function getKeySourceLabel(status: ModelProviderStatusView): string {
  if (status.providerId === 'mock') {
    return '不需要 Key';
  }

  if (status.isReserved) {
    return '预留';
  }

  if (status.keySource === 'server_env') {
    return '服务端 GROQ_API_KEY';
  }

  return status.providerId === 'groq' ? '服务端未配置' : '未配置';
}

function getStreamingLabel(status: ModelProviderStatusView): string {
  if (status.supportsStreaming) {
    return '支持 streaming';
  }

  return '待接入 streaming';
}

function getGatewayLabel(status: ModelProviderStatusView): string {
  if (status.isGatewayConnected) {
    return '已接入 Model Gateway';
  }

  if (status.providerId === 'mock') {
    return '本地模拟，不走 Gateway';
  }

  return '待接入 Model Gateway';
}

function isRealAgentEntryProvider(providerId: ModelProviderId): boolean {
  return providerId === 'groq';
}

function getRealAgentActionText(availability: RealAgentAvailabilityView): string {
  if (availability.status === 'login_required') {
    return '登录后启用';
  }

  if (availability.status === 'checking') {
    return '检查中';
  }

  if (availability.status === 'quota_exceeded') {
    return '额度已用完';
  }

  if (availability.status === 'auth_unavailable') {
    return '暂不可用';
  }

  if (availability.status === 'forbidden') {
    return '无权限';
  }

  return '启用';
}

function ModelConnectModalContent() {
  const authView = useAuthSessionView();
  const agentAccess = useAuthStore((state) => state.agentAccess);
  const isAgentAccessLoading = useAuthStore((state) => state.isAgentAccessLoading);
  const openLoginModal = useAuthStore((state) => state.openLoginModal);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const modelConfigs = useWorkbenchStore((state) => state.modelConfigs);
  const closeModelModal = useWorkbenchStore((state) => state.closeModelModal);
  const setCurrentModelProvider = useWorkbenchStore((state) => state.setCurrentModelProvider);

  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [hasHealthFailed, setHasHealthFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void requestHealthCheck()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setHealth(response);
        setHasHealthFailed(false);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setHasHealthFailed(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const providerStatusViews = useMemo(
    () =>
      buildModelProviderStatusViews({
        currentModelProvider,
        modelConfigs,
        health,
      }),
    [currentModelProvider, health, modelConfigs],
  );

  const providerStatusMap = useMemo(
    () =>
      providerStatusViews.reduce<Record<ModelProviderId, ModelProviderStatusView>>(
        (map, status) => ({
          ...map,
          [status.providerId]: status,
        }),
        {} as Record<ModelProviderId, ModelProviderStatusView>,
      ),
    [providerStatusViews],
  );
  const realAgentAvailability = buildRealAgentAvailabilityView({
    authView,
    agentAccess,
    isAgentAccessLoading,
  });

  const getProviderStatusView = (providerId: ModelProviderId): ModelProviderStatusView =>
    providerStatusMap[providerId];

  const getProvidersByTab = (tabId: ModelTabId): ProviderOption[] => {
    if (tabId === 'all') {
      return PROVIDER_OPTIONS;
    }

    if (tabId === 'configured') {
      return PROVIDER_OPTIONS.filter((option) => getProviderStatusView(option.id).isConfigured);
    }

    if (tabId === 'usable') {
      return PROVIDER_OPTIONS.filter((option) => {
        const status = getProviderStatusView(option.id);
        return !status.isReserved;
      });
    }

    return PROVIDER_OPTIONS.filter((option) => getProviderStatusView(option.id).isReserved);
  };

  const canActivateProvider = (status: ModelProviderStatusView): boolean => {
    if (status.providerId === 'mock') {
      return true;
    }

    if (status.isReserved) {
      return false;
    }

    return status.isAvailable;
  };

  const canClickProviderAction = (status: ModelProviderStatusView): boolean => {
    if (!canActivateProvider(status)) {
      return false;
    }

    if (!isRealAgentEntryProvider(status.providerId)) {
      return true;
    }

    return realAgentAvailability.canEnterRealAgent || realAgentAvailability.status === 'login_required';
  };

  const getProviderStatusClassName = (status: ModelProviderStatusView): string => {
    if (status.badgeTone === 'muted' || status.availability === 'reserved') {
      return 'model-badge model-badge-muted';
    }

    if (status.badgeTone === 'success') {
      return 'model-badge model-badge-green';
    }

    if (status.providerId === 'mock') {
      return 'model-badge model-badge-blue';
    }

    return 'model-badge model-badge-muted';
  };

  const getProviderActionText = (status: ModelProviderStatusView): string => {
    if (status.isActive) {
      return '使用中';
    }

    if (isRealAgentEntryProvider(status.providerId) && !status.isAvailable) {
      return '暂不可用';
    }

    if (isRealAgentEntryProvider(status.providerId) && !realAgentAvailability.canEnterRealAgent) {
      return getRealAgentActionText(realAgentAvailability);
    }

    if (status.isReserved) {
      return '先配置';
    }

    return canActivateProvider(status) ? '启用' : '先配置';
  };

  return (
    <div
      className="model-modal-mask"
      role="dialog"
      aria-modal="true"
      aria-label="连接模型服务"
      onClick={closeModelModal}
    >
      <div
        className="model-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="model-modal-head">
          <div className="model-modal-title-wrap">
            <h3 className="model-modal-title">连接模型服务</h3>
            <p className="model-modal-subtitle">
              选择当前会话使用的模型服务：公开演示模式或服务端受控真实 Agent。
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" className="model-modal-close" onClick={closeModelModal} aria-label="关闭">
            ×
          </Button>
        </div>

        <div className="model-modal-body">
          <Card className="model-modal-info-card" size="sm">
            <CardContent className="model-modal-info-content">
              <p>当前线上 Demo 默认使用 Mock 模式，避免公开演示产生 API 成本。</p>
              <p>模型调用由服务端受控转发，前端不接收、不保存、不传递模型 API Key。</p>
              <p>真实 Agent 使用服务端 GROQ_API_KEY，并按 Agent Run 额度使用。</p>
              {hasHealthFailed ? <p>服务端状态检查失败，当前仍可使用公开演示模式。</p> : null}
            </CardContent>
          </Card>

          <Tabs defaultValue="all" className="model-tabs">
            <TabsList className="model-tabs-list">
              {MODEL_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="model-tab-trigger">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {MODEL_TABS.map((tab) => {
              const providers = getProvidersByTab(tab.id);

              return (
                <TabsContent key={tab.id} value={tab.id} className="model-tab-content">
                  <div className="model-tab-heading">
                    <div>
                      <h4 className="model-tab-title">{tab.label}</h4>
                      <p className="model-tab-description">{tab.description}</p>
                    </div>
                    <span className="model-tab-count">{providers.length} 个模型</span>
                  </div>

                  <ScrollArea className="model-scroll">
                    {providers.length > 0 ? (
                      <div className="model-provider-list">
                        {providers.map((option) => {
                          const providerStatus = getProviderStatusView(option.id);
                          const isActiveProvider = providerStatus.isActive;
                          const canClickAction = canClickProviderAction(providerStatus);
                          const capabilities = providerStatus.capabilityLabels;

                          return (
                            <Card
                              key={option.id}
                              size="sm"
                              className={`model-provider-card${isActiveProvider ? ' model-provider-card-active' : ''}`}
                            >
                              <CardHeader className="model-provider-card-header">
                                <div className="model-provider-main">
                                  <div className="model-provider-icon">
                                    <ModelProviderLogo providerId={option.id} alt={providerStatus.displayName} />
                                  </div>

                                  <div className="model-provider-content">
                                    <div className="model-provider-title-row">
                                      <CardTitle className="model-provider-title">{providerStatus.displayName}</CardTitle>
                                      {isActiveProvider ? (
                                        <Badge variant="outline" className="model-badge model-badge-active">
                                          当前启用
                                        </Badge>
                                      ) : null}
                                      <Badge variant="outline" className={getProviderStatusClassName(providerStatus)}>
                                        {providerStatus.statusLabel}
                                      </Badge>
                                    </div>
                                    <CardDescription className="model-provider-description">
                                      {providerStatus.description}
                                    </CardDescription>
                                  </div>

                                  <div className="model-provider-actions">
                                    <Button
                                      variant={isActiveProvider ? 'default' : 'outline'}
                                      size="sm"
                                      type="button"
                                      disabled={isActiveProvider || !canClickAction}
                                      title={
                                        isRealAgentEntryProvider(option.id)
                                          ? `${realAgentAvailability.title}。${realAgentAvailability.description}`
                                          : undefined
                                      }
                                      onClick={() => {
                                        if (
                                          isRealAgentEntryProvider(option.id) &&
                                          !realAgentAvailability.canEnterRealAgent
                                        ) {
                                          if (realAgentAvailability.status === 'login_required') {
                                            openLoginModal();
                                          }

                                          return;
                                        }

                                        setCurrentModelProvider(option.id);
                                      }}
                                    >
                                      {getProviderActionText(providerStatus)}
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>

                              <CardContent className="model-provider-card-content">
                                <div className="model-capabilities" aria-label="模型能力标签">
                                  {capabilities.map((capability) => (
                                    <Badge key={capability} variant="outline" className={getCapabilityClassName(capability)}>
                                      {capability}
                                    </Badge>
                                  ))}
                                </div>

                                <div className="model-provider-meta">
                                  <div className="model-provider-meta-item">
                                    <span>Key 来源</span>
                                    <strong>{getKeySourceLabel(providerStatus)}</strong>
                                  </div>
                                  <div className="model-provider-meta-item">
                                    <span>Streaming</span>
                                    <strong>{getStreamingLabel(providerStatus)}</strong>
                                  </div>
                                  <div className="model-provider-meta-item">
                                    <span>Gateway</span>
                                    <strong>{getGatewayLabel(providerStatus)}</strong>
                                  </div>
                                </div>
                                <p className="model-config-help model-config-help-standalone">{providerStatus.statusDescription}</p>
                                {isRealAgentEntryProvider(option.id) ? (
                                  <p
                                    className={`model-config-help model-config-help-standalone model-agent-access-note model-agent-access-note-${realAgentAvailability.status}`}
                                  >
                                    {realAgentAvailability.title}：{realAgentAvailability.description}
                                  </p>
                                ) : null}

                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="model-empty-state">暂无该类型模型</div>
                    )}
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>

        <div className="model-modal-foot">
          <Button type="button" variant="outline" onClick={closeModelModal}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ModelConnectModal() {
  const isModelModalOpen = useWorkbenchStore((state) => state.isModelModalOpen);

  if (!isModelModalOpen) {
    return null;
  }

  return <ModelConnectModalContent />;
}
