import { useState } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import type { ModelProviderOption } from '../../types/workbench';
import type { ModelProvider } from '../../types/workbench';

const MODEL_PROVIDER_OPTIONS: Array<
  ModelProviderOption & {
    statusText: string;
    actionText: string;
  }
> = [
  {
    id: 'mock',
    name: 'Mock 演示模式',
    description: '使用本地 mock 流式输出，不依赖外部模型，适合稳定演示。',
    status: 'active',
    statusText: '当前启用',
    actionText: '使用中',
  },
  {
    id: 'groq',
    name: 'Groq 免费 API',
    description: '可用于真实模型流式输出，速度快，但免费额度有限。',
    status: 'available',
    statusText: '待接入',
    actionText: '预留',
  },
  {
    id: 'gemini',
    name: 'Gemini API',
    description: '可使用 Google Gemini API 免费额度进行真实模型演示。',
    status: 'available',
    statusText: '待接入',
    actionText: '预留',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter Free',
    description: '可通过 OpenRouter 免费模型接入多模型能力。',
    status: 'available',
    statusText: '待接入',
    actionText: '预留',
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    description: '通过服务端 /api/chat 调用 OpenAI API，Key 不暴露在前端。',
    status: 'available',
    statusText: '待接入',
    actionText: '预留',
  },
  {
    id: 'codex-oauth',
    name: 'OpenAI / Codex OAuth',
    description: '预留 ChatGPT / Codex 授权路线，适合类似 OpenClaw 的订阅侧模型连接方式。',
    status: 'reserved',
    statusText: '预留',
    actionText: '预留',
  },
  {
    id: 'ollama',
    name: '本地 Ollama',
    description: '面向本地模型演示，不依赖云端 API Key。',
    status: 'reserved',
    statusText: '预留',
    actionText: '预留',
  },
];

const providerLogoMap = {
  groq: '/brands/groq.svg',
  gemini: '/brands/gemini.svg',
  openrouter: '/brands/openrouter.svg',
  'openai-api-key': '/brands/openai.svg',
  'codex-oauth': '/brands/openai.svg',
  ollama: '/brands/ollama.svg',
} as const;

const providerFallbackTextMap: Record<ModelProvider, string> = {
  mock: 'Mock',
  groq: 'Groq',
  gemini: 'Gemini',
  openrouter: 'OR',
  'openai-api-key': 'OpenAI',
  'codex-oauth': 'OpenAI',
  ollama: 'Ollama',
};

interface ModelProviderLogoProps {
  provider: ModelProvider;
  alt: string;
}

function ModelProviderLogo({ provider, alt }: ModelProviderLogoProps) {
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  if (provider === 'mock') {
    return <AppIcon icon={icons.brand} size={20} />;
  }
  const src = providerLogoMap[provider as keyof typeof providerLogoMap];

  if (logoLoadFailed) {
    return <span className="model-option-logo-fallback">{providerFallbackTextMap[provider]}</span>;
  }

  return (
    <img
      src={src}
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
  const closeModelModal = useWorkbenchStore((state) => state.closeModelModal);
  const setCurrentModelProvider = useWorkbenchStore((state) => state.setCurrentModelProvider);

  if (!isModelModalOpen) {
    return null;
  }

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
          {MODEL_PROVIDER_OPTIONS.map((option) => {
            const isCurrent = option.id === currentModelProvider;

            return (
              <div
                key={option.id}
                className={`model-option${isCurrent ? ' model-option-active' : ''}`}
              >
                <span className="model-option-icon">
                  <ModelProviderLogo provider={option.id} alt={option.name} />
                </span>
                <div className="model-option-copy">
                  <p className="model-option-title">{option.name}</p>
                  <p className="model-option-desc">{option.description}</p>
                </div>
                <span className={`model-status${isCurrent ? ' model-status-active' : ''}`}>
                  {isCurrent ? '当前启用' : option.statusText}
                </span>
                <button
                  type="button"
                  className={`model-action-button${isCurrent ? ' model-action-button-active' : ''}`}
                  disabled={!isCurrent}
                  onClick={() => {
                    if (!isCurrent) {
                      return;
                    }

                    setCurrentModelProvider('mock');
                  }}
                >
                  {isCurrent ? '使用中' : option.actionText}
                </button>
              </div>
            );
          })}
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
