import { Fragment } from 'react';
import type { RunSnapshot } from '../../types/run';
import { formatToolInvocationForChat, type FormattedToolInvocation } from '../../utils/toolInvocationFormat';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

interface ToolSummaryBlockProps {
  run: RunSnapshot;
}

function getToolSummaryStatusClass(statusLabel: string): string {
  if (statusLabel === '异常') {
    return 'agent-tool-summary-status-error';
  }

  if (statusLabel === '已停止') {
    return 'agent-tool-summary-status-stopped';
  }

  if (statusLabel === '执行中') {
    return 'agent-tool-summary-status-running';
  }

  return 'agent-tool-summary-status-success';
}

function ToolSummaryItem({ item, index }: { item: FormattedToolInvocation; index: number }) {
  return (
    <Fragment>
      {index > 0 ? <Separator className="agent-tool-summary-separator" /> : null}
      <div className="agent-tool-summary-item">
        <div className="agent-tool-summary-main">
          <div className="agent-tool-summary-title">{item.displayName}</div>
          <div className="agent-tool-summary-category">{item.categoryLabel}</div>
          <div className="agent-tool-summary-description">{item.outputText}</div>
        </div>
        <div className="agent-tool-summary-meta">
          <Badge
            variant="outline"
            className={['agent-tool-summary-status', getToolSummaryStatusClass(item.statusLabel)]
              .filter(Boolean)
              .join(' ')}
          >
            {item.statusLabel}
          </Badge>
          {item.elapsedText !== '-' ? <span className="agent-tool-summary-elapsed">{item.elapsedText}</span> : null}
        </div>
      </div>
    </Fragment>
  );
}

export function ToolSummaryBlock({ run }: ToolSummaryBlockProps) {
  const items = run.toolInvocations.map((invocation) => formatToolInvocationForChat(invocation));

  if (items.length === 0) {
    return null;
  }

  return (
    <Card size="sm" className="agent-tool-summary">
      <CardHeader className="agent-tool-summary-header">
        <div className="agent-tool-summary-title-row">
          <span className="agent-tool-summary-icon" aria-hidden="true">
            <AppIcon icon={icons.settings} size={14} />
          </span>
          <CardTitle>本轮工具调用</CardTitle>
        </div>
        <Badge variant="outline" className="agent-tool-summary-count">
          {items.length} 个工具
        </Badge>
      </CardHeader>
      <CardContent className="agent-tool-summary-content">
        <div className="agent-tool-summary-list">
          {items.map((item, index) => (
            <ToolSummaryItem key={item.id} item={item} index={index} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
