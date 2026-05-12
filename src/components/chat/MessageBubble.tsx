import type { ReactNode } from 'react';
import type { MessageRenderMode } from '../../utils/messageTimelineViewModel';
import { LongTextBlock } from './LongTextBlock';
import { MarkdownMessage } from './MarkdownMessage';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: ReactNode;
  previewText?: string;
  renderMode?: MessageRenderMode;
  shouldCollapseByDefault?: boolean;
  afterContent?: ReactNode;
  actions?: ReactNode;
}

function renderTextContent(content: string, renderMode: MessageRenderMode): ReactNode {
  if (renderMode === 'markdown' || renderMode === 'report') {
    return <MarkdownMessage content={content} />;
  }

  return <div className="message-content-text">{content}</div>;
}

export function MessageBubble({
  role,
  content,
  previewText,
  renderMode,
  shouldCollapseByDefault = false,
  afterContent,
  actions,
}: MessageBubbleProps) {
  const roleClass = role === 'user' ? 'user-bubble' : 'ai-bubble';
  const isText = typeof content === 'string';
  const normalizedRenderMode: MessageRenderMode = renderMode ?? (role === 'assistant' ? 'markdown' : 'plain');

  const renderedContent = isText ? (
    <LongTextBlock
      key={shouldCollapseByDefault ? 'collapsed' : 'open'}
      content={content}
      previewText={previewText ?? content}
      shouldCollapseByDefault={shouldCollapseByDefault}
      renderContent={(visibleContent) => renderTextContent(visibleContent, normalizedRenderMode)}
    />
  ) : (
    <div className="message-content-text">{content}</div>
  );

  return (
    <div className="message-content-wrap">
      <div className={`message-bubble ${roleClass}`}>
        {renderedContent}
        {afterContent}
      </div>
      {actions ? <div className="message-copy-actions">{actions}</div> : null}
    </div>
  );
}
