import { AppIcon } from '../common/AppIcon';
import { icons, type IconKey } from '../common/iconMap';
import type { RunToolInvocation } from '../../types/run';
import { formatToolInvocationForChat } from '../../utils/toolInvocationFormat';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

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

function createToolInvocationFromProps({
  title,
  toolName,
  params,
  result,
  status,
  elapsedMs,
}: Required<Pick<ToolCallCardProps, 'title' | 'toolName' | 'params' | 'result' | 'status'>> &
  Pick<ToolCallCardProps, 'elapsedMs'>): RunToolInvocation {
  return {
    id: toolName,
    toolId: toolName,
    toolName,
    displayName: title,
    status,
    inputSummary: params,
    outputSummary: result,
    elapsedMs,
  };
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
  const formatted = formatToolInvocationForChat(
    createToolInvocationFromProps({
      title,
      toolName,
      params,
      result,
      status,
      elapsedMs,
    })
  );
  const statusText = getToolStatusText(status);

  return (
    <Card size="sm" className="tool-card">
      <CardHeader className="tool-card-head">
        <span className={`tool-card-icon tool-card-icon-${tone}`} aria-hidden="true">
          <AppIcon icon={icons[icon]} size={14} />
        </span>
        <Badge variant="outline" className={`tool-state ${status === 'error' ? 'tool-state-error' : ''}`}>
          {statusText}
        </Badge>
      </CardHeader>
      <CardContent className="tool-card-content">
        <CardTitle>{formatted.displayName}</CardTitle>
        <p className="tool-card-category">{formatted.categoryLabel}</p>
        <p className="tool-card-summary">{formatted.outputText || formatted.inputText}</p>
        <p className="tool-status-line">
          状态：{formatted.statusLabel}
          {formatted.elapsedText !== '-' ? ` · ${formatted.elapsedText}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}
