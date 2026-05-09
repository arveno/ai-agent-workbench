import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import type { ModelProvider } from '../../types/workbench';
import { DataSourceModal } from '../datasource/DataSourceModal';
import { ToolLibraryModal } from '../tools/ToolLibraryModal';
import { WorkflowModal } from '../workflow/WorkflowModal';

function getModelProviderLabel(provider: ModelProvider): string {
  if (provider === 'mock') {
    return 'Mock 演示模式';
  }

  if (provider === 'groq') {
    return 'Groq 免费 API';
  }

  if (provider === 'gemini') {
    return 'Gemini API';
  }

  if (provider === 'openrouter') {
    return 'OpenRouter Free';
  }

  if (provider === 'openai-api-key') {
    return 'OpenAI API Key';
  }

  if (provider === 'codex-oauth') {
    return 'OpenAI / Codex OAuth';
  }

  return '本地 Ollama';
}

export function AppHeader() {
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const openModelModal = useWorkbenchStore((state) => state.openModelModal);
  const openDataSourceModal = useWorkbenchStore((state) => state.openDataSourceModal);
  const openToolLibraryModal = useWorkbenchStore((state) => state.openToolLibraryModal);
  const openWorkflowModal = useWorkbenchStore((state) => state.openWorkflowModal);
  const modelLabel = getModelProviderLabel(currentModelProvider);

  return (
    <>
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-brand-icon">
            <AppIcon icon={icons.brand} size={20} />
          </div>

          <div className="app-brand-text">
            <div className="app-brand-title">AI Agent Workbench</div>
            <div className="app-brand-subtitle">教育数据分析助手</div>
          </div>
        </div>

        <div className="app-header-right">
          <button className="model-status-pill" onClick={openModelModal} type="button">
            <span className="model-dot" aria-hidden="true"></span>
            <span>模型：{modelLabel}</span>
            <span className="model-arrow">⌄</span>
          </button>

          <button className="header-action-button" type="button" onClick={openDataSourceModal}>
            <AppIcon icon={icons.database} size={15} />
            <span>数据源</span>
          </button>

          <button className="header-action-button" type="button" onClick={openToolLibraryModal}>
            <AppIcon icon={icons.settings} size={15} />
            <span>工具库</span>
          </button>

          <button className="header-action-button" type="button" onClick={openWorkflowModal}>
            <AppIcon icon={icons.agent} size={15} />
            <span>工作流</span>
          </button>

          <button className="header-icon-button icon-button" type="button" aria-label="更多">
            <AppIcon icon={icons.more} size={16} />
          </button>
        </div>
      </header>
      <DataSourceModal />
      <ToolLibraryModal />
      <WorkflowModal />
    </>
  );
}
