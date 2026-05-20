import { useEffect } from 'react';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { AgentAccessView, AuthSessionView } from '../../types/auth';
import { createConversationListView } from '../../utils/conversationListViewModel';
import { createDemoConversationTemplateListView } from '../../utils/demoTemplateViewModel';
import { replaceWorkbenchUrl } from '../../utils/urlState';
import { LoginModal } from '../auth/LoginModal';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { ConversationList } from '../conversation/ConversationList';
import { DemoConversationList } from '../demo/DemoConversationList';

function getAuthDisplayName(authView: AuthSessionView): string {
  if (authView.status === 'loading') {
    return '正在检查登录状态';
  }

  if (authView.status === 'authenticated') {
    return authView.displayName || authView.email || 'CloudBase 用户';
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

  return ['模拟模式可用'];
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
  const createSession = useWorkbenchStore((state) => state.createSession);
  const switchSession = useWorkbenchStore((state) => state.switchSession);
  const hydratePersistentWorkbench = useWorkbenchStore((state) => state.hydratePersistentWorkbench);
  const isPersistentMode = useWorkbenchStore((state) => state.isPersistentMode);
  const isConversationListLoading = useWorkbenchStore((state) => state.isConversationListLoading);
  const isCreatingConversation = useWorkbenchStore((state) => state.isCreatingConversation);
  const conversationListError = useWorkbenchStore((state) => state.conversationListError);
  const demoConversations = useWorkbenchStore((state) => state.demoConversations);
  const isDemoConversationsLoading = useWorkbenchStore((state) => state.isDemoConversationsLoading);
  const demoConversationsError = useWorkbenchStore((state) => state.demoConversationsError);
  const isCopyingDemoTemplate = useWorkbenchStore((state) => state.isCopyingDemoTemplate);
  const copyDemoTemplateError = useWorkbenchStore((state) => state.copyDemoTemplateError);
  const loadDemoConversations = useWorkbenchStore((state) => state.loadDemoConversations);
  const retryLoadDemoConversations = useWorkbenchStore((state) => state.retryLoadDemoConversations);
  const openDemoConversationTemplate = useWorkbenchStore((state) => state.openDemoConversationTemplate);
  const copyDemoConversationTemplate = useWorkbenchStore((state) => state.copyDemoConversationTemplate);
  const isAuthenticated = authView.status === 'authenticated';
  const isAuthLoading = authView.status === 'loading';
  const canOpenLogin = authView.isAuthConfigured && !isAuthLoading;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const activeDemoTemplateId = currentSession?.visibility === 'demo' ? currentSession.sourceTemplateId ?? null : null;
  const conversationListView = createConversationListView({
    sessions,
    currentSessionId,
    isPersistentMode: isPersistentMode || isAuthenticated,
    isLoading: isConversationListLoading || isAuthLoading,
    errorMessage: conversationListError,
  });
  const demoConversationTemplateListView = createDemoConversationTemplateListView({
    templates: demoConversations,
    isLoading: isDemoConversationsLoading,
    errorMessage: demoConversationsError,
  });
  const authStatusLines = getAuthStatusLines({
    authView,
    agentAccess,
    isAgentAccessLoading,
    agentAccessError,
  });
  const authDisplayName = getAuthDisplayName(authView);
  const visibleAuthStatusLines = authStatusLines.filter((line) => line !== authDisplayName);

  useEffect(() => {
    void loadDemoConversations();
  }, [loadDemoConversations]);

  const replaceUrlForSession = (sessionId: string) => {
    replaceWorkbenchUrl({
      sessionId,
    });
  };

  const handleSessionClick = (sessionId: string) => {
    switchSession(sessionId);
    replaceUrlForSession(sessionId);
  };

  const handleCreateSession = async () => {
    await createSession();
    replaceWorkbenchUrl({});
  };

  const handleRetryConversations = () => {
    void hydratePersistentWorkbench();
  };

  const handleDemoConversationClick = (templateId: string) => {
    const sessionId = openDemoConversationTemplate(templateId);

    if (sessionId) {
      replaceWorkbenchUrl({});
    }
  };

  const handleCopyDemoConversation = async (templateId: string) => {
    const sessionId = await copyDemoConversationTemplate(templateId);

    if (sessionId) {
      replaceUrlForSession(sessionId);
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
            <span>{isCreatingConversation ? '正在新建...' : '新聊天'}</span>
          </span>
        </button>

        <section className="sidebar-section">
          <h2 className="section-title">我的会话</h2>
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
          <h2 className="section-title">示例会话</h2>
          <p className="sidebar-demo-tip">
            预置只读示例，打开后不会写入我的会话。
          </p>
          <DemoConversationList
            view={demoConversationTemplateListView}
            activeTemplateId={activeDemoTemplateId}
            isCopying={isCopyingDemoTemplate}
            copyErrorMessage={copyDemoTemplateError}
            onOpenConversation={handleDemoConversationClick}
            onCopyConversation={(templateId) => {
              void handleCopyDemoConversation(templateId);
            }}
            onRetryConversations={() => {
              void retryLoadDemoConversations();
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
            <p className="user-name" title={authView.email ?? authDisplayName}>
              {authDisplayName}
            </p>
            <div className="user-status-list" aria-label="登录状态">
              {visibleAuthStatusLines.map((line, index) => (
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
    </aside>
  );
}
