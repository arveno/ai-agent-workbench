import { Fragment } from 'react';
import type { LucideIcon } from 'lucide-react';
import { mockTasks } from '../../mocks/tasks';
import { buildRealAgentAvailabilityView } from '../../services/agentAccessViewModel';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { CapabilityStatus, GenerationStatus, RunSnapshot } from '../../types/workbench';
import { getModelProviderStatusView } from '../../utils/modelProviderStatus';
import {
  formatRunElapsed,
  getRunModeLabel,
  getRunStatusLabel,
  getRunStatusTone,
  type RunStatusTone,
} from '../../utils/runViewModel';
import { WORKBENCH_TOOL_DEFINITIONS } from '../../utils/toolRegistryView';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { EnvironmentStatus } from './EnvironmentStatus';

const DEFAULT_HEADER_TITLE = '新聊天';
const DATA_SOURCE_TABLES = 'teaching_metrics、knowledge_documents、knowledge_chunks';

interface CapabilityActionButtonProps {
  icon: LucideIcon;
  label: string;
  statusLabel: string;
  status: CapabilityStatus;
  title: string;
  onClick: () => void;
}

function CapabilityActionButton({
  icon,
  label,
  statusLabel,
  status,
  title,
  onClick,
}: CapabilityActionButtonProps) {
  return (
    <Button
      className={`workspace-action-button workspace-capability-button capability-tone-${status}`}
      type="button"
      onClick={onClick}
      variant="outline"
      size="sm"
      title={title}
      aria-label={`${label}：${statusLabel}`}
    >
      <AppIcon icon={icon} size={15} />
      <span className="workspace-capability-copy">
        <span className="workspace-capability-label">{label}</span>
        <span className="workspace-capability-status">
          <span className="workspace-capability-status-dot" aria-hidden="true"></span>
          {statusLabel}
        </span>
      </span>
    </Button>
  );
}

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

function getHeaderAgentAccessHint(params: {
  isPublicDemoMode: boolean;
  title: string;
  description: string;
}): string {
  if (params.isPublicDemoMode) {
    return `当前可直接使用公开演示模式体验完整流程；真实 Agent：${params.title}。${params.description}`;
  }

  return `${params.title}。${params.description}`;
}

export function WorkbenchHeader() {
  const authView = useAuthSessionView();
  const agentAccess = useAuthStore((state) => state.agentAccess);
  const isAgentAccessLoading = useAuthStore((state) => state.isAgentAccessLoading);
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const modelConfigs = useWorkbenchStore((state) => state.modelConfigs);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const openDataSourceModal = useWorkbenchStore((state) => state.openDataSourceModal);
  const openToolLibraryModal = useWorkbenchStore((state) => state.openToolLibraryModal);
  const openWorkflowModal = useWorkbenchStore((state) => state.openWorkflowModal);
  const currentTask = mockTasks.find((task) => task.id === currentTaskId);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const headerTitle = currentSession?.title || currentTask?.title || DEFAULT_HEADER_TITLE;
  const currentModelStatus = getModelProviderStatusView({
    providerId: currentModelProvider,
    currentModelProvider,
    modelConfigs,
    health: null,
  });
  const modelLabel = currentModelStatus.displayName;
  const statusLabel = currentRun ? getRunStatusLabel(currentRun.status) : getGenerationLabel(generationStatus);
  const statusTone = currentRun ? getRunStatusTone(currentRun.status) : getGenerationStatusTone(generationStatus);
  const runSummaryItems = getRunSummaryItems(currentRun);
  const modeBadgeLabel = currentRun
    ? currentRun.mode === 'mock'
      ? '公开演示模式（Mock）'
      : getRunModeLabel(currentRun.mode)
    : modelLabel;
  const shouldShowPublicDemoHint = currentModelStatus.providerId === 'mock';
  const isRealAgentProvider = currentModelStatus.providerId === 'groq';
  const realAgentAvailability = buildRealAgentAvailabilityView({
    authView,
    agentAccess,
    isAgentAccessLoading,
  });
  const shouldShowAgentAccessHint = shouldShowPublicDemoHint || isRealAgentProvider;
  const agentAccessHint = getHeaderAgentAccessHint({
    isPublicDemoMode: shouldShowPublicDemoHint,
    title: realAgentAvailability.title,
    description: realAgentAvailability.description,
  });
  const enabledToolCount = WORKBENCH_TOOL_DEFINITIONS.filter((tool) => tool.enabled).length;
  const serverToolCount = WORKBENCH_TOOL_DEFINITIONS.filter(
    (tool) => tool.enabled && tool.runtime === 'server' && tool.status === 'connected',
  ).length;

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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="title-star-button"
            aria-label="收藏暂未开放"
            title="收藏暂未开放"
            disabled
          >
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
        {shouldShowAgentAccessHint ? (
          <p className={`workspace-agent-access-hint workspace-agent-access-hint-${realAgentAvailability.status}`}>
            {agentAccessHint}
          </p>
        ) : null}
      </div>

      <div className="workspace-actions">
        <EnvironmentStatus />
        <span className="workspace-actions-label">能力入口</span>

        <CapabilityActionButton
          icon={icons.database}
          label="数据源"
          statusLabel="受控访问"
          status="connected"
          title={`CloudBase MySQL 已作为主数据源接入；可用表：${DATA_SOURCE_TABLES}。用于数据分析、RAG 检索和报告生成。`}
          onClick={openDataSourceModal}
        />

        <CapabilityActionButton
          icon={icons.settings}
          label="工具库"
          statusLabel={`${serverToolCount} 个服务端`}
          status="available"
          title={`服务端白名单工具链已启用 ${enabledToolCount} 个工具；模型不能直接执行 SQL，工具调用进入 Run Trace。`}
          onClick={openToolLibraryModal}
        />

        <CapabilityActionButton
          icon={icons.agent}
          label="Workflow / Prompt"
          statusLabel="固定流程"
          status="readonly"
          title="当前是固定任务流程模板；Prompt 模板仅作为本地输入辅助，不直接改变 CloudBase 后端执行逻辑。"
          onClick={openWorkflowModal}
        />

        <Button
          className="header-icon-button icon-button workspace-disabled-icon-button"
          type="button"
          aria-label="更多能力暂未开放"
          title="更多能力暂未开放"
          variant="outline"
          size="icon-sm"
          disabled
        >
          <AppIcon icon={icons.more} size={16} />
        </Button>
      </div>
    </header>
  );
}
