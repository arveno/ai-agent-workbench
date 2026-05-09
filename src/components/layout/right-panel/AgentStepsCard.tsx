import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { AgentStepStatus } from '../../../types/workbench';
import { AppIcon } from '../../common/AppIcon';
import { icons, type IconKey } from '../../common/iconMap';

const STEP_TITLE_MAP: Record<string, string> = {
  understand: '理解用户问题',
  search: '检索知识资料',
  query: '查询业务数据',
  chart: '生成分析结果',
  confirm: '等待用户确认',
  final: '生成分析报告',
};

function getStepClass(status: AgentStepStatus): string {
  switch (status) {
    case 'success':
      return 'done';
    case 'running':
      return 'in-progress';
    case 'pending':
      return 'pending';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

function getStepStatusText(status: AgentStepStatus): string {
  switch (status) {
    case 'success':
      return '已完成';
    case 'running':
      return '进行中';
    case 'pending':
      return '待执行';
    case 'error':
      return '已中断';
    default:
      return '待执行';
  }
}

function getStepIcon(status: AgentStepStatus): IconKey {
  switch (status) {
    case 'success':
      return 'stepDone';
    case 'running':
      return 'stepCurrent';
    case 'pending':
      return 'stepPending';
    case 'error':
      return 'alert';
    default:
      return 'stepPending';
  }
}

export function AgentStepsCard() {
  const agentSteps = useWorkbenchStore((state) => state.agentSteps);
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const displayedSteps = currentAgentRun
    ? currentAgentRun.steps.map((step) => ({
        id: step.id,
        title: step.title,
        status: step.status,
        description: step.description,
        elapsedMs: step.elapsedMs,
      }))
    : agentSteps.map((step) => ({
        id: step.id,
        title: STEP_TITLE_MAP[step.id] ?? step.title,
        status: step.status,
        description: undefined,
        elapsedMs: undefined,
      }));

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.agent} size={16} />
        <span>本轮执行步骤</span>
      </h2>
      <ul className="agent-steps">
        {displayedSteps.map((step, index) => {
          const statusClass = getStepClass(step.status);
          const isRunning = step.status === 'running';
          const stepTitle = step.title;
          const stepDescription = step.description;
          const stepElapsed = typeof step.elapsedMs === 'number' ? `${step.elapsedMs}ms` : '';

          return (
            <li key={step.id} className={`agent-step ${statusClass}${isRunning ? ' active' : ''}`}>
              <span className="step-main step-main-column">
                <span className="step-main-line">
                  <span className={`step-icon-wrap step-icon-${step.status}`} aria-hidden="true">
                    <AppIcon icon={icons[getStepIcon(step.status)]} size={16} />
                  </span>
                  <span className="step-label">{`${index + 1}. ${stepTitle}`}</span>
                </span>
                {stepDescription ? <span className="step-desc">{stepDescription}</span> : null}
              </span>
              <span className="step-status">
                {getStepStatusText(step.status)}
                {stepElapsed ? ` · ${stepElapsed}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
