import type { ChatBlock } from '../../types/chatBlocks';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Badge } from '../ui/badge';
import { ConfirmActionCard } from './ConfirmActionCard';
import { MessageBubble } from './MessageBubble';
import { RunErrorBlock } from './RunErrorBlock';
import { RunStoppedBlock } from './RunStoppedBlock';
import { StreamingAssistantBlock } from './StreamingAssistantBlock';
import { ToolSummaryBlock } from './ToolSummaryBlock';

interface ChatBlockRendererProps {
  block: ChatBlock;
  activeAssistantMessageId: string;
  generationStatus: string;
}

async function copyMessage(content: string): Promise<void> {
  if (!content.trim()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
  } catch {
    // Ignore clipboard permission errors in unsupported contexts.
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported chat block: ${String(value)}`);
}

function MessageBlockRenderer({ block, activeAssistantMessageId, generationStatus }: ChatBlockRendererProps) {
  if (block.type !== 'message') {
    return null;
  }

  const { message } = block;
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
      <div className="message-row message-row-user">
        <MessageBubble role="user" content={message.content} actions={copyAction} />
        <div className="message-avatar message-avatar-user" aria-hidden="true">
          <AppIcon icon={icons.user} size={16} />
        </div>
      </div>
    );
  }

  const isActiveAssistant = message.id === activeAssistantMessageId;
  const isStreamingAssistant = isActiveAssistant && generationStatus === 'streaming';
  const isStoppedAssistant = message.kind === 'partial' || (isActiveAssistant && generationStatus === 'stopped');
  const isReportMessage = message.kind === 'report';
  const isErrorMessage = message.kind === 'error';

  return (
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
            {isReportMessage ? (
              <Badge variant="outline" className="message-kind-tag message-kind-tag-report">
                报告
              </Badge>
            ) : null}
            {isStoppedAssistant ? <span className="message-status-tag">已停止</span> : null}
            {isErrorMessage ? <span className="message-status-tag message-status-tag-error">执行失败</span> : null}
          </>
        }
        actions={copyAction}
      />
    </div>
  );
}

export function ChatBlockRenderer(props: ChatBlockRendererProps) {
  switch (props.block.type) {
    case 'message':
      return <MessageBlockRenderer {...props} />;
    case 'tool_summary':
      return <ToolSummaryBlock run={props.block.run} />;
    case 'streaming_assistant':
      return <StreamingAssistantBlock run={props.block.run} />;
    case 'report_confirm':
      return <ConfirmActionCard run={props.block.run} />;
    case 'run_error':
      return <RunErrorBlock run={props.block.run} />;
    case 'run_stopped':
      return <RunStoppedBlock run={props.block.run} />;
    default:
      return assertNever(props.block);
  }
}
