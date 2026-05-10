import type { WorkbenchToolDefinition } from '../../types/workbench';
import { getToolRiskLabel, getToolRuntimeLabel, getToolStatusLabel } from '../../utils/toolRegistryView';

interface ToolCardProps {
  tool: WorkbenchToolDefinition;
}

function getToolStatusClassName(status: WorkbenchToolDefinition['status']): string {
  if (status === 'connected') {
    return 'tool-status-badge tool-status-badge-connected';
  }

  if (status === 'mock') {
    return 'tool-status-badge tool-status-badge-mock';
  }

  return 'tool-status-badge tool-status-badge-planned';
}

function getRiskClassName(level: WorkbenchToolDefinition['riskLevel']): string {
  if (level === 'low') {
    return 'tool-risk-badge tool-risk-badge-low';
  }

  if (level === 'medium') {
    return 'tool-risk-badge tool-risk-badge-medium';
  }

  return 'tool-risk-badge tool-risk-badge-high';
}

function getRuntimeClassName(runtime: WorkbenchToolDefinition['runtime']): string {
  if (runtime === 'server') {
    return 'tool-runtime-badge tool-runtime-badge-server';
  }

  if (runtime === 'mock') {
    return 'tool-runtime-badge tool-runtime-badge-mock';
  }

  return 'tool-runtime-badge tool-runtime-badge-planned';
}

function getCategoryLabel(category: WorkbenchToolDefinition['category']): string {
  if (category === 'schema') {
    return 'Schema 工具';
  }

  if (category === 'query') {
    return '查询工具';
  }

  if (category === 'analysis') {
    return '分析工具';
  }

  if (category === 'render') {
    return '可视化工具';
  }

  if (category === 'knowledge') {
    return '知识工具';
  }

  return '报告工具';
}

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <article className="tool-library-card">
      <header className="tool-library-card-header">
        <div className="tool-library-name-wrap">
          <h4 className="tool-library-name">{tool.displayName}</h4>
          <div className="tool-library-id">{tool.name}</div>
        </div>
        <div className="tool-library-badge-group">
          <span className={getToolStatusClassName(tool.status)}>{getToolStatusLabel(tool.status)}</span>
        </div>
      </header>

      <p className="tool-library-description">{tool.description}</p>

      <div className="tool-library-tag-row">
        <span className="tool-library-category-tag">{getCategoryLabel(tool.category)}</span>
        <span className={getRuntimeClassName(tool.runtime)}>{getToolRuntimeLabel(tool.runtime)}</span>
        <span className={getRiskClassName(tool.riskLevel)}>{getToolRiskLabel(tool.riskLevel)}</span>
        <span className={tool.usedInRunTrace ? 'tool-trace-badge tool-trace-badge-on' : 'tool-trace-badge'}>
          {tool.usedInRunTrace ? 'Run Trace 中展示' : '不进入 Run Trace'}
        </span>
      </div>

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
    </article>
  );
}
