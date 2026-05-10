import { Fragment, useEffect, useRef } from 'react';
import type { AgentToolInvocationResult } from '../../types/workbench';
import type { RunToolInvocation } from '../../types/run';
import { mockToolCalls } from '../../mocks/toolCalls';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { formatToolInvocationForChat } from '../../utils/toolInvocationFormat';
import { shouldShowReportConfirm } from '../../utils/run';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { ChatInput } from './ChatInput';
import { ConfirmActionCard } from './ConfirmActionCard';
import { MessageBubble } from './MessageBubble';
import { ToolCallCard } from './ToolCallCard';

async function copyMessage(content: string): Promise<void> {
  if (!content.trim()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
  } catch {
    // ignore clipboard permission errors in unsupported contexts
  }
}

const SUMMARY_MESSAGE_CONTENT = `根据查询结果，以下是本月教学质量的关键异常点与简要结论：

- 七年级平均分较上月下降 6.8%
- 八年级出勤率低于基线 3.2%
- 整体教学质量波动主要集中在周测成绩与缺勤率变化`;

function mapAgentToolInvocation(invocation: AgentToolInvocationResult): RunToolInvocation {
  return {
    id: invocation.id,
    toolId: invocation.toolId,
    toolName: invocation.toolId,
    displayName: invocation.toolName,
    status: invocation.status,
    inputSummary: invocation.inputSummary,
    outputSummary: invocation.outputSummary,
    elapsedMs: invocation.elapsedMs,
  };
}

export function ChatPanel() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const activeAssistantMessageId = useWorkbenchStore((state) => state.activeAssistantMessageId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const errorMessage = useWorkbenchStore((state) => state.errorMessage);
  const realModelNotice = useWorkbenchStore((state) => state.realModelNotice);
  const visibleToolCallIds = useWorkbenchStore((state) => state.visibleToolCallIds);
  const finalMessage = useWorkbenchStore((state) => state.finalMessage);
  const retryCurrentTask = useWorkbenchStore((state) => state.retryCurrentTask);
  const visibleToolCalls = mockToolCalls.filter((toolCall) => visibleToolCallIds.includes(toolCall.id));
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const sessionMessages = currentSession?.messages ?? [];
  const isMockMode = currentModelProvider === 'mock';
  const shouldUseAgentRunTools = currentRun?.mode === 'agent';
  const isDataAnalysisRun =
    shouldUseAgentRunTools
      ? currentRun.intent === 'data_analysis'
      : currentAgentRun?.plan?.intent === 'data_analysis' || Boolean(currentAgentRun?.toolInvocations.length);
  const runtimeToolInvocations =
    shouldUseAgentRunTools
      ? currentRun.toolInvocations
      : currentAgentRun?.toolInvocations.map((invocation) => mapAgentToolInvocation(invocation)) ?? [];
  const runtimeToolSummaries =
    !isMockMode && isDataAnalysisRun
      ? runtimeToolInvocations.map((invocation) => formatToolInvocationForChat(invocation))
      : [];
  const hasConversation = sessionMessages.length > 0;
  const shouldRenderRuntimeToolSummary = !isMockMode && runtimeToolSummaries.length > 0;
  const shouldShowConfirm = shouldShowReportConfirm(currentRun);
  const shouldShowAgentLoading =
    currentRun?.mode === 'agent' && currentRun.status === 'running' && !currentRun.conclusion.trim();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const messageCount = sessionMessages.length;
  const lastMessageContent = messageCount > 0 ? sessionMessages[messageCount - 1]?.content ?? '' : '';

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
    messageCount,
    lastMessageContent,
    generationStatus,
    activeAssistantMessageId,
    visibleToolCalls.length,
    runtimeToolSummaries.length,
    currentRun?.reportState,
    finalMessage.status,
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
        {sessionMessages.map((message) => {
          const shouldShowCopy = message.content.trim().length > 0;
          const copyAction = shouldShowCopy ? (
            <button
              type="button"
              className="message-copy-button"
              aria-label="复制"
              title="复制"
              onClick={() => {
                void copyMessage(message.content);
              }}
            >
              <AppIcon icon={icons.copy} size={14} />
            </button>
          ) : null;

          if (message.role === 'user') {
            return (
              <div key={message.id} className="message-row message-row-user">
                <MessageBubble role="user" content={message.content} actions={copyAction} />
                <div className="message-avatar message-avatar-user" aria-hidden="true">
                  <AppIcon icon={icons.user} size={16} />
                </div>
              </div>
            );
          }

          const isActiveAssistant = message.id === activeAssistantMessageId;
          const isStreamingAssistant = isMockMode && isActiveAssistant && generationStatus === 'streaming';
          const isStoppedAssistant = isMockMode && isActiveAssistant && generationStatus === 'stopped';
          const shouldRenderToolSummaryBeforeMessage =
            shouldRenderRuntimeToolSummary && message.id === activeAssistantMessageId;

          return (
            <Fragment key={message.id}>
              {shouldRenderToolSummaryBeforeMessage ? (
                <div className="agent-tool-summary">
                  <div className="agent-tool-summary-header">
                    <span className="agent-tool-summary-icon" aria-hidden="true">
                      <AppIcon icon={icons.settings} size={14} />
                    </span>
                    <h3>本轮工具调用</h3>
                  </div>
                  <div className="agent-tool-summary-list">
                    {runtimeToolSummaries.map((item) => (
                      <div key={item.id} className="agent-tool-summary-item">
                        <div className="agent-tool-summary-main">
                          <div className="agent-tool-summary-title">{item.displayName}</div>
                          <div className="agent-tool-summary-category">{item.categoryLabel}</div>
                          <div className="agent-tool-summary-description">{item.outputText}</div>
                        </div>
                        <div className="agent-tool-summary-meta">
                          <span
                            className={`agent-tool-summary-status${item.statusLabel === '异常' ? ' agent-tool-summary-status-error' : ''}`}
                          >
                            {item.statusLabel}
                          </span>
                          {item.elapsedText !== '-' ? (
                            <span className="agent-tool-summary-elapsed">{item.elapsedText}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="message-row message-row-assistant">
                <div className="message-avatar message-avatar-assistant" aria-hidden="true">
                  <AppIcon icon={icons.brand} size={16} />
                </div>
                <MessageBubble
                  role="assistant"
                  content={message.content}
                  afterContent={
                    <>
                      {isStreamingAssistant ? <span className="typing-cursor">▍</span> : null}
                      {isStoppedAssistant ? <span className="message-status-tag">已停止</span> : null}
                    </>
                  }
                  actions={copyAction}
                />
              </div>
            </Fragment>
          );
        })}

        {isMockMode && hasConversation ? (
          <div className="tool-card-grid">
            {visibleToolCalls.map((toolCall) => (
              <ToolCallCard
                key={toolCall.id}
                title={toolCall.title}
                toolName={toolCall.toolName}
                params={toolCall.params}
                result={toolCall.result}
              />
            ))}
          </div>
        ) : null}

        {isMockMode && hasConversation ? (
          <div className="message-row message-row-assistant">
            <div className="message-avatar message-avatar-assistant" aria-hidden="true">
              <AppIcon icon={icons.brand} size={16} />
            </div>
            <MessageBubble
              role="assistant"
              content={SUMMARY_MESSAGE_CONTENT}
              actions={
                <button
                  type="button"
                  className="message-copy-button"
                  aria-label="复制"
                  title="复制"
                  onClick={() => {
                    void copyMessage(SUMMARY_MESSAGE_CONTENT);
                  }}
                >
                  <AppIcon icon={icons.copy} size={14} />
                </button>
              }
            />
          </div>
        ) : null}

        {shouldShowConfirm ? <ConfirmActionCard /> : null}

        {shouldShowAgentLoading ? (
          <div className="message-row message-row-assistant">
            <div className="message-avatar message-avatar-assistant" aria-hidden="true">
              <AppIcon icon={icons.brand} size={16} />
            </div>
            <MessageBubble role="assistant" content="正在分析问题并准备调用工具..." />
          </div>
        ) : null}

        {generationStatus === 'error' && errorMessage ? (
          <div className="error-card">
            <div className="error-card-copy">
              <h3>执行失败</h3>
              <p>{errorMessage}</p>
            </div>
            <button
              type="button"
              className="error-retry-btn"
              onClick={() => {
                void retryCurrentTask();
              }}
            >
              重试
            </button>
          </div>
        ) : null}

        {realModelNotice ? <div className="real-model-notice">{realModelNotice}</div> : null}

        {isMockMode && finalMessage.status === 'visible' ? (
          <div className="message-row message-row-assistant">
            <div className="message-avatar message-avatar-assistant" aria-hidden="true">
              <AppIcon icon={icons.brand} size={16} />
            </div>
            <MessageBubble
              role="assistant"
              content={finalMessage.content}
              actions={
                finalMessage.content.trim() ? (
                  <button
                    type="button"
                    className="message-copy-button"
                    aria-label="复制"
                    title="复制"
                    onClick={() => {
                      void copyMessage(finalMessage.content);
                    }}
                  >
                    <AppIcon icon={icons.copy} size={14} />
                  </button>
                ) : null
              }
            />
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <ChatInput />
    </div>
  );
}
