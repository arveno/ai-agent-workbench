import { mockTasks } from '../../mocks/tasks';
import { useWorkbenchStore } from '../../stores/workbenchStore';

const DEFAULT_HEADER_TITLE = '本月教学数据分析';

export function WorkbenchHeader() {
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const currentTask = mockTasks.find((task) => task.id === currentTaskId);
  const headerTitle = currentTask?.title ?? DEFAULT_HEADER_TITLE;

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
          <span className="live-dot" aria-hidden="true"></span>
          任务进行中 · 已检索 3 条知识库资料 · 已生成 1 个图表
        </p>
      </div>
      <div className="workspace-actions">
        <button type="button" className="header-btn btn-stop">
          停止生成
        </button>
        <button type="button" className="header-btn btn-regenerate">
          重新生成
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