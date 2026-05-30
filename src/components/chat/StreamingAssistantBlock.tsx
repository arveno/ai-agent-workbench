import type { RunStreamingAssistantModel } from '../../utils/runPresentationModel';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { MessageBubble } from './MessageBubble';

interface StreamingAssistantBlockProps {
  model: RunStreamingAssistantModel;
}

export function StreamingAssistantBlock({ model }: StreamingAssistantBlockProps) {
  return (
    <div className="message-row message-row-assistant">
      <div className="message-avatar message-avatar-assistant" aria-hidden="true">
        <AppIcon icon={icons.brand} size={16} />
      </div>
      <MessageBubble role="assistant" content={model.content} afterContent={<span className="typing-cursor">▍</span>} />
    </div>
  );
}
