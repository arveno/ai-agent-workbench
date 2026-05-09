import { useEffect } from 'react';
import type { WorkflowStepDefinition } from '../../types/workbench';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { WorkflowStepCard } from './WorkflowStepCard';

const WORKFLOW_STEPS: WorkflowStepDefinition[] = [
  {
    id: 'workflow-input',
    kind: 'input',
    title: '用户输入',
    description:
      '用户提出分析问题，例如“分析 2026 年 5 月教学质量数据，找出异常指标”。',
    status: 'ready',
    outputSummary: 'prompt',
  },
  {
    id: 'workflow-intent',
    kind: 'intent',
    title: '理解问题',
    description: '识别用户意图、时间范围、指标对象和需要的分析方式。',
    status: 'ready',
    outputSummary: 'intent, dimensions, metrics',
  },
  {
    id: 'workflow-schema',
    kind: 'schema',
    title: '读取数据源 Schema',
    description: '通过 schema_inspect 工具读取允许访问的表、字段和字段类型。',
    status: 'ready',
    toolName: 'schema_inspect',
    outputSummary: 'tables, columns, columnTypes',
  },
  {
    id: 'workflow-tool-select',
    kind: 'toolSelect',
    title: '选择工具',
    description: '根据问题类型选择 query_table 或 aggregate_table 等受控工具。',
    status: 'ready',
    outputSummary: 'selectedTools',
  },
  {
    id: 'workflow-tool-execute',
    kind: 'toolExecute',
    title: '执行工具',
    description: '执行受控查询或聚合，禁止任意 SQL，必须遵守表白名单和 LIMIT。',
    status: 'ready',
    toolName: 'query_table / aggregate_table',
    outputSummary: 'rows, aggregates, elapsedMs',
  },
  {
    id: 'workflow-chart',
    kind: 'chart',
    title: '生成图表数据',
    description: '通过 chart_render 将查询结果转换为前端图表结构。',
    status: 'ready',
    toolName: 'chart_render',
    outputSummary: 'chartConfig, summary',
  },
  {
    id: 'workflow-answer',
    kind: 'answer',
    title: '生成最终回复',
    description: '将工具结果拼接为上下文，调用 Groq 流式生成最终分析结论。',
    status: 'ready',
    outputSummary: 'assistantMessage',
  },
  {
    id: 'workflow-run-display',
    kind: 'runDisplay',
    title: '展示 Run 结果',
    description: '前端展示本轮执行步骤、工具调用、数据分析结果和当前结论。',
    status: 'ready',
    outputSummary: 'run, toolInvocations, conclusion',
  },
];

export function WorkflowModal() {
  const isWorkflowModalOpen = useWorkbenchStore((state) => state.isWorkflowModalOpen);
  const closeWorkflowModal = useWorkbenchStore((state) => state.closeWorkflowModal);

  useEffect(() => {
    if (!isWorkflowModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeWorkflowModal();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeWorkflowModal, isWorkflowModalOpen]);

  if (!isWorkflowModalOpen) {
    return null;
  }

  return (
    <div
      className="workflow-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="工作流配置"
      onClick={closeWorkflowModal}
    >
      <div
        className="workflow-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="workflow-modal-header">
          <div>
            <h3 className="workflow-modal-title">工作流配置</h3>
            <p className="workflow-modal-description">
              查看 Agent 第一版固定执行链路。当前阶段不做自由编排，所有步骤由服务端受控执行。
            </p>
          </div>
          <button type="button" className="workflow-modal-close" onClick={closeWorkflowModal} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="workflow-modal-body">
          <div className="workflow-step-list">
            {WORKFLOW_STEPS.map((step, index) => (
              <WorkflowStepCard
                key={step.id}
                step={step}
                index={index}
                isLast={index === WORKFLOW_STEPS.length - 1}
              />
            ))}
          </div>
        </div>

        <footer className="workflow-modal-footer">
          <button type="button" className="workflow-modal-close-button" onClick={closeWorkflowModal}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}

