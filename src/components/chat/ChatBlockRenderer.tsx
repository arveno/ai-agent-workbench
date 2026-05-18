import type { ChatBlock } from '../../types/chatBlocks';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { createMessageView } from '../../utils/messageTimelineViewModel';
import { Badge } from '../ui/badge';
import { ConfirmActionCard } from './ConfirmActionCard';
import { MessageBubble } from './MessageBubble';
import { RunErrorBlock } from './RunErrorBlock';
import { RunStoppedBlock } from './RunStoppedBlock';
import { StreamingAssistantBlock } from './StreamingAssistantBlock';

interface ChatBlockRendererProps {
  block: ChatBlock;
  activeAssistantMessageId: string;
  generationStatus: string;
  selectedRunId: string | null;
  onSelectAssistantRun: (runId: string) => void;
}

type MessageChatBlock = Extract<ChatBlock, { type: 'message' }>;

interface MessageBlockRendererProps {
  block: MessageChatBlock;
  activeAssistantMessageId: string;
  generationStatus: string;
  selectedRunId: string | null;
  onSelectAssistantRun: (runId: string) => void;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported chat block: ${String(value)}`);
}

function getChatBlockClassName(block: ChatBlock): string {
  const classNames = ['chat-block', `chat-block-${block.type}`];

  if (block.type === 'message') {
    classNames.push(`chat-block-message-${block.message.role}`, `chat-block-message-${block.message.kind}`);
  }

  return classNames.join(' ');
}

function MessageBlockRenderer({
  block,
  activeAssistantMessageId,
  generationStatus,
  selectedRunId,
  onSelectAssistantRun,
}: MessageBlockRendererProps) {
  const { copied, copy } = useCopyFeedback();
  const { message } = block;
  const shouldShowCopy = message.content.trim().length > 0;
  const copyLabel = copied ? '已复制' : '复制';
  const copyIcon = copied ? Check : icons.copy;
  const copyAction = shouldShowCopy ? (
    <button
      type="button"
      className={`message-copy-button${copied ? ' message-copy-button-copied' : ''}`}
      aria-label={copyLabel}
      title={copyLabel}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        void copy(message.content);
      }}
    >
      <AppIcon icon={copyIcon} size={14} />
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
  const messageView = createMessageView(message);
  const canSelectRun = Boolean(message.runId && message.kind !== 'report');
  const isSelectedRunMessage = Boolean(message.runId && message.runId === selectedRunId);
  const selectRun = () => {
    if (!message.runId || !canSelectRun) {
      return;
    }

    onSelectAssistantRun(message.runId);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (!canSelectRun || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    selectRun();
  };

  return (
    <div
      className={[
        'message-row',
        'message-row-assistant',
        canSelectRun ? 'message-row-run-selectable' : '',
        isSelectedRunMessage ? 'message-row-run-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={canSelectRun ? 'button' : undefined}
      tabIndex={canSelectRun ? 0 : undefined}
      title={canSelectRun ? '查看这条回复对应的 Run Trace' : undefined}
      aria-pressed={canSelectRun ? isSelectedRunMessage : undefined}
      onClick={selectRun}
      onKeyDown={handleKeyDown}
    >
      <div className="message-avatar message-avatar-assistant" aria-hidden="true">
        <AppIcon icon={icons.brand} size={16} />
      </div>
      <MessageBubble
        role="assistant"
        content={message.content}
        previewText={messageView.previewText}
        renderMode={messageView.renderMode}
        shouldCollapseByDefault={!isStreamingAssistant && messageView.shouldCollapseByDefault}
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
  let content: ReactNode;

  switch (props.block.type) {
    case 'message':
      content = (
        <MessageBlockRenderer
          block={props.block}
          activeAssistantMessageId={props.activeAssistantMessageId}
          generationStatus={props.generationStatus}
          selectedRunId={props.selectedRunId}
          onSelectAssistantRun={props.onSelectAssistantRun}
        />
      );
      break;
    case 'streaming_assistant':
      content = <StreamingAssistantBlock run={props.block.run} />;
      break;
    case 'report_confirm':
      content = <ConfirmActionCard run={props.block.run} />;
      break;
    case 'run_error':
      content = <RunErrorBlock run={props.block.run} />;
      break;
    case 'run_stopped':
      content = <RunStoppedBlock run={props.block.run} />;
      break;
    default:
      content = assertNever(props.block);
  }

  return <div className={getChatBlockClassName(props.block)}>{content}</div>;
}
