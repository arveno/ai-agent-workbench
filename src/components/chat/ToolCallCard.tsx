import { AppIcon } from '../common/AppIcon';
import { icons, type IconKey } from '../common/iconMap';

interface ToolCallCardProps {
  title: string;
  toolName: string;
  params: string;
  result: string;
}

function getToolIcon(toolName: string): { icon: IconKey; tone: 'knowledge' | 'data' | 'chart' } {
  if (toolName === 'knowledge_search') {
    return { icon: 'search', tone: 'knowledge' };
  }

  if (toolName === 'query_data') {
    return { icon: 'database', tone: 'data' };
  }

  return { icon: 'chart', tone: 'chart' };
}

export function ToolCallCard({ title, toolName, params, result }: ToolCallCardProps) {
  const { icon, tone } = getToolIcon(toolName);

  return (
    <article className="tool-card">
      <div className="tool-card-head">
        <span className={`tool-card-icon tool-card-icon-${tone}`} aria-hidden="true">
          <AppIcon icon={icons[icon]} size={14} />
        </span>
        <span className="tool-state">已完成</span>
      </div>
      <h3>{title}</h3>
      <p>
        工具名：<code>{toolName}</code>
      </p>
      <p>参数：{params}</p>
      <p>结果摘要：{result}</p>
      <p className="tool-status-line">状态：已完成</p>
    </article>
  );
}
