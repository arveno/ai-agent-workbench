import { LoginModal } from '../auth/LoginModal';
import { mockTasks } from '../../mocks/tasks';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { AgentAccessView, AuthSessionView } from '../../types/auth';
import { createConversationListView } from '../../utils/conversationListViewModel';
import { replaceWorkbenchUrl } from '../../utils/urlState';
import { AppIcon } from '../common/AppIcon';
import { icons, type IconKey } from '../common/iconMap';
import { ConversationList } from '../conversation/ConversationList';

function getTaskIcon(taskId: string): IconKey {
  if (taskId === 't_month_analytics') {
    return 'search';
  }

  if (taskId === 't_abnormal_reason') {
    return 'alert';
  }

  return 'document';
}

function getAuthDisplayName(authView: AuthSessionView): string {
  if (authView.status === 'loading') {
    return '正在检查登录状态';
  }

  if (authView.status === 'authenticated') {
    return authView.email ?? authView.displayName;
  }

  return '访客用户';
}

function getAgentRunQuotaLabel(agentAccess: AgentAccessView): string {
  if (agentAccess.role === 'admin') {
    return 'Agent Run：不限';
  }

  if (agentAccess.quotaUsed !== null && agentAccess.quotaLimit !== null) {
    return `Agent Run：${agentAccess.quotaUsed} / ${agentAccess.quotaLimit}`;
  }

  return '额度暂不可用';
}

function getAuthStatusLines(params: {
  authView: AuthSessionView;
  agentAccess: AgentAccessView;
  isAgentAccessLoading: boolean;
  agentAccessError: string | null;
}): string[] {
  const { authView, agentAccess, isAgentAccessLoading, agentAccessError } = params;

  if (authView.status === 'loading') {
    return ['请稍候'];
  }

  if (authView.status === 'authenticated') {
    if (isAgentAccessLoading) {
      return ['正在读取额度...'];
    }

    if (agentAccessError || agentAccess.status === 'auth_unavailable') {
      return ['额度暂不可用'];
    }

    if (agentAccess.status === 'quota_exceeded') {
      return [getAgentRunQuotaLabel(agentAccess), '额度已用完'];
    }

    if (agentAccess.status === 'allowed') {
      return [agentAccess.role, getAgentRunQuotaLabel(agentAccess)];
    }

    return ['额度暂不可用'];
  }

  if (authView.status === 'error') {
    return ['登录状态异常'];
  }

  return ['公开演示模式'];
}

export function Sidebar() {
  const authView = useAuthSessionView();
  const signOut = useAuthStore((state) => state.signOut);
  const isLoginModalOpen = useAuthStore((state) => state.isLoginModalOpen);
  const openLoginModal = useAuthStore((state) => state.openLoginModal);
  const closeLoginModal = useAuthStore((state) => state.closeLoginModal);
  const agentAccess = useAuthStore((state) => state.agentAccess);
  const isAgentAccessLoading = useAuthStore((state) => state.isAgentAccessLoading);
  const agentAccessError = useAuthStore((state) => state.agentAccessError);
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentTaskId = useWorkbenchStore((state) => state.currentTaskId);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const setCurrentModelProvider = useWorkbenchStore((state) => state.setCurrentModelProvider);
  const createSession = useWorkbenchStore((state) => state.createSession);
  const switchSession = useWorkbenchStore((state) => state.switchSession);
  const startTask = useWorkbenchStore((state) => state.startTask);
  const hydratePersistentWorkbench = useWorkbenchStore((state) => state.hydratePersistentWorkbench);
  const isPersistentMode = useWorkbenchStore((state) => state.isPersistentMode);
  const isConversationListLoading = useWorkbenchStore((state) => state.isConversationListLoading);
  const isCreatingConversation = useWorkbenchStore((state) => state.isCreatingConversation);
  const conversationListError = useWorkbenchStore((state) => state.conversationListError);
  const isAuthenticated = authView.status === 'authenticated';
  const isAuthLoading = authView.status === 'loading';
  const canOpenLogin = authView.isAuthConfigured && !isAuthLoading;
  const conversationListView = createConversationListView({
    sessions,
    currentSessionId,
    isPersistentMode: isPersistentMode || isAuthenticated,
    isLoading: isConversationListLoading || isAuthLoading,
    errorMessage: conversationListError,
  });
  const authStatusLines = getAuthStatusLines({
    authView,
    agentAccess,
    isAgentAccessLoading,
    agentAccessError,
  });

  const handleSessionClick = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    switchSession(sessionId);
    replaceWorkbenchUrl({
      sessionId,
      taskId: session?.taskId ?? currentTaskId,
    });
  };

  const handleTaskClick = (taskId: string, prompt: string) => {
    if (currentModelProvider !== 'mock') {
      setCurrentModelProvider('mock');
    }

    startTask(taskId, prompt);
    replaceWorkbenchUrl({
      sessionId: currentSessionId,
      taskId,
    });
  };

  const handleCreateSession = async () => {
    const sessionId = await createSession();

    if (!sessionId) {
      return;
    }

    replaceWorkbenchUrl({
      sessionId,
      taskId: currentTaskId,
    });
  };

  const handleRetryConversations = () => {
    void hydratePersistentWorkbench();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-content">
        <div className="brand-block">
          <div className="brand-icon" aria-hidden="true">
            <AppIcon icon={icons.brand} size={20} />
          </div>
          <div className="brand-copy">
            <h1>AI Agent Workbench</h1>
            <p>教育数据分析助手</p>
          </div>
        </div>

        <button
          type="button"
          className="new-chat-btn"
          disabled={isCreatingConversation || isAuthLoading}
          onClick={handleCreateSession}
        >
          <span className="icon-text-inline">
            <AppIcon icon={icons.plus} size={16} />
            <span>{isCreatingConversation ? '正在新建...' : '新建会话'}</span>
          </span>
        </button>

        <section className="sidebar-section">
          <h2 className="section-title">{conversationListView.title}</h2>
          <ConversationList
            view={conversationListView}
            onSelect={handleSessionClick}
            onCreate={() => {
              void handleCreateSession();
            }}
            onRetry={handleRetryConversations}
          />
        </section>

        <section className="sidebar-section">
          <h2 className="section-title">示例任务（公开演示）</h2>
          <p className="sidebar-demo-tip">点击一键运行，默认使用公开演示模式，无需配置 Key 或数据源。</p>
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
            <p className="user-name" title={authView.email ?? getAuthDisplayName(authView)}>
              {getAuthDisplayName(authView)}
            </p>
            <div className="user-status-list" aria-label="登录状态">
              {authStatusLines.map((line, index) => (
                <p key={`${line}-${index}`} className="user-status">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="user-auth-action"
          disabled={isAuthLoading || (!isAuthenticated && !authView.isAuthConfigured)}
          title={
            !authView.isAuthConfigured
              ? '请配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY'
              : undefined
          }
          onClick={() => {
            if (isAuthenticated) {
              void signOut();
              return;
            }

            if (canOpenLogin) {
              openLoginModal();
            }
          }}
        >
          {isAuthenticated ? '退出' : authView.isAuthConfigured ? '登录' : '登录不可用'}
        </button>
      </div>
      <LoginModal isOpen={isLoginModalOpen} onClose={closeLoginModal} />
    </aside>
  );
}
