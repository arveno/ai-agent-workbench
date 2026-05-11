import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { HealthCheckResponse } from '@/types/health';
import type { ModelProviderStatusView } from '@/types/modelStatus';
import { buildModelProviderStatusViews } from '@/utils/modelProviderStatus';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { requestGroqChat } from '../../services/chatApi';
import { requestHealthCheck } from '../../services/healthApi';
import type {
  ModelProviderConfig,
  ModelProviderConfigMap,
  ModelProviderId,
  ModelTestStatus,
} from '../../types/workbench';

interface ProviderOption {
  id: ModelProviderId;
  type: 'mock' | 'api-key' | 'oauth' | 'ollama';
  placeholder?: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'mock',
    type: 'mock',
  },
  {
    id: 'groq',
    type: 'api-key',
    placeholder: '输入 gsk_ 开头的 Groq API Key',
  },
  {
    id: 'gemini',
    type: 'api-key',
    placeholder: '输入 Gemini API Key',
  },
  {
    id: 'openrouter',
    type: 'api-key',
    placeholder: '输入 OpenRouter API Key',
  },
  {
    id: 'openai-api-key',
    type: 'api-key',
    placeholder: '输入 sk- 开头的 OpenAI API Key',
  },
  {
    id: 'codex-oauth',
    type: 'oauth',
  },
  {
    id: 'ollama',
    type: 'ollama',
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

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL_NAME = 'llama3.1';

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
    label: '已配置',
    description: 'Mock、已保存 Key 的模型或已填写本地配置的 provider。',
  },
  {
    id: 'usable',
    label: '可启用',
    description: '当前主流程可切换的 Mock 和 Groq 模型服务。',
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

  if (label === 'BYOK' || label === '支持流式') {
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

  if (status.keySource === 'server_env_and_byok') {
    return '服务端 + 页面 BYOK';
  }

  if (status.keySource === 'server_env') {
    return '服务端环境变量';
  }

  if (status.keySource === 'byok') {
    return status.providerId === 'groq' ? 'sessionStorage BYOK' : 'sessionStorage 配置';
  }

  return status.providerId === 'groq' ? '服务端 GROQ_API_KEY / BYOK' : '未配置';
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

function ModelConnectModalContent() {
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const modelConfigs = useWorkbenchStore((state) => state.modelConfigs);
  const modelTestStatusMap = useWorkbenchStore((state) => state.modelTestStatusMap);
  const closeModelModal = useWorkbenchStore((state) => state.closeModelModal);
  const setCurrentModelProvider = useWorkbenchStore((state) => state.setCurrentModelProvider);
  const saveModelConfig = useWorkbenchStore((state) => state.saveModelConfig);
  const clearModelConfig = useWorkbenchStore((state) => state.clearModelConfig);
  const setModelTestStatus = useWorkbenchStore((state) => state.setModelTestStatus);

  const [draftConfigs, setDraftConfigs] = useState<ModelProviderConfigMap>(modelConfigs);
  const [expandedProviderIds, setExpandedProviderIds] = useState<ModelProviderId[]>(['groq']);
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

  const updateDraftConfig = (providerId: ModelProviderId, partialConfig: ModelProviderConfig) => {
    setDraftConfigs((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        ...partialConfig,
      },
    }));
  };

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

  const handleSaveConfig = (providerId: ModelProviderId) => {
    if (providerId === 'ollama') {
      const currentDraft = draftConfigs.ollama;
      saveModelConfig('ollama', {
        baseUrl: currentDraft?.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
        modelName: currentDraft?.modelName ?? DEFAULT_OLLAMA_MODEL_NAME,
      });
      setModelTestStatus(providerId, 'idle');
      return;
    }

    saveModelConfig(providerId, draftConfigs[providerId] ?? {});
    setModelTestStatus(providerId, 'idle');
  };

  const handleClearConfig = (providerId: ModelProviderId) => {
    clearModelConfig(providerId);
    setDraftConfigs((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  };

  const handleTestConfig = async (providerId: ModelProviderId) => {
    if (providerId === 'mock' || providerId === 'codex-oauth') {
      return;
    }

    const config =
      providerId === 'ollama'
        ? {
            baseUrl: draftConfigs.ollama?.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
            modelName: draftConfigs.ollama?.modelName ?? DEFAULT_OLLAMA_MODEL_NAME,
          }
        : draftConfigs[providerId];

    const isValid =
      providerId === 'ollama'
        ? Boolean(config?.baseUrl?.trim() && config?.modelName?.trim())
        : Boolean(config?.apiKey?.trim());

    if (!isValid) {
      setModelTestStatus(providerId, 'error');
      return;
    }

    setModelTestStatus(providerId, 'testing');

    if (providerId === 'groq') {
      try {
        await requestGroqChat({
          prompt: '请用一句话回复：Groq 连接测试成功。',
          apiKey: config?.apiKey?.trim(),
        });

        setModelTestStatus(providerId, 'success');
      } catch {
        setModelTestStatus(providerId, 'error');
      }

      return;
    }

    window.setTimeout(() => {
      setModelTestStatus(providerId, 'success');
    }, 600);
  };

  const getTestStatusText = (providerId: ModelProviderId, status: ModelTestStatus): string => {
    if (status === 'testing') {
      return '测试中...';
    }

    if (status === 'success') {
      return providerId === 'groq'
        ? 'Groq 连接测试通过，已成功收到模型响应。'
        : '配置格式已通过，真实连通将在接入服务端接口后校验。';
    }

    if (status === 'error') {
      return providerId === 'groq'
        ? 'Groq 连接失败，请检查 API Key、额度或网络状态。'
        : '请先填写必要配置。';
    }

    return '';
  };

  const renderTestStatus = (providerId: ModelProviderId, testStatus: ModelTestStatus) => {
    const statusText = getTestStatusText(providerId, testStatus);

    if (!statusText) {
      return null;
    }

    if (testStatus === 'success') {
      return <p className="model-config-status model-config-status-success">{statusText}</p>;
    }

    if (testStatus === 'error') {
      return <p className="model-config-status model-config-status-error">{statusText}</p>;
    }

    return <p className="model-config-status">{statusText}</p>;
  };

  const toggleProviderExpanded = (providerId: ModelProviderId) => {
    if (providerId === 'mock') {
      return;
    }

    setExpandedProviderIds((prev) =>
      prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]
    );
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
              选择当前会话使用的模型服务，支持 Mock 稳定演示和 BYOK 真实模型。
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
              <p>Groq 支持 BYOK，用户输入的 Key 仅保存在当前浏览器会话中，不会写入 URL 或代码仓库。</p>
              <p>服务端可通过 GROQ_API_KEY 配置默认模型 Key；真实调用仍由服务端转发。</p>
              {hasHealthFailed ? <p>服务端状态检查失败，当前仍可使用页面 BYOK 或公开演示模式。</p> : null}
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
                          const isExpanded = expandedProviderIds.includes(option.id);
                          const testStatus: ModelTestStatus = modelTestStatusMap[option.id] ?? 'idle';
                          const isTesting = testStatus === 'testing';
                          const canActivate = canActivateProvider(providerStatus);
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
                                      disabled={isActiveProvider || !canActivate}
                                      onClick={() => setCurrentModelProvider(option.id)}
                                    >
                                      {getProviderActionText(providerStatus)}
                                    </Button>
                                    {option.type !== 'mock' ? (
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        type="button"
                                        aria-label={isExpanded ? '收起配置' : '展开配置'}
                                        onClick={() => toggleProviderExpanded(option.id)}
                                      >
                                        <AppIcon
                                          icon={icons.chevronRight}
                                          size={16}
                                          className={isExpanded ? 'model-provider-chevron-open' : ''}
                                        />
                                      </Button>
                                    ) : null}
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

                                {isExpanded && option.type === 'api-key' ? (
                                  <div className="model-config-panel">
                                    <div className="model-config-row">
                                      <label className="model-config-label" htmlFor={`${option.id}-api-key`}>
                                        API Key
                                      </label>

                                      <div className="model-config-input-wrap">
                                        <Input
                                          id={`${option.id}-api-key`}
                                          className="model-config-input"
                                          type="password"
                                          value={draftConfigs[option.id]?.apiKey ?? ''}
                                          placeholder={option.placeholder}
                                          onChange={(event) =>
                                            updateDraftConfig(option.id, {
                                              apiKey: event.target.value,
                                            })
                                          }
                                        />
                                      </div>

                                      <div className="model-config-actions">
                                        <Button size="sm" type="button" onClick={() => handleSaveConfig(option.id)}>
                                          保存
                                        </Button>

                                        <Button
                                          size="sm"
                                          variant="outline"
                                          type="button"
                                          onClick={() => handleClearConfig(option.id)}
                                        >
                                          清除
                                        </Button>

                                        <Button
                                          size="sm"
                                          variant="outline"
                                          type="button"
                                          onClick={() => {
                                            void handleTestConfig(option.id);
                                          }}
                                          disabled={isTesting}
                                        >
                                          {isTesting ? '测试中...' : '测试连接'}
                                        </Button>
                                      </div>
                                    </div>

                                    <p className="model-config-help">Key 仅保存在当前浏览器会话中，不会写入 URL 或代码仓库。</p>
                                    {renderTestStatus(option.id, testStatus)}
                                  </div>
                                ) : null}

                                {isExpanded && option.type === 'oauth' ? (
                                  <div className="model-config-info">当前版本仅保留入口，不实现登录授权。</div>
                                ) : null}

                                {isExpanded && option.type === 'ollama' ? (
                                  <div className="model-config-panel">
                                    <div className="model-config-row model-config-row-two">
                                      <label className="model-config-label" htmlFor="ollama-base-url">
                                        Base URL
                                      </label>
                                      <Input
                                        id="ollama-base-url"
                                        className="model-config-input"
                                        value={draftConfigs.ollama?.baseUrl ?? DEFAULT_OLLAMA_BASE_URL}
                                        placeholder={DEFAULT_OLLAMA_BASE_URL}
                                        onChange={(event) =>
                                          updateDraftConfig('ollama', {
                                            baseUrl: event.target.value,
                                          })
                                        }
                                      />

                                      <label className="model-config-label" htmlFor="ollama-model-name">
                                        Model Name
                                      </label>
                                      <Input
                                        id="ollama-model-name"
                                        className="model-config-input"
                                        value={draftConfigs.ollama?.modelName ?? DEFAULT_OLLAMA_MODEL_NAME}
                                        placeholder={DEFAULT_OLLAMA_MODEL_NAME}
                                        onChange={(event) =>
                                          updateDraftConfig('ollama', {
                                            modelName: event.target.value,
                                          })
                                        }
                                      />
                                    </div>

                                    <Separator className="model-config-separator" />

                                    <div className="model-config-actions model-config-actions-inline">
                                      <Button size="sm" type="button" onClick={() => handleSaveConfig('ollama')}>
                                        保存
                                      </Button>

                                      <Button size="sm" variant="outline" type="button" onClick={() => handleClearConfig('ollama')}>
                                        清除
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        type="button"
                                        onClick={() => {
                                          void handleTestConfig('ollama');
                                        }}
                                        disabled={(modelTestStatusMap.ollama ?? 'idle') === 'testing'}
                                      >
                                        {(modelTestStatusMap.ollama ?? 'idle') === 'testing' ? '测试中...' : '测试连接'}
                                      </Button>
                                    </div>

                                    <p className="model-config-help model-config-help-standalone">
                                      本地 Ollama 需要浏览器所在环境可访问该服务地址。当前仅作为本地模型预留入口展示。
                                    </p>
                                    {renderTestStatus('ollama', modelTestStatusMap.ollama ?? 'idle')}
                                  </div>
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
