import { mockTasks } from '../../mocks/tasks';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { GenerationStatus } from '../../types/workbench';

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
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const triggerMockError = useWorkbenchStore((state) => state.triggerMockError);
  const stopGenerating = useWorkbenchStore((state) => state.stopGenerating);
  const regenerate = useWorkbenchStore((state) => state.regenerate);
  const currentTask = mockTasks.find((task) => task.id === currentTaskId);
  const headerTitle = currentTask?.title ?? DEFAULT_HEADER_TITLE;
  const taskStatusPrefix = getGenerationLabel(generationStatus);
  const taskStatusSuffix =
    generationStatus === 'idle'
      ? IDLE_STATUS_SUFFIX
      : generationStatus === 'error'
        ? ERROR_STATUS_SUFFIX
        : TASK_STATUS_SUFFIX;
  const isStreaming = generationStatus === 'streaming';
  const dotColor =
    generationStatus === 'streaming' || generationStatus === 'done'
      ? '#22c55e'
      : generationStatus === 'error'
        ? '#ef4444'
        : '#9ca3af';

  return (
    <header className="workspace-header">
      <div className="workspace-heading">
        <div className="workspace-title-row">
          <h2>{headerTitle}</h2>
          <span className="title-star" aria-hidden="true">
            ☆
          </span>
        </div>
        <p className="workspace-subtitle">
          <span className="live-dot" aria-hidden="true" style={{ background: dotColor }}></span>
          {taskStatusPrefix} · {taskStatusSuffix}
        </p>
      </div>
      <div className="workspace-actions">
        <button
          type="button"
          className="header-btn btn-stop"
          onClick={stopGenerating}
          disabled={!isStreaming}
        >
          停止生成
        </button>
        <button type="button" className="header-btn btn-regenerate" onClick={regenerate}>
          重新生成
        </button>
        <button type="button" className="header-btn btn-mock-fail" onClick={triggerMockError}>
          模拟失败
        </button>
        <button type="button" className="header-btn">
          分享
        </button>
        <button type="button" className="header-btn icon-btn" aria-label="更多">
          ⋮
        </button>
      </div>
    </header>
  );
}
