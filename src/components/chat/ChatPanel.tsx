import { useEffect, useMemo, useRef } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { buildChatBlocks } from '../../utils/chatBlocks';
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
  const retryCurrentTask = useWorkbenchStore((state) => state.retryCurrentTask);
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );
  const chatBlocks = useMemo(
    () => buildChatBlocks({ session: currentSession, currentRun }),
    [currentSession, currentRun],
  );
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastBlock = chatBlocks[chatBlocks.length - 1];
  const lastMessageContent =
    lastBlock?.type === 'message' ? lastBlock.message.content : currentRun?.conclusion ?? '';
  const hasRunErrorBlock = chatBlocks.some((block) => block.type === 'run_error');

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
              onClick={() => {
                void retryCurrentTask();
              }}
            >
              重试
            </Button>
          </div>
        ) : null}

        {realModelNotice ? <div className="real-model-notice">{realModelNotice}</div> : null}

        <div ref={bottomRef} />
      </div>

      <ChatInput />
    </div>
  );
}
