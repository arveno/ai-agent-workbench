import type { WorkflowStepDefinition } from '../../types/workbench';

interface WorkflowStepCardProps {
  step: WorkflowStepDefinition;
  index: number;
  isLast: boolean;
}

function getStatusText(status: WorkflowStepDefinition['status']): string {
  if (status === 'ready') {
    return '已就绪';
  }

  if (status === 'running') {
    return '进行中';
  }

  if (status === 'done') {
    return '已完成';
  }

  if (status === 'waiting') {
    return '等待中';
  }

  return '未启用';
}

function getStatusClassName(status: WorkflowStepDefinition['status']): string {
  if (status === 'ready') {
    return 'workflow-step-status-badge workflow-step-status-badge-ready';
  }

  if (status === 'running') {
    return 'workflow-step-status-badge workflow-step-status-badge-running';
  }

  if (status === 'done') {
    return 'workflow-step-status-badge workflow-step-status-badge-done';
  }

  if (status === 'waiting') {
    return 'workflow-step-status-badge workflow-step-status-badge-waiting';
  }

  return 'workflow-step-status-badge workflow-step-status-badge-disabled';
}

export function WorkflowStepCard({ step, index, isLast }: WorkflowStepCardProps) {
  return (
    <article className="workflow-step-card">
      <div className="workflow-step-index-column">
        <span className="workflow-step-index" aria-hidden="true">
          {index + 1}
        </span>
        {!isLast ? <span className="workflow-step-connector" aria-hidden="true"></span> : null}
      </div>

      <div className="workflow-step-main">
        <div className="workflow-step-title-row">
          <h4 className="workflow-step-title">{step.title}</h4>
          <span className={getStatusClassName(step.status)}>{getStatusText(step.status)}</span>
        </div>

        <p className="workflow-step-description">{step.description}</p>

        <div className="workflow-step-meta">
          {step.toolName ? (
            <p className="workflow-step-meta-item">
              <span className="workflow-step-meta-label">工具</span>
              <span className="workflow-step-meta-value">{step.toolName}</span>
            </p>
          ) : null}
          {step.outputSummary ? (
            <p className="workflow-step-meta-item">
              <span className="workflow-step-meta-label">输出</span>
              <span className="workflow-step-meta-value">{step.outputSummary}</span>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

