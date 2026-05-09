import { mockToolCalls } from '../../mocks/toolCalls';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { ChatInput } from './ChatInput';
import { ConfirmActionCard } from './ConfirmActionCard';
import { MessageBubble } from './MessageBubble';
import { ToolCallCard } from './ToolCallCard';

function formatMessageTime(createdAt: number): string {
  const date = new Date(createdAt);
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

export function ChatPanel() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const activeAssistantMessageId = useWorkbenchStore((state) => state.activeAssistantMessageId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const errorMessage = useWorkbenchStore((state) => state.errorMessage);
  const realModelNotice = useWorkbenchStore((state) => state.realModelNotice);
  const visibleToolCallIds = useWorkbenchStore((state) => state.visibleToolCallIds);
  const confirmStatus = useWorkbenchStore((state) => state.confirmStatus);
  const finalMessage = useWorkbenchStore((state) => state.finalMessage);
  const retryCurrentTask = useWorkbenchStore((state) => state.retryCurrentTask);
  const confirmGenerateReport = useWorkbenchStore((state) => state.confirmGenerateReport);
  const cancelGenerateReport = useWorkbenchStore((state) => state.cancelGenerateReport);
  const visibleToolCalls = mockToolCalls.filter((toolCall) => visibleToolCallIds.includes(toolCall.id));
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const sessionMessages = currentSession?.messages ?? [];
  const hasConversation = sessionMessages.length > 0;

  return (
    <div className="chat-panel">
      <div className="message-scroll">
        {sessionMessages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="message-row user-row">
                <p className="message-time">{formatMessageTime(message.createdAt)}</p>
                <div className="user-row-main">
                  <MessageBubble role="user" content={message.content} />
                  <div className="message-avatar message-avatar-user" aria-hidden="true">
                    <AppIcon icon={icons.user} size={16} />
                  </div>
                </div>
              </div>
            );
          }

          const isActiveAssistant = message.id === activeAssistantMessageId;

          return (
            <div key={message.id} className="message-row ai-row">
              <div className="agent-avatar message-avatar message-avatar-bot" aria-hidden="true">
                <AppIcon icon={icons.brand} size={16} />
              </div>
              <div className="ai-stack">
                <MessageBubble
                  role="assistant"
                  content={message.content}
                  afterContent={
                    <>
                      {isActiveAssistant && generationStatus === 'streaming' ? (
                        <span className="typing-cursor">▍</span>
                      ) : null}
                      {isActiveAssistant && generationStatus === 'stopped' ? (
                        <span
                          className="status-chip"
                          style={{
                            marginLeft: '8px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            border: '1px solid #d1d5db',
                            color: '#6b7280',
                            fontSize: '12px',
                          }}
                        >
                          已停止
                        </span>
                      ) : null}
                    </>
                  }
                />
              </div>
            </div>
          );
        })}

        {hasConversation ? (
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

        {hasConversation ? (
          <div className="message-row ai-row">
            <div className="agent-avatar message-avatar message-avatar-bot" aria-hidden="true">
              <AppIcon icon={icons.brand} size={16} />
            </div>
            <div className="ai-stack">
              <MessageBubble
                role="assistant"
                content={
                  <>
                    <p>根据查询结果，以下是本月教学质量的关键异常点与简要结论：</p>
                    <p className="summary-list">
                      • 七年级平均分较上月下降 6.8%
                      <br />
                      • 八年级出勤率低于基线 3.2%
                      <br />• 整体教学质量波动主要集中在周测成绩与缺勤率变化
                    </p>
                  </>
                }
              />
            </div>
          </div>
        ) : null}

        {hasConversation ? (
          <ConfirmActionCard
            status={confirmStatus}
            onConfirm={confirmGenerateReport}
            onCancel={cancelGenerateReport}
          />
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
        {realModelNotice ? (
          <div className="real-model-notice">{realModelNotice}</div>
        ) : null}

        {finalMessage.status === 'visible' ? (
          <div className="message-row ai-row">
            <div className="agent-avatar message-avatar message-avatar-bot" aria-hidden="true">
              <AppIcon icon={icons.brand} size={16} />
            </div>
            <div className="ai-stack">
              <MessageBubble role="assistant" content={finalMessage.content} />
            </div>
          </div>
        ) : null}
      </div>

      <ChatInput />
    </div>
  );
}
