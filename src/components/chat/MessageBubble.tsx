import type { ReactNode } from 'react';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  children: ReactNode;
}

export function MessageBubble({ role, children }: MessageBubbleProps) {
  const roleClass = role === 'user' ? 'user-bubble' : 'ai-bubble';

  return <div className={`message-bubble ${roleClass}`}>{children}</div>;
}