import type { RunSnapshot } from '../../types/run';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { MessageBubble } from './MessageBubble';

interface StreamingAssistantBlockProps {
  run: RunSnapshot;
}

export function StreamingAssistantBlock({ run }: StreamingAssistantBlockProps) {
  const content = run.conclusion.trim() || '正在分析问题并准备调用工具...';

  return (
    <div className="message-row message-row-assistant">
      <div className="message-avatar message-avatar-assistant" aria-hidden="true">
        <AppIcon icon={icons.brand} size={16} />
      </div>
      <MessageBubble role="assistant" content={content} afterContent={<span className="typing-cursor">▍</span>} />
    </div>
  );
}
