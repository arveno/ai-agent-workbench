import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: ReactNode;
  afterContent?: ReactNode;
  actions?: ReactNode;
}

interface MarkdownMessageProps {
  content: string;
}

function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: linkChildren, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noreferrer">
                {linkChildren}
              </a>
            ) : (
              <span>{linkChildren}</span>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function MessageBubble({ role, content, afterContent, actions }: MessageBubbleProps) {
  const roleClass = role === 'user' ? 'user-bubble' : 'ai-bubble';
  const isAssistantText = role === 'assistant' && typeof content === 'string';
  const isUserText = role === 'user' && typeof content === 'string';

  const renderedContent = isAssistantText ? (
    <MarkdownMessage content={content} />
  ) : isUserText ? (
    <div className="message-content-text">{content}</div>
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
