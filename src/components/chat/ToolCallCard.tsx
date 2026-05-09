import { AppIcon } from '../common/AppIcon';
import { icons, type IconKey } from '../common/iconMap';

interface ToolCallCardProps {
  title: string;
  toolName: string;
  params: string;
  result: string;
  status?: 'success' | 'running' | 'error';
  elapsedMs?: number;
}

function getToolIcon(toolName: string): { icon: IconKey; tone: 'knowledge' | 'data' | 'chart' } {
  if (toolName === 'knowledge_search' || toolName === 'schema_inspect') {
    return { icon: 'search', tone: 'knowledge' };
  }

  if (toolName === 'query_data' || toolName === 'query_table' || toolName === 'aggregate_table') {
    return { icon: 'database', tone: 'data' };
  }

  return { icon: 'chart', tone: 'chart' };
}

function getToolStatusText(status: 'success' | 'running' | 'error'): string {
  if (status === 'running') {
    return '执行中';
  }

  if (status === 'error') {
    return '失败';
  }

  return '已完成';
}

export function ToolCallCard({
  title,
  toolName,
  params,
  result,
  status = 'success',
  elapsedMs,
}: ToolCallCardProps) {
  const { icon, tone } = getToolIcon(toolName);
  const statusText = getToolStatusText(status);
  const elapsedText = typeof elapsedMs === 'number' ? ` · ${elapsedMs}ms` : '';

  return (
    <article className="tool-card">
      <div className="tool-card-head">
        <span className={`tool-card-icon tool-card-icon-${tone}`} aria-hidden="true">
          <AppIcon icon={icons[icon]} size={14} />
        </span>
        <span className={`tool-state ${status === 'error' ? 'tool-state-error' : ''}`}>{statusText}</span>
      </div>
      <h3>{title}</h3>
      <p>
        工具名：<code>{toolName}</code>
      </p>
      <p>参数：{params}</p>
      <p>结果摘要：{result}</p>
      <p className="tool-status-line">
        状态：{statusText}
        {elapsedText}
      </p>
    </article>
  );
}
