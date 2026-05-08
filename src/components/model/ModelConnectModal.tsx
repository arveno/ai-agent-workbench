import { useEffect, useState } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { requestGroqChat } from '../../services/chatApi';
import type {
  ModelProviderConfig,
  ModelProviderConfigMap,
  ModelProviderId,
  ModelTestStatus,
} from '../../types/workbench';

interface ProviderOption {
  id: ModelProviderId;
  name: string;
  description: string;
  type: 'mock' | 'api-key' | 'oauth' | 'ollama';
  placeholder?: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'mock',
    name: 'Mock 演示模式',
    description: '使用本地 mock 流式输出，不依赖外部模型，适合稳定演示。',
    type: 'mock',
  },
  {
    id: 'groq',
    name: 'Groq 免费 API',
    description: '可用于真实模型流式输出，速度快，但免费额度有限。',
    type: 'api-key',
    placeholder: '输入 gsk_ 开头的 Groq API Key',
  },
  {
    id: 'gemini',
    name: 'Gemini API',
    description: '可使用 Google Gemini API 免费额度进行真实模型演示。',
    type: 'api-key',
    placeholder: '输入 Gemini API Key',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter Free',
    description: '可通过 OpenRouter 免费模型接入多模型能力。',
    type: 'api-key',
    placeholder: '输入 OpenRouter API Key',
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    description: '通过服务端 /api/chat 调用 OpenAI API，Key 不暴露在前端。',
    type: 'api-key',
    placeholder: '输入 sk- 开头的 OpenAI API Key',
  },
  {
    id: 'codex-oauth',
    name: 'OpenAI / Codex OAuth',
    description: '预留 ChatGPT / Codex 授权路线，适合类似 OpenClaw 的订阅侧模型连接方式。',
    type: 'oauth',
  },
  {
    id: 'ollama',
    name: '本地 Ollama',
    description: '面向本地模型演示，不依赖云端 API Key。',
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

export function ModelConnectModal() {
  const isModelModalOpen = useWorkbenchStore((state) => state.isModelModalOpen);
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

  useEffect(() => {
    if (isModelModalOpen) {
      setDraftConfigs(modelConfigs);
      setExpandedProviderIds(['groq']);
    }
  }, [isModelModalOpen, modelConfigs]);

  if (!isModelModalOpen) {
    return null;
  }

  const updateDraftConfig = (providerId: ModelProviderId, partialConfig: ModelProviderConfig) => {
    setDraftConfigs((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        ...partialConfig,
      },
    }));
  };

  const isProviderConfigured = (providerId: ModelProviderId) => {
    const config = modelConfigs[providerId];

    if (providerId === 'mock') {
      return true;
    }

    if (providerId === 'codex-oauth') {
      return false;
    }

    if (providerId === 'ollama') {
      return Boolean(config?.baseUrl?.trim() && config?.modelName?.trim());
    }

    return Boolean(config?.apiKey?.trim());
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

  const canActivateProvider = (option: ProviderOption): boolean => {
    if (option.id === 'mock') {
      return true;
    }

    if (option.type === 'oauth') {
      return false;
    }

    return isProviderConfigured(option.id);
  };

  const getProviderBadgeText = (option: ProviderOption): string => {
    if (currentModelProvider === option.id) {
      return '当前启用';
    }

    if (option.type === 'mock') {
      return '可启用';
    }

    if (option.type === 'oauth') {
      return '预留';
    }

    return isProviderConfigured(option.id) ? '已配置' : '未配置';
  };

  const getProviderBadgeClassName = (option: ProviderOption): string => {
    if (currentModelProvider === option.id) {
      return 'model-provider-badge model-provider-badge-active';
    }

    if (option.type !== 'oauth' && isProviderConfigured(option.id)) {
      return 'model-provider-badge model-provider-badge-ready';
    }

    return 'model-provider-badge';
  };

  const getProviderActionText = (option: ProviderOption): string => {
    if (currentModelProvider === option.id) {
      return '使用中';
    }

    if (option.type === 'oauth') {
      return '预留';
    }

    return canActivateProvider(option) ? '启用' : '先配置';
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
              当前线上 Demo 默认使用 Mock 模式，避免公开演示产生 API 成本。后续可通过免费 API、API
              Key、服务端环境变量或 OAuth 接入真实模型。
            </p>
          </div>
          <button type="button" className="model-modal-close" onClick={closeModelModal} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="model-modal-body">
          <div className="model-provider-list">
            {PROVIDER_OPTIONS.map((option) => {
              const isActiveProvider = option.id === currentModelProvider;
              const isExpanded = expandedProviderIds.includes(option.id);
              const testStatus: ModelTestStatus = modelTestStatusMap[option.id] ?? 'idle';
              const isTesting = testStatus === 'testing';
              const canActivate = canActivateProvider(option);

              return (
                <div
                  key={option.id}
                  className={`model-provider-card${isActiveProvider ? ' model-provider-card-active' : ''}`}
                >
                  <div className="model-provider-main">
                    <div className="model-provider-icon">
                      <ModelProviderLogo providerId={option.id} alt={option.name} />
                    </div>

                    <div className="model-provider-content">
                      <div className="model-provider-title-row">
                        <h4 className="model-provider-title">{option.name}</h4>
                      </div>
                      <p className="model-provider-description">{option.description}</p>
                    </div>

                    <div className="model-provider-actions">
                      <span className={getProviderBadgeClassName(option)}>{getProviderBadgeText(option)}</span>
                      <button
                        className={
                          isActiveProvider ? 'model-provider-primary-button' : 'model-provider-secondary-button'
                        }
                        type="button"
                        disabled={isActiveProvider || !canActivate}
                        onClick={() => setCurrentModelProvider(option.id)}
                      >
                        {getProviderActionText(option)}
                      </button>
                      {option.type !== 'mock' ? (
                        <button
                          className="model-provider-expand-button"
                          type="button"
                          aria-label={isExpanded ? '收起配置' : '展开配置'}
                          onClick={() => toggleProviderExpanded(option.id)}
                        >
                          <AppIcon
                            icon={icons.chevronRight}
                            size={16}
                            className={isExpanded ? 'model-provider-chevron-open' : ''}
                          />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isExpanded && option.type === 'api-key' ? (
                    <div className="model-config-panel">
                      <div className="model-config-row">
                        <label className="model-config-label" htmlFor={`${option.id}-api-key`}>
                          API Key
                        </label>

                        <div className="model-config-input-wrap">
                          <input
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
                          <button
                            className="model-config-primary-button"
                            type="button"
                            onClick={() => handleSaveConfig(option.id)}
                          >
                            保存
                          </button>

                          <button
                            className="model-config-secondary-button"
                            type="button"
                            onClick={() => handleClearConfig(option.id)}
                          >
                            清除
                          </button>

                          <button
                            className="model-config-secondary-button"
                            type="button"
                            onClick={() => {
                              void handleTestConfig(option.id);
                            }}
                            disabled={isTesting}
                          >
                            {isTesting ? '测试中...' : '测试连接'}
                          </button>
                        </div>
                      </div>

                      <p className="model-config-help">Key 仅保存在当前浏览器会话中。</p>
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
                        <input
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
                        <input
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

                      <div className="model-config-actions">
                        <button
                          className="model-config-primary-button"
                          type="button"
                          onClick={() => handleSaveConfig('ollama')}
                        >
                          保存
                        </button>

                        <button
                          className="model-config-secondary-button"
                          type="button"
                          onClick={() => handleClearConfig('ollama')}
                        >
                          清除
                        </button>

                        <button
                          className="model-config-secondary-button"
                          type="button"
                          onClick={() => {
                            void handleTestConfig('ollama');
                          }}
                          disabled={(modelTestStatusMap.ollama ?? 'idle') === 'testing'}
                        >
                          {(modelTestStatusMap.ollama ?? 'idle') === 'testing' ? '测试中...' : '测试连接'}
                        </button>
                      </div>

                      <p className="model-config-help">本地 Ollama 需要浏览器所在环境可访问该服务地址。</p>
                      {renderTestStatus('ollama', modelTestStatusMap.ollama ?? 'idle')}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="model-modal-foot">
          <button type="button" className="model-close-btn" onClick={closeModelModal}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
