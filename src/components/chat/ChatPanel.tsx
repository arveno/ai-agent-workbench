import { mockToolCalls } from '../../mocks/toolCalls';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { ChatInput } from './ChatInput';
import { ConfirmActionCard } from './ConfirmActionCard';
import { MessageBubble } from './MessageBubble';
import { ToolCallCard } from './ToolCallCard';

export function ChatPanel() {
  const currentPrompt = useWorkbenchStore((state) => state.currentPrompt);

  return (
    <div className="chat-panel">
      <div className="message-scroll">
        <div className="message-row user-row">
          <p className="message-time">10:42</p>
          <MessageBubble role="user">{currentPrompt}</MessageBubble>
        </div>

        <div className="message-row ai-row">
          <div className="agent-avatar" aria-hidden="true">
            🤖
          </div>
          <div className="ai-stack">
            <MessageBubble role="assistant">
              我将先检索相关指标口径与教学质量分析规则，再查询本月各年级成绩与出勤数据，随后给出异常项和简短分析结论。
            </MessageBubble>
          </div>
        </div>

        <div className="tool-card-grid">
          {mockToolCalls.map((toolCall) => (
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
          <div className="agent-avatar" aria-hidden="true">
            🤖
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

        <ConfirmActionCard />
      </div>

      <ChatInput />
    </div>
  );
}