import { mockTasks } from '../../mocks/tasks';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { GenerationStatus } from '../../types/workbench';
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

export function WorkbenchHeader() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const currentTask = mockTasks.find((task) => task.id === currentTaskId);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const headerTitle = currentSession?.title || currentTask?.title || DEFAULT_HEADER_TITLE;
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
  const agentRunStatus = useWorkbenchStore((state) => state.agentRunStatus);
  const chatDraft = useWorkbenchStore((state) => state.chatDraft);
  const runCurrentAgentAnalysis = useWorkbenchStore((state) => state.runCurrentAgentAnalysis);
  const isRunDisabled = agentRunStatus === 'running' || chatDraft.trim().length === 0;

  const runButtonLabel =
    agentRunStatus === 'running'
      ? '运行中...'
      : agentRunStatus === 'success'
        ? '重新运行'
        : agentRunStatus === 'error'
          ? '重试运行'
          : '运行真实 Agent';
  const runButtonTitle = chatDraft.trim().length === 0 ? '请输入问题后运行真实 Agent' : runButtonLabel;

  return (
    <header className="workbench-header">
      <div className="header-main">
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
      <div className="task-action-group">
        <button
          type="button"
          className="run-agent-button"
          onClick={() => {
            void runCurrentAgentAnalysis();
          }}
          disabled={isRunDisabled}
          title={runButtonTitle}
        >
          {runButtonLabel}
        </button>
      </div>
    </header>
  );
}
