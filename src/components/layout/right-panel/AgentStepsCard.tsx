import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { RunStepStatus } from '../../../types/workbench';
import { getStepStatusLabel } from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons, type IconKey } from '../../common/iconMap';

function getStepClass(status: RunStepStatus): string {
  if (status === 'success') {
    return 'done';
  }

  if (status === 'running') {
    return 'in-progress';
  }

  if (status === 'error') {
    return 'error';
  }

  if (status === 'stopped') {
    return 'stopped';
  }

  return 'pending';
}

function getStepIcon(status: RunStepStatus): IconKey {
  if (status === 'success') {
    return 'stepDone';
  }

  if (status === 'running') {
    return 'stepCurrent';
  }

  if (status === 'error') {
    return 'alert';
  }

  return 'stepPending';
}

export function AgentStepsCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const displayedSteps = currentRun?.steps ?? [];

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.agent} size={16} />
        <span>执行时间线</span>
      </h2>
      {!currentRun || displayedSteps.length === 0 ? (
        <div className="right-panel-empty-state">
          <strong>暂无执行步骤</strong>
          发送问题后，这里会展示本轮 Run 的执行时间线。
        </div>
      ) : (
        <ol className="run-step-timeline">
          {displayedSteps.map((step, index) => {
            const statusClass = getStepClass(step.status);
            const markerStatusClass = step.status === 'skipped' ? 'pending' : step.status;
            const isRunning = step.status === 'running';
            const stepElapsed = typeof step.elapsedMs === 'number' ? `${step.elapsedMs}ms` : '';

            return (
              <li key={step.id} className={`run-step-item ${statusClass}${isRunning ? ' active' : ''}`}>
                <span className={`run-step-marker step-icon-${markerStatusClass}`} aria-hidden="true">
                  <AppIcon icon={icons[getStepIcon(step.status)]} size={15} />
                </span>
                <div className="run-step-content">
                  <div className="run-step-main">
                    <span className="run-step-title">{`${index + 1}. ${step.title}`}</span>
                    <span className={`run-step-status run-step-status-${statusClass}`}>
                      {getStepStatusLabel(step.status)}
                    </span>
                  </div>
                  {step.description ? <div className="run-step-description">{step.description}</div> : null}
                  {stepElapsed ? <div className="run-step-meta">耗时：{stepElapsed}</div> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
