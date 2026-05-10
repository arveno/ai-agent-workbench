import { Fragment, useEffect, useRef } from 'react';
import type { AgentToolInvocationResult } from '../../types/workbench';
import type { RunToolInvocation } from '../../types/run';
import { mockToolCalls } from '../../mocks/toolCalls';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { formatToolInvocationForChat, type FormattedToolInvocation } from '../../utils/toolInvocationFormat';
import { shouldShowReportConfirm } from '../../utils/run';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
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


function getToolSummaryStatusClass(statusLabel: string): string {
  if (statusLabel === '异常') {
    return 'agent-tool-summary-status-error';
  }

  if (statusLabel === '已停止') {
    return 'agent-tool-summary-status-stopped';
  }

  if (statusLabel === '执行中') {
    return 'agent-tool-summary-status-running';
  }

  return 'agent-tool-summary-status-success';
}

function AgentToolSummary({ items }: { items: FormattedToolInvocation[] }) {
  return (
    <Card size="sm" className="agent-tool-summary">
      <CardHeader className="agent-tool-summary-header">
        <div className="agent-tool-summary-title-row">
          <span className="agent-tool-summary-icon" aria-hidden="true">
            <AppIcon icon={icons.settings} size={14} />
          </span>
          <CardTitle>本轮工具调用</CardTitle>
        </div>
        <Badge variant="outline" className="agent-tool-summary-count">
          {items.length} 个工具
        </Badge>
      </CardHeader>
      <CardContent className="agent-tool-summary-content">
        <div className="agent-tool-summary-list">
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 ? <Separator className="agent-tool-summary-separator" /> : null}
              <div className="agent-tool-summary-item">
                <div className="agent-tool-summary-main">
                  <div className="agent-tool-summary-title">{item.displayName}</div>
                  <div className="agent-tool-summary-category">{item.categoryLabel}</div>
                  <div className="agent-tool-summary-description">{item.outputText}</div>
                </div>
                <div className="agent-tool-summary-meta">
                  <Badge
                    variant="outline"
                    className={['agent-tool-summary-status', getToolSummaryStatusClass(item.statusLabel)]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {item.statusLabel}
                  </Badge>
                  {item.elapsedText !== '-' ? (
                    <span className="agent-tool-summary-elapsed">{item.elapsedText}</span>
                  ) : null}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


function findRunPromptMessageIndex(
  messages: Array<{ role: string; content: string }>,
  prompt: string | undefined,
): number {
  const normalizedPrompt = prompt?.trim();

  if (!normalizedPrompt) {
    return -1;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === 'user' && message.content.trim() === normalizedPrompt) {
      return index;
    }
  }

  return -1;
}

function isRenderableRunToolSummaryStatus(status: string): boolean {
  return status === 'running' || status === 'success' || status === 'stopped' || status === 'error';
}

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
  const fallbackAgentRunIsDataAnalysis =
    currentAgentRun?.plan?.intent === 'data_analysis' || Boolean(currentAgentRun?.toolInvocations.length);
  const runtimeToolInvocations = currentRun
    ? currentRun.toolInvocations
    : fallbackAgentRunIsDataAnalysis
      ? currentAgentRun?.toolInvocations.map((invocation) => mapAgentToolInvocation(invocation)) ?? []
      : [];
  const runtimeToolSummaries = runtimeToolInvocations.map((invocation) => formatToolInvocationForChat(invocation));
  const hasConversation = sessionMessages.length > 0;
  const shouldRenderRuntimeToolSummary = currentRun
    ? runtimeToolSummaries.length > 0 && isRenderableRunToolSummaryStatus(currentRun.status)
    : !isMockMode && fallbackAgentRunIsDataAnalysis && runtimeToolSummaries.length > 0;
  const currentRunPromptMessageIndex = findRunPromptMessageIndex(sessionMessages, currentRun?.prompt);
  const shouldRenderToolSummaryAfterMessages = shouldRenderRuntimeToolSummary && currentRunPromptMessageIndex < 0;
  const shouldShowConfirm = shouldShowReportConfirm(currentRun);
  const shouldShowAgentStreamingBubble = currentRun?.mode === 'agent' && currentRun.status === 'running';
  const agentStreamingContent =
    currentRun?.mode === 'agent' && currentRun.conclusion.trim()
      ? currentRun.conclusion
      : '正在分析问题并准备调用工具...';
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
    currentRun?.status,
    currentRun?.conclusion,
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
        {sessionMessages.map((message, messageIndex) => {
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
              <Fragment key={message.id}>
                <div className="message-row message-row-user">
                  <MessageBubble role="user" content={message.content} actions={copyAction} />
                  <div className="message-avatar message-avatar-user" aria-hidden="true">
                    <AppIcon icon={icons.user} size={16} />
                  </div>
                </div>
                {shouldRenderRuntimeToolSummary && messageIndex === currentRunPromptMessageIndex ? (
                  <AgentToolSummary items={runtimeToolSummaries} />
                ) : null}
              </Fragment>
            );
          }

          const isActiveAssistant = message.id === activeAssistantMessageId;
          const isStreamingAssistant = isMockMode && isActiveAssistant && generationStatus === 'streaming';
          const isStoppedAssistant = isMockMode && isActiveAssistant && generationStatus === 'stopped';
          return (
            <Fragment key={message.id}>
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

        {isMockMode && hasConversation && !currentRun ? (
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

        {shouldRenderToolSummaryAfterMessages ? <AgentToolSummary items={runtimeToolSummaries} /> : null}

        {shouldShowConfirm ? <ConfirmActionCard /> : null}

        {shouldShowAgentStreamingBubble ? (
          <>
            <div className="message-row message-row-assistant">
              <div className="message-avatar message-avatar-assistant" aria-hidden="true">
                <AppIcon icon={icons.brand} size={16} />
              </div>
              <MessageBubble
                role="assistant"
                content={agentStreamingContent}
                afterContent={<span className="typing-cursor">▍</span>}
              />
            </div>
          </>
        ) : null}

        {generationStatus === 'error' && errorMessage ? (
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
