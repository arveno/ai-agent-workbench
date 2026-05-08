import { mockSessions } from '../../mocks/sessions';
import { mockTasks } from '../../mocks/tasks';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { replaceWorkbenchUrl } from '../../utils/urlState';
import { AppIcon } from '../common/AppIcon';
import { icons, type IconKey } from '../common/iconMap';

function getTaskIcon(taskId: string): IconKey {
  if (taskId === 't_month_analytics') {
    return 'search';
  }

  if (taskId === 't_abnormal_reason') {
    return 'alert';
  }

  return 'document';
}

export function Sidebar() {
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const setCurrentSessionId = useWorkbenchStore((state) => state.setCurrentSessionId);
  const startTask = useWorkbenchStore((state) => state.startTask);

  const handleSessionClick = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    replaceWorkbenchUrl({
      sessionId,
      taskId: currentTaskId,
    });
  };

  const handleTaskClick = (taskId: string, prompt: string) => {
    startTask(taskId, prompt);
    replaceWorkbenchUrl({
      sessionId: currentSessionId,
      taskId,
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-content">
        <button type="button" className="new-chat-btn">
          <span className="icon-text-inline">
            <AppIcon icon={icons.plus} size={16} />
            <span>新建会话</span>
          </span>
        </button>

        <section className="sidebar-section">
          <h2 className="section-title">会话列表</h2>
          <ul className="session-list">
            {mockSessions.map((session) => (
              <li
                key={session.id}
                className={`session-item${session.id === currentSessionId ? ' active' : ''}`}
                onClick={() => handleSessionClick(session.id)}
              >
                <span className="session-name-wrap">
                  <AppIcon icon={icons.document} size={14} />
                  <span className="session-name">{session.title}</span>
                </span>
                <span className="session-time">{session.updatedAt}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sidebar-section">
          <h2 className="section-title">示例任务</h2>
          <div className="task-list">
            {mockTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="task-btn"
                onClick={() => handleTaskClick(task.id, task.prompt)}
              >
                <span className="task-name-wrap">
                  <AppIcon icon={icons[getTaskIcon(task.id)]} size={14} />
                  <span>{task.title}</span>
                </span>
                <span className="task-arrow" aria-hidden="true">
                  <AppIcon icon={icons.chevronRight} size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section">
          <h2 className="section-title">最近使用工具</h2>
          <div className="tool-tags">
            <span className="tool-tag tool-kb">知识库检索</span>
            <span className="tool-tag tool-data">数据分析</span>
            <span className="tool-tag tool-report">报告生成</span>
          </div>
        </section>
      </div>

      <div className="sidebar-footer">
        <div className="user-block">
          <div className="sidebar-user-avatar user-avatar" aria-hidden="true">
            <AppIcon icon={icons.user} size={16} />
          </div>
          <div className="user-copy">
            <p className="user-name">张老师</p>
            <p className="user-status">
              <span className="status-dot" aria-hidden="true"></span>
              在线
            </p>
          </div>
        </div>
        <button type="button" className="settings-btn icon-button" aria-label="设置">
          <AppIcon icon={icons.settings} size={16} />
        </button>
      </div>
    </aside>
  );
}
