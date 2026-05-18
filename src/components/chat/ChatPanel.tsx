import { useEffect, useMemo, useRef } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { buildChatBlocks } from '../../utils/chatBlocks';
import { createMessageTimelineView } from '../../utils/messageTimelineViewModel';
import { Button } from '../ui/button';
import { ChatBlockRenderer } from './ChatBlockRenderer';
import { ChatInput } from './ChatInput';

export function ChatPanel() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const activeAssistantMessageId = useWorkbenchStore((state) => state.activeAssistantMessageId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const errorMessage = useWorkbenchStore((state) => state.errorMessage);
  const realModelNotice = useWorkbenchStore((state) => state.realModelNotice);
  const isMessagesLoading = useWorkbenchStore((state) => state.isMessagesLoading);
  const messagesError = useWorkbenchStore((state) => state.messagesError);
  const isOlderMessagesLoading = useWorkbenchStore((state) => state.isOlderMessagesLoading);
  const olderMessagesError = useWorkbenchStore((state) => state.olderMessagesError);
  const hasMoreMessages = useWorkbenchStore((state) => state.hasMoreMessages);
  const isPersistentMode = useWorkbenchStore((state) => state.isPersistentMode);
  const isReportArtifactsLoading = useWorkbenchStore((state) => state.isReportArtifactsLoading);
  const reportArtifactsError = useWorkbenchStore((state) => state.reportArtifactsError);
  const currentPrompt = useWorkbenchStore((state) => state.currentPrompt);
  const sendPrompt = useWorkbenchStore((state) => state.sendPrompt);
  const loadPersistentMessagesForSession = useWorkbenchStore((state) => state.loadPersistentMessagesForSession);
  const loadOlderMessagesForCurrentSession = useWorkbenchStore((state) => state.loadOlderMessagesForCurrentSession);
  const loadReportArtifacts = useWorkbenchStore((state) => state.loadReportArtifacts);
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );
  const chatBlocks = useMemo(
    () => buildChatBlocks({ session: currentSession, currentRun }),
    [currentSession, currentRun],
  );
  const timelineView = createMessageTimelineView({
    session: currentSession,
    isPersistentMode,
    isMessagesLoading,
    messagesError,
    hasMoreMessages,
    isOlderMessagesLoading,
    olderMessagesError,
  });
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastBlock = chatBlocks[chatBlocks.length - 1];
  const lastMessageContent =
    lastBlock?.type === 'message' ? lastBlock.message.content : currentRun?.conclusion ?? '';
  const hasRunErrorBlock = chatBlocks.some((block) => block.type === 'run_error');
  const isDraftNewChat = !currentSession && !isMessagesLoading && !messagesError;

  const loadOlderMessages = async () => {
    const element = chatScrollRef.current;
    const previousScrollHeight = element?.scrollHeight ?? 0;

    shouldAutoScrollRef.current = false;
    await loadOlderMessagesForCurrentSession();

    requestAnimationFrame(() => {
      if (!element) {
        return;
      }

      const nextScrollHeight = element.scrollHeight;
      element.scrollTop += nextScrollHeight - previousScrollHeight;
    });
  };

  const isNearBottom = () => {
    const element = chatScrollRef.current;

    if (!element) {
      return true;
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

    return distanceToBottom < 120;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    });
  };

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    requestAnimationFrame(() => {
      scrollToBottom('auto');
    });
  }, [currentSessionId]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current && !isNearBottom()) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToBottom(generationStatus === 'streaming' ? 'auto' : 'smooth');
    });
  }, [
    chatBlocks.length,
    lastMessageContent,
    generationStatus,
    activeAssistantMessageId,
    currentRun?.reportState,
    currentRun?.status,
    currentRun?.conclusion,
    currentRun?.toolInvocations.length,
    realModelNotice,
    errorMessage,
  ]);

  return (
    <div className="chat-panel">
      <div
        className="message-scroll chat-message-list"
        ref={chatScrollRef}
        onScroll={() => {
          shouldAutoScrollRef.current = isNearBottom();
        }}
      >
        {timelineView.hasMore ? (
          <div className="message-history-control">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={timelineView.isLoadingMore}
              onClick={() => {
                void loadOlderMessages();
              }}
            >
              {timelineView.isLoadingMore ? timelineView.loadingMoreMessage : timelineView.loadMoreLabel}
            </Button>
          </div>
        ) : null}

        {timelineView.loadMoreError ? (
          <div className="message-history-control message-history-control-error">
            <span>{timelineView.loadMoreError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={timelineView.isLoadingMore}
              onClick={() => {
                void loadOlderMessages();
              }}
            >
              重试
            </Button>
          </div>
        ) : null}

        {chatBlocks.map((block) => (
          <ChatBlockRenderer
            key={block.id}
            block={block}
            activeAssistantMessageId={activeAssistantMessageId}
            generationStatus={generationStatus}
          />
        ))}

        {generationStatus === 'error' && errorMessage && !hasRunErrorBlock ? (
          <div className="error-card">
            <div className="error-card-copy">
              <h3>执行失败</h3>
              <p>{errorMessage}</p>
            </div>
            <Button
              type="button"
              className="error-retry-btn"
              variant="outline"
              size="sm"
              disabled={!currentPrompt.trim()}
              onClick={() => {
                sendPrompt(currentPrompt);
              }}
            >
              重试
            </Button>
          </div>
        ) : null}

        {timelineView.isLoading ? <div className="real-model-notice">{timelineView.loadingMessage}</div> : null}

        {isReportArtifactsLoading ? <div className="real-model-notice">正在恢复报告 Artifact...</div> : null}

        {isDraftNewChat ? (
          <div className="chat-empty-state">
            <strong>新聊天</strong>
            <span>发送第一条消息后，会话才会创建并出现在左侧列表。</span>
          </div>
        ) : null}

        {!isDraftNewChat && timelineView.isEmpty ? (
          <div className="chat-empty-state">
            <strong>{timelineView.emptyTitle}</strong>
            <span>{timelineView.emptyDescription}</span>
          </div>
        ) : null}

        {timelineView.errorMessage ? (
          <div className="error-card">
            <div className="error-card-copy">
              <h3>会话恢复失败</h3>
              <p>{timelineView.errorMessage}</p>
            </div>
            {timelineView.canRetry && currentSession ? (
              <Button
                type="button"
                className="error-retry-btn"
                variant="outline"
                size="sm"
                onClick={() => {
                  void loadPersistentMessagesForSession(currentSession.id);
                }}
              >
                {timelineView.retryLabel}
              </Button>
            ) : null}
          </div>
        ) : null}

        {reportArtifactsError ? (
          <div className="error-card">
            <div className="error-card-copy">
              <h3>报告恢复失败</h3>
              <p>{reportArtifactsError}</p>
            </div>
            {currentSession ? (
              <Button
                type="button"
                className="error-retry-btn"
                variant="outline"
                size="sm"
                onClick={() => {
                  void loadReportArtifacts(currentSession.id);
                }}
              >
                重试
              </Button>
            ) : null}
          </div>
        ) : null}

        {realModelNotice ? <div className="real-model-notice">{realModelNotice}</div> : null}

        <div ref={bottomRef} />
      </div>

      <ChatInput />
    </div>
  );
}
