import type { AgentToolDefinition } from '../../types/workbench';

interface ToolCardProps {
  tool: AgentToolDefinition;
}

function getToolStatusLabel(status: AgentToolDefinition['status']): string {
  if (status === 'enabled') {
    return '已启用';
  }

  if (status === 'disabled') {
    return '已禁用';
  }

  return '即将支持';
}

function getToolStatusClassName(status: AgentToolDefinition['status']): string {
  if (status === 'enabled') {
    return 'tool-status-badge tool-status-badge-enabled';
  }

  if (status === 'disabled') {
    return 'tool-status-badge tool-status-badge-disabled';
  }

  return 'tool-status-badge tool-status-badge-coming-soon';
}

function getRiskLabel(level: AgentToolDefinition['riskLevel']): string {
  if (level === 'low') {
    return '低风险';
  }

  if (level === 'medium') {
    return '中风险';
  }

  return '高风险';
}

function getRiskClassName(level: AgentToolDefinition['riskLevel']): string {
  if (level === 'low') {
    return 'tool-risk-badge tool-risk-badge-low';
  }

  if (level === 'medium') {
    return 'tool-risk-badge tool-risk-badge-medium';
  }

  return 'tool-risk-badge tool-risk-badge-high';
}

function getCategoryLabel(category: AgentToolDefinition['category']): string {
  if (category === 'schema') {
    return 'Schema 工具';
  }

  if (category === 'query') {
    return '查询工具';
  }

  if (category === 'analysis' || category === 'render') {
    return '分析与渲染工具';
  }

  return '知识与报告工具';
}

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <article className="tool-library-card">
      <header className="tool-library-card-header">
        <div className="tool-library-name-wrap">
          <h4 className="tool-library-name">{tool.name}</h4>
          <span className="tool-library-category-tag">{getCategoryLabel(tool.category)}</span>
        </div>
        <div className="tool-library-badge-group">
          <span className={getToolStatusClassName(tool.status)}>{getToolStatusLabel(tool.status)}</span>
          <span className={getRiskClassName(tool.riskLevel)}>{getRiskLabel(tool.riskLevel)}</span>
        </div>
      </header>

      <p className="tool-library-description">{tool.description}</p>

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
