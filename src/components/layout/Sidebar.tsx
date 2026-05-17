import { useEffect, useRef } from 'react';
import { LoginModal } from '../auth/LoginModal';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { AgentAccessView, AuthSessionView } from '../../types/auth';
import { buildRealAgentAvailabilityView } from '../../services/agentAccessViewModel';
import { createConversationListView } from '../../utils/conversationListViewModel';
import {
  createDemoConversationTemplateListView,
  createDemoTaskListView,
} from '../../utils/demoTemplateViewModel';
import { createRecentToolsView } from '../../utils/recentToolsViewModel';
import { replaceWorkbenchUrl } from '../../utils/urlState';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { ConversationList } from '../conversation/ConversationList';
import { DemoTaskList } from '../demo/DemoTaskList';
import { DemoTaskRunChoiceModal } from '../demo/DemoTaskRunChoiceModal';
import { RecentToolsCard } from '../tools/RecentToolsCard';

type LastDemoAction =
  | {
      kind: 'task';
      id: string;
    }
  | {
      kind: 'conversation';
      id: string;
    };

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
  const lastDemoActionRef = useRef<LastDemoAction | null>(null);
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
  const createSession = useWorkbenchStore((state) => state.createSession);
  const switchSession = useWorkbenchStore((state) => state.switchSession);
  const hydratePersistentWorkbench = useWorkbenchStore((state) => state.hydratePersistentWorkbench);
  const isPersistentMode = useWorkbenchStore((state) => state.isPersistentMode);
  const isConversationListLoading = useWorkbenchStore((state) => state.isConversationListLoading);
  const isCreatingConversation = useWorkbenchStore((state) => state.isCreatingConversation);
  const conversationListError = useWorkbenchStore((state) => state.conversationListError);
  const demoTasks = useWorkbenchStore((state) => state.demoTasks);
  const demoConversations = useWorkbenchStore((state) => state.demoConversations);
  const isDemoTasksLoading = useWorkbenchStore((state) => state.isDemoTasksLoading);
  const demoTasksError = useWorkbenchStore((state) => state.demoTasksError);
  const isDemoConversationsLoading = useWorkbenchStore((state) => state.isDemoConversationsLoading);
  const demoConversationsError = useWorkbenchStore((state) => state.demoConversationsError);
  const isCopyingDemoTemplate = useWorkbenchStore((state) => state.isCopyingDemoTemplate);
  const copyDemoTemplateError = useWorkbenchStore((state) => state.copyDemoTemplateError);
  const pendingDemoTaskId = useWorkbenchStore((state) => state.pendingDemoTaskId);
  const isDemoTaskChoiceOpen = useWorkbenchStore((state) => state.isDemoTaskChoiceOpen);
  const demoTaskChoiceError = useWorkbenchStore((state) => state.demoTaskChoiceError);
  const loadDemoTasks = useWorkbenchStore((state) => state.loadDemoTasks);
  const loadDemoConversations = useWorkbenchStore((state) => state.loadDemoConversations);
  const retryLoadDemoTasks = useWorkbenchStore((state) => state.retryLoadDemoTasks);
  const retryLoadDemoConversations = useWorkbenchStore((state) => state.retryLoadDemoConversations);
  const startDemoTask = useWorkbenchStore((state) => state.startDemoTask);
  const confirmRunDemoTaskWithAgent = useWorkbenchStore((state) => state.confirmRunDemoTaskWithAgent);
  const runDemoTaskAsMock = useWorkbenchStore((state) => state.runDemoTaskAsMock);
  const cancelDemoTaskChoice = useWorkbenchStore((state) => state.cancelDemoTaskChoice);
  const copyDemoConversationTemplate = useWorkbenchStore((state) => state.copyDemoConversationTemplate);
  const recentTools = useWorkbenchStore((state) => state.recentTools);
  const isRecentToolsLoading = useWorkbenchStore((state) => state.isRecentToolsLoading);
  const recentToolsError = useWorkbenchStore((state) => state.recentToolsError);
  const retryLoadRecentTools = useWorkbenchStore((state) => state.retryLoadRecentTools);
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
  const demoTaskListView = createDemoTaskListView({
    tasks: demoTasks,
    isLoading: isDemoTasksLoading,
    errorMessage: demoTasksError,
  });
  const demoConversationTemplateListView = createDemoConversationTemplateListView({
    templates: demoConversations,
    isLoading: isDemoConversationsLoading,
    errorMessage: demoConversationsError,
  });
  const recentToolsView = createRecentToolsView({
    tools: recentTools,
    isLoading: isRecentToolsLoading,
    errorMessage: recentToolsError,
    isAuthenticated,
    isAuthLoading,
  });
  const pendingDemoTask = demoTaskListView.items.find((task) => task.id === pendingDemoTaskId) ?? null;
  const realAgentAvailability = buildRealAgentAvailabilityView({
    authView,
    agentAccess,
    isAgentAccessLoading,
  });
  const authStatusLines = getAuthStatusLines({
    authView,
    agentAccess,
    isAgentAccessLoading,
    agentAccessError,
  });

  useEffect(() => {
    void loadDemoTasks();
    void loadDemoConversations();
  }, [loadDemoConversations, loadDemoTasks]);

  const handleSessionClick = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    switchSession(sessionId);
    replaceWorkbenchUrl({
      sessionId,
      taskId: session?.taskId ?? currentTaskId,
    });
  };

  const handleTaskClick = async (taskId: string) => {
    lastDemoActionRef.current = {
      kind: 'task',
      id: taskId,
    };

    const sessionId = await startDemoTask(taskId);

    if (!sessionId) {
      return;
    }

    replaceWorkbenchUrl({
      sessionId,
      taskId,
    });
  };

  const handleDemoConversationClick = async (templateId: string) => {
    lastDemoActionRef.current = {
      kind: 'conversation',
      id: templateId,
    };

    const sessionId = await copyDemoConversationTemplate(templateId);

    if (!sessionId) {
      return;
    }

    replaceWorkbenchUrl({
      sessionId,
      taskId: currentTaskId,
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

  const handleRetryDemoCopy = () => {
    const lastAction = lastDemoActionRef.current;

    if (!lastAction) {
      return;
    }

    if (lastAction.kind === 'task') {
      void handleTaskClick(lastAction.id);
      return;
    }

    void handleDemoConversationClick(lastAction.id);
  };

  const handleUseRealAgentForDemoTask = async () => {
    if (!pendingDemoTaskId) {
      return;
    }

    const taskId = pendingDemoTaskId;
    const sessionId = await confirmRunDemoTaskWithAgent(taskId);

    if (!sessionId) {
      return;
    }

    replaceWorkbenchUrl({
      sessionId,
      taskId,
    });
  };

  const handleUseMockForDemoTask = async () => {
    if (!pendingDemoTaskId) {
      return;
    }

    const taskId = pendingDemoTaskId;
    const sessionId = await runDemoTaskAsMock(taskId);

    if (!sessionId) {
      return;
    }

    replaceWorkbenchUrl({
      sessionId,
      taskId,
    });
  };

  const handleLoginForDemoTask = () => {
    cancelDemoTaskChoice();

    if (canOpenLogin) {
      openLoginModal();
    }
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
          <h2 className="section-title">示例任务</h2>
          <p className="sidebar-demo-tip">
            访客使用公开演示，登录后会将会话型示例复制为你的私有会话。
          </p>
          <DemoTaskList
            taskView={demoTaskListView}
            conversationView={demoConversationTemplateListView}
            isCopying={isCopyingDemoTemplate}
            copyErrorMessage={copyDemoTemplateError}
            onStartTask={(taskId) => {
              void handleTaskClick(taskId);
            }}
            onCopyConversation={(templateId) => {
              void handleDemoConversationClick(templateId);
            }}
            onRetryTasks={() => {
              void retryLoadDemoTasks();
            }}
            onRetryConversations={() => {
              void retryLoadDemoConversations();
            }}
            onRetryCopy={handleRetryDemoCopy}
          />
        </section>

        <section className="sidebar-section">
          <h2 className="section-title">{recentToolsView.title}</h2>
          <RecentToolsCard
            view={recentToolsView}
            onRetry={() => {
              void retryLoadRecentTools();
            }}
          />
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
              ? '请配置 VITE_CLOUDBASE_ENV_ID 和 VITE_CLOUDBASE_REGION'
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
      <DemoTaskRunChoiceModal
        isOpen={isDemoTaskChoiceOpen}
        task={pendingDemoTask}
        availability={realAgentAvailability}
        isSubmitting={isCopyingDemoTemplate}
        errorMessage={demoTaskChoiceError}
        onUseAgent={() => {
          void handleUseRealAgentForDemoTask();
        }}
        onUseMock={() => {
          void handleUseMockForDemoTask();
        }}
        onLogin={handleLoginForDemoTask}
        onCancel={cancelDemoTaskChoice}
      />
    </aside>
  );
}
