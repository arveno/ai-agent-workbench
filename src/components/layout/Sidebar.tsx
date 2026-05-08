import { mockSessions } from '../../mocks/sessions';
import { mockTasks } from '../../mocks/tasks';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { replaceWorkbenchUrl } from '../../utils/urlState';

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
        <div className="brand-block">
          <div className="brand-icon">🤖</div>
          <div className="brand-copy">
            <h1>AI Agent Workbench</h1>
            <p>教育数据分析助手</p>
          </div>
        </div>

        <button type="button" className="new-chat-btn">
          + 新建会话
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
                <span className="session-name">{session.title}</span>
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
                <span>{task.title}</span>
                <span aria-hidden="true">&gt;</span>
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
          <div className="user-avatar" aria-hidden="true"></div>
          <div className="user-copy">
            <p className="user-name">张老师</p>
            <p className="user-status">
              <span className="status-dot" aria-hidden="true"></span>
              在线
            </p>
          </div>
        </div>
        <button type="button" className="settings-btn" aria-label="设置">
          ⚙
        </button>
      </div>
    </aside>
  );
}
