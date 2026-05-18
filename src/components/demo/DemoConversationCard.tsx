import type { DemoConversationTemplateView } from '../../utils/demoTemplateViewModel';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Badge } from '../ui/badge';

interface DemoConversationCardProps {
  item: DemoConversationTemplateView;
  isActive?: boolean;
  disabled?: boolean;
  onOpen: (id: string) => void;
  onCopy: (id: string) => void;
}

function getCategoryIcon(category: DemoConversationTemplateView['category']) {
  if (category === 'rag') return icons.knowledge;
  if (category === 'long_context') return icons.document;
  if (category === 'report') return icons.report;
  return icons.chart;
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
            <AppIcon icon={getCategoryIcon(item.category)} size={14} />
            <span className="demo-task-title">{item.title}</span>
          </span>
          <Badge variant="outline" className="demo-task-category">
            {getCategoryLabel(item.category)}
          </Badge>
        </span>
        <span className="demo-task-mode">公开只读</span>
        <span className="demo-task-description">{item.description}</span>
        <span className="demo-task-showcase">{item.showcaseValue}</span>
        <span className="demo-task-tags">
          {item.tagLabels.slice(0, 3).map((tag) => (
            <span key={tag} className="demo-task-tag">
              {tag}
            </span>
          ))}
        </span>
      </button>
      <button
        type="button"
        className="demo-conversation-copy"
        disabled={disabled}
        onClick={() => onCopy(item.id)}
      >
        复制到我的会话
      </button>
    </article>
  );
}
