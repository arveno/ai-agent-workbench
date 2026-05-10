import { mockTasks } from '../../mocks/tasks';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { GenerationStatus, ModelProvider } from '../../types/workbench';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';

const DEFAULT_HEADER_TITLE = '本月教学数据分析';
const TASK_STATUS_SUFFIX = '已检索 3 条知识库资料 · 已生成 1 个图表';
const IDLE_STATUS_SUFFIX = '已检索 0 条知识库资料 · 已生成 0 个图表';
const ERROR_STATUS_SUFFIX = '数据查询服务暂时不可用';

function getGenerationLabel(status: GenerationStatus): string {
  if (status === 'streaming') {
    return '任务进行中';
  }

  if (status === 'done') {
    return '已完成';
  }

  if (status === 'stopped') {
    return '已停止';
  }

  if (status === 'error') {
    return '执行失败';
  }

  return '待开始';
}

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

export function WorkbenchHeader() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const openModelModal = useWorkbenchStore((state) => state.openModelModal);
  const openDataSourceModal = useWorkbenchStore((state) => state.openDataSourceModal);
  const openToolLibraryModal = useWorkbenchStore((state) => state.openToolLibraryModal);
  const openWorkflowModal = useWorkbenchStore((state) => state.openWorkflowModal);
  const currentTask = mockTasks.find((task) => task.id === currentTaskId);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const headerTitle = currentSession?.title || currentTask?.title || DEFAULT_HEADER_TITLE;
  const modelLabel = getModelProviderLabel(currentModelProvider);
  const taskStatusPrefix = getGenerationLabel(generationStatus);
  const taskStatusSuffix =
    generationStatus === 'idle'
      ? IDLE_STATUS_SUFFIX
      : generationStatus === 'error'
        ? ERROR_STATUS_SUFFIX
        : TASK_STATUS_SUFFIX;
  const dotColor =
    generationStatus === 'streaming' || generationStatus === 'done'
      ? '#22c55e'
      : generationStatus === 'error'
        ? '#ef4444'
        : '#9ca3af';
  return (
    <header className="workspace-header workbench-header">
      <div className="workspace-header-main header-main">
        <div className="workspace-title-row">
          <div className="workbench-title-icon" aria-hidden="true">
            <AppIcon icon={icons.task} size={18} />
          </div>
          <h2 className="header-title">{headerTitle}</h2>
          <button type="button" className="title-star-button" aria-label="收藏">
            <AppIcon icon={icons.star} size={16} />
          </button>
        </div>
        <p className="workspace-subtitle">
          <span className="header-status-dot" aria-hidden="true" style={{ background: dotColor }}></span>
          {taskStatusPrefix} · {taskStatusSuffix}
        </p>
      </div>

      <div className="workspace-actions">
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
  );
}
