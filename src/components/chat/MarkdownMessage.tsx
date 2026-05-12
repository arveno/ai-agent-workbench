import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
}

export const MarkdownMessage = memo(function MarkdownMessage({ content }: MarkdownMessageProps) {
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
});
