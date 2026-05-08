import { mockToolCalls } from '../../mocks/toolCalls';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { ChatInput } from './ChatInput';
import { ConfirmActionCard } from './ConfirmActionCard';
import { MessageBubble } from './MessageBubble';
import { ToolCallCard } from './ToolCallCard';

export function ChatPanel() {
  const currentPrompt = useWorkbenchStore((state) => state.currentPrompt);
  const assistantStream = useWorkbenchStore((state) => state.assistantStream);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const errorMessage = useWorkbenchStore((state) => state.errorMessage);
  const visibleToolCallIds = useWorkbenchStore((state) => state.visibleToolCallIds);
  const confirmStatus = useWorkbenchStore((state) => state.confirmStatus);
  const finalMessage = useWorkbenchStore((state) => state.finalMessage);
  const retryCurrentTask = useWorkbenchStore((state) => state.retryCurrentTask);
  const confirmGenerateReport = useWorkbenchStore((state) => state.confirmGenerateReport);
  const cancelGenerateReport = useWorkbenchStore((state) => state.cancelGenerateReport);
  const visibleToolCalls = mockToolCalls.filter((toolCall) => visibleToolCallIds.includes(toolCall.id));

  return (
    <div className="chat-panel">
      <div className="message-scroll">
        <div className="message-row user-row">
          <p className="message-time">10:42</p>
          <div className="user-row-main">
            <MessageBubble role="user">{currentPrompt}</MessageBubble>
            <div className="message-avatar message-avatar-user" aria-hidden="true">
              <AppIcon icon={icons.user} size={16} />
            </div>
          </div>
        </div>

        <div className="message-row ai-row">
          <div className="agent-avatar message-avatar message-avatar-bot" aria-hidden="true">
            <AppIcon icon={icons.brand} size={16} />
          </div>
          <div className="ai-stack">
            <MessageBubble role="assistant">
              {assistantStream.content}
              {assistantStream.status === 'streaming' ? <span className="typing-cursor">▍</span> : null}
              {assistantStream.status === 'stopped' ? (
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
            </MessageBubble>
          </div>
        </div>

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

        <div className="message-row ai-row">
          <div className="agent-avatar message-avatar message-avatar-bot" aria-hidden="true">
            <AppIcon icon={icons.brand} size={16} />
          </div>
          <div className="ai-stack">
            <MessageBubble role="assistant">
              <p>根据查询结果，以下是本月教学质量的关键异常点与简要结论：</p>
              <p className="summary-list">
                • 七年级平均分较上月下降 6.8%
                <br />
                • 八年级出勤率低于基线 3.2%
                <br />• 整体教学质量波动主要集中在周测成绩与缺勤率变化
              </p>
            </MessageBubble>
          </div>
        </div>

        <ConfirmActionCard
          status={confirmStatus}
          onConfirm={confirmGenerateReport}
          onCancel={cancelGenerateReport}
        />

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

        {finalMessage.status === 'visible' ? (
          <div className="message-row ai-row">
            <div className="agent-avatar message-avatar message-avatar-bot" aria-hidden="true">
              <AppIcon icon={icons.brand} size={16} />
            </div>
            <div className="ai-stack">
              <MessageBubble role="assistant">{finalMessage.content}</MessageBubble>
            </div>
          </div>
        ) : null}
      </div>

      <ChatInput />
    </div>
  );
}
