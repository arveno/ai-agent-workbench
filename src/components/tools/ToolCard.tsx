import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { WorkbenchToolDefinition } from '../../types/workbench';
import {
  getToolCategoryLabel,
  getToolRiskLabel,
  getToolRuntimeLabel,
  getToolStatusLabel,
} from '../../utils/toolRegistryView';

interface ToolCardProps {
  tool: WorkbenchToolDefinition;
}

function getToolStatusClassName(status: WorkbenchToolDefinition['status']): string {
  if (status === 'connected') {
    return 'tool-library-badge tool-library-badge-status-connected';
  }

  if (status === 'mock') {
    return 'tool-library-badge tool-library-badge-status-mock';
  }

  return 'tool-library-badge tool-library-badge-disabled';
}

function getVisibleToolStatusLabel(status: WorkbenchToolDefinition['status']): string {
  if (status === 'mock') {
    return '本地执行';
  }

  return getToolStatusLabel(status);
}

function getRiskClassName(level: WorkbenchToolDefinition['riskLevel']): string {
  if (level === 'low') {
    return 'tool-library-badge tool-library-badge-risk-low';
  }

  if (level === 'medium') {
    return 'tool-library-badge tool-library-badge-risk-medium';
  }

  return 'tool-library-badge tool-library-badge-risk-high';
}

function getRuntimeClassName(runtime: WorkbenchToolDefinition['runtime']): string {
  if (runtime === 'server') {
    return 'tool-library-badge tool-library-badge-runtime-server';
  }

  if (runtime === 'mock') {
    return 'tool-library-badge tool-library-badge-runtime-mock';
  }

  return 'tool-library-badge tool-library-badge-disabled';
}

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <Card size="sm" className="tool-library-card">
      <CardHeader className="tool-library-card-header">
        <div className="tool-library-card-title-row">
          <div className="tool-library-name-wrap">
            <CardTitle className="tool-library-name">{tool.displayName}</CardTitle>
            <CardDescription className="tool-library-id">{tool.name}</CardDescription>
          </div>
          <Badge variant="outline" className={getToolStatusClassName(tool.status)}>
            {getVisibleToolStatusLabel(tool.status)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="tool-library-card-content">
        <p className="tool-library-description">{tool.description}</p>

        <div className="tool-library-tag-row" aria-label="工具属性">
          <Badge variant="outline" className="tool-library-badge tool-library-badge-category">
            {getToolCategoryLabel(tool.category)}
          </Badge>
          <Badge variant="outline" className={getRuntimeClassName(tool.runtime)}>
            {getToolRuntimeLabel(tool.runtime)}
          </Badge>
          <Badge variant="outline" className={getRiskClassName(tool.riskLevel)}>
            {getToolRiskLabel(tool.riskLevel)}
          </Badge>
          <Badge
            variant="outline"
            className={
              tool.usedInRunTrace
                ? 'tool-library-badge tool-library-badge-trace-on'
                : 'tool-library-badge tool-library-badge-trace-off'
            }
          >
            {tool.usedInRunTrace ? '进入 Run Trace' : '不进入 Run Trace'}
          </Badge>
          <Badge
            variant="outline"
            className={
              tool.enabled
                ? 'tool-library-badge tool-library-badge-enabled'
                : 'tool-library-badge tool-library-badge-disabled'
            }
          >
            {tool.enabled ? '已启用' : '未启用'}
          </Badge>
        </div>

        <Separator className="tool-library-separator" />

        <dl className="tool-library-meta">
          <div className="tool-library-meta-item">
            <dt>输入</dt>
            <dd>{tool.inputSummary}</dd>
          </div>
          <div className="tool-library-meta-item">
            <dt>输出</dt>
            <dd>{tool.outputSummary}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
