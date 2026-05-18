import type { DemoConversationTemplateView } from '../../utils/demoTemplateViewModel';
import { Badge } from '../ui/badge';

interface DemoConversationCardProps {
  item: DemoConversationTemplateView;
  isActive?: boolean;
  disabled?: boolean;
  onOpen: (id: string) => void;
  onCopy: (id: string) => void;
}

function getCategoryLabel(category: DemoConversationTemplateView['category']): string {
  if (category === 'analysis') return '分析';
  if (category === 'report') return '报告';
  if (category === 'rag') return 'RAG';
  if (category === 'long_context') return '长文本';
  if (category === 'fallback') return '兜底';
  return '示例';
}

export function DemoConversationCard({
  item,
  isActive = false,
  disabled = false,
  onOpen,
  onCopy,
}: DemoConversationCardProps) {
  return (
    <article className={isActive ? 'demo-conversation-card active' : 'demo-conversation-card'}>
      <button
        type="button"
        className="demo-conversation-open"
        disabled={disabled}
        onClick={() => onOpen(item.id)}
      >
        <span className="demo-task-card-head">
          <span className="demo-task-title-wrap">
            <span className="demo-task-title">{item.title}</span>
          </span>
          <Badge variant="outline" className="demo-task-category">
            {getCategoryLabel(item.category)}
          </Badge>
        </span>
        <span className="demo-task-description">{item.description}</span>
      </button>
      <button
        type="button"
        className="demo-conversation-copy"
        disabled={disabled}
        onClick={() => onCopy(item.id)}
        aria-label={`复制示例会话：${item.title}`}
      >
        复制
      </button>
    </article>
  );
}
