import { Fragment } from 'react';
import { mockTasks } from '../../mocks/tasks';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { GenerationStatus, ModelProvider, RunSnapshot } from '../../types/workbench';
import {
  formatRunElapsed,
  getRunModeLabel,
  getRunStatusLabel,
  getRunStatusTone,
  type RunStatusTone,
} from '../../utils/runViewModel';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { EnvironmentStatus } from './EnvironmentStatus';

const DEFAULT_HEADER_TITLE = '新会话';

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

function getGenerationStatusTone(status: GenerationStatus): RunStatusTone {
  if (status === 'streaming') {
    return 'active';
  }

  if (status === 'done') {
    return 'success';
  }

  if (status === 'stopped') {
    return 'warning';
  }

  if (status === 'error') {
    return 'danger';
  }

  return 'muted';
}

function getModelProviderLabel(provider: ModelProvider): string {
  if (provider === 'mock') {
    return '公开演示模式（Mock）';
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

function getRunSummaryItems(currentRun: RunSnapshot | null): string[] {
  if (!currentRun) {
    return ['尚未开始 Run'];
  }

  const summaryItems = [
    `工具 ${currentRun.toolInvocations.length}`,
    `图表 ${currentRun.chartData ? 1 : 0}`,
  ];
  const elapsedText = formatRunElapsed(currentRun);

  if (elapsedText !== '-') {
    summaryItems.push(`耗时 ${elapsedText}`);
  }

  return summaryItems;
}

export function WorkbenchHeader() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const openModelModal = useWorkbenchStore((state) => state.openModelModal);
  const openDataSourceModal = useWorkbenchStore((state) => state.openDataSourceModal);
  const openToolLibraryModal = useWorkbenchStore((state) => state.openToolLibraryModal);
  const openWorkflowModal = useWorkbenchStore((state) => state.openWorkflowModal);
  const currentTask = mockTasks.find((task) => task.id === currentTaskId);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const headerTitle = currentSession?.title || currentTask?.title || DEFAULT_HEADER_TITLE;
  const modelLabel = getModelProviderLabel(currentModelProvider);
  const statusLabel = currentRun ? getRunStatusLabel(currentRun.status) : getGenerationLabel(generationStatus);
  const statusTone = currentRun ? getRunStatusTone(currentRun.status) : getGenerationStatusTone(generationStatus);
  const runSummaryItems = getRunSummaryItems(currentRun);
  const modeBadgeLabel = currentRun
    ? currentRun.mode === 'mock'
      ? '公开演示模式（Mock）'
      : getRunModeLabel(currentRun.mode)
    : modelLabel;
  const shouldShowPublicDemoHint = currentModelProvider === 'mock';

  return (
    <header className="workspace-header workbench-header">
      <div className="workspace-header-main header-main">
        <div className="workspace-title-row">
          <div className="workbench-title-icon" aria-hidden="true">
            <AppIcon icon={icons.task} size={18} />
          </div>
          <h2 className="header-title">{headerTitle}</h2>
          <Badge variant="outline" className="workspace-mode-badge">
            {modeBadgeLabel}
          </Badge>
          <Button type="button" variant="ghost" size="icon-sm" className="title-star-button" aria-label="收藏">
            <AppIcon icon={icons.star} size={16} />
          </Button>
        </div>
        <div className="workspace-status-row" aria-label="Run 状态摘要">
          <Badge variant="outline" className={`workspace-status-badge workspace-status-badge-${statusTone}`}>
            <span className="workspace-status-dot" aria-hidden="true"></span>
            {statusLabel}
          </Badge>
          {runSummaryItems.map((item, index) => (
            <Fragment key={item}>
              {index > 0 ? <Separator orientation="vertical" className="workspace-status-separator" /> : null}
              <span className="workspace-status-item">{item}</span>
            </Fragment>
          ))}
        </div>
        {shouldShowPublicDemoHint ? (
          <p className="workspace-demo-hint">当前可直接使用公开演示模式体验完整 Agent 工作台流程。</p>
        ) : null}
      </div>

      <div className="workspace-actions">
        <EnvironmentStatus />

        <Button className="workspace-action-button model-status-pill" onClick={openModelModal} type="button" variant="outline" size="sm">
          <span className="model-dot" aria-hidden="true"></span>
          <span>模型：{modelLabel}</span>
          <span className="model-arrow">⌄</span>
        </Button>

        <Button className="workspace-action-button" type="button" onClick={openDataSourceModal} variant="outline" size="sm">
          <AppIcon icon={icons.database} size={15} />
          <span>数据源</span>
        </Button>

        <Button className="workspace-action-button" type="button" onClick={openToolLibraryModal} variant="outline" size="sm">
          <AppIcon icon={icons.settings} size={15} />
          <span>工具库</span>
        </Button>

        <Button className="workspace-action-button" type="button" onClick={openWorkflowModal} variant="outline" size="sm">
          <AppIcon icon={icons.agent} size={15} />
          <span>工作流</span>
        </Button>

        <Button className="header-icon-button icon-button" type="button" aria-label="更多" variant="outline" size="icon-sm">
          <AppIcon icon={icons.more} size={16} />
        </Button>
      </div>
    </header>
  );
}
