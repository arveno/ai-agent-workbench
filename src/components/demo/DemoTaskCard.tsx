import type { DemoConversationTemplateView, DemoTaskView } from '../../utils/demoTemplateViewModel';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Badge } from '../ui/badge';

type DemoCardItem = DemoTaskView | DemoConversationTemplateView;

interface DemoTaskCardProps {
  item: DemoCardItem;
  disabled?: boolean;
  onClick: (id: string) => void;
}

function getCategoryIcon(category: DemoCardItem['category']) {
  if (category === 'rag') return icons.knowledge;
  if (category === 'long_context') return icons.document;
  if (category === 'fallback') return icons.alert;
  if (category === 'report') return icons.report;
  if (category === 'intro') return icons.agent;
  return icons.chart;
}

function getCategoryLabel(category: DemoCardItem['category']): string {
  if (category === 'intro') return '能力';
  if (category === 'analysis') return '分析';
  if (category === 'report') return '报告';
  if (category === 'rag') return 'RAG';
  if (category === 'long_context') return '长上下文';
  return '兜底';
}

function getModeLabel(item: DemoCardItem): string {
  if ('recommendedMode' in item) {
    return item.recommendedMode === 'agent' ? '推荐真实 Agent' : '公开演示';
  }

  return '会话模板';
}

export function DemoTaskCard({ item, disabled = false, onClick }: DemoTaskCardProps) {
  const isTemplateBacked = 'isConversationTemplateBacked' in item && item.isConversationTemplateBacked;
  const isAgentRecommended = 'recommendedMode' in item && item.recommendedMode === 'agent';

  return (
    <button type="button" className="demo-task-card" disabled={disabled} onClick={() => onClick(item.id)}>
      <span className="demo-task-card-head">
        <span className="demo-task-title-wrap">
          <AppIcon icon={getCategoryIcon(item.category)} size={14} />
          <span className="demo-task-title">{item.title}</span>
        </span>
        <Badge variant="outline" className="demo-task-category">
          {getCategoryLabel(item.category)}
        </Badge>
      </span>
      <span className={isAgentRecommended ? 'demo-task-mode is-agent' : 'demo-task-mode'}>
        {getModeLabel(item)}
      </span>
      <span className="demo-task-description">{item.description}</span>
      <span className="demo-task-showcase">{item.showcaseValue}</span>
      <span className="demo-task-tags">
        {isTemplateBacked ? <span className="demo-task-tag">复制会话</span> : null}
        {item.tagLabels.slice(0, 3).map((tag) => (
          <span key={tag} className="demo-task-tag">
            {tag}
          </span>
        ))}
      </span>
    </button>
  );
}
