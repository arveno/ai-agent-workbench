import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WorkflowStepDefinition } from '../../types/workbench';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { PromptTemplatePanel } from './PromptTemplatePanel';

const WORKFLOW_STEPS: WorkflowStepDefinition[] = [
  {
    id: 'workflow-input',
    kind: 'input',
    title: '用户输入',
    description: '用户提出分析问题，例如“分析 2026 年 5 月教学质量数据，找出异常指标”。',
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
    description: '将工具结果拼接为上下文，通过服务端受控模型网关生成最终分析结论。',
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
    return 'workflow-badge workflow-badge-ready';
  }

  if (status === 'running') {
    return 'workflow-badge workflow-badge-running';
  }

  if (status === 'done') {
    return 'workflow-badge workflow-badge-done';
  }

  if (status === 'waiting') {
    return 'workflow-badge workflow-badge-waiting';
  }

  return 'workflow-badge workflow-badge-muted';
}

function getWorkflowInputSummary(step: WorkflowStepDefinition): string {
  if (step.kind === 'input') {
    return '用户问题';
  }

  if (step.kind === 'intent') {
    return 'prompt';
  }

  if (step.kind === 'schema') {
    return 'provider, allowedSchemas';
  }

  if (step.kind === 'toolSelect') {
    return 'intent, schema, prompt';
  }

  if (step.kind === 'toolExecute') {
    return 'selectedTool, constraints';
  }

  if (step.kind === 'chart') {
    return 'toolResult, chartType';
  }

  if (step.kind === 'answer') {
    return 'toolContext, chartSummary';
  }

  return 'runSnapshot';
}

function renderWorkflowStep(step: WorkflowStepDefinition, index: number, isLast: boolean) {
  return (
    <div key={step.id} className="workflow-step-item">
      <div className="workflow-step-index-column" aria-hidden="true">
        <span className="workflow-step-index">{index + 1}</span>
        {!isLast ? <span className="workflow-step-connector" /> : null}
      </div>

      <Card size="sm" className="workflow-step-card">
        <CardHeader className="workflow-step-card-header">
          <div className="workflow-step-title-row">
            <div>
              <CardTitle className="workflow-step-title">{step.title}</CardTitle>
              <CardDescription className="workflow-step-description">{step.description}</CardDescription>
            </div>
            <Badge variant="outline" className={getStatusClassName(step.status)}>
              {getStatusText(step.status)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="workflow-step-card-content">
          <div className="workflow-step-meta">
            <div className="workflow-step-meta-item">
              <span>输入</span>
              <strong>{getWorkflowInputSummary(step)}</strong>
            </div>
            <div className="workflow-step-meta-item">
              <span>输出</span>
              <strong>{step.outputSummary ?? '-'}</strong>
            </div>
            <div className="workflow-step-meta-item">
              <span>关联工具</span>
              <strong>{step.toolName ?? '-'}</strong>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
      aria-label="Workflow / Prompt 模板"
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
            <h3 className="workflow-modal-title">Workflow / Prompt 模板</h3>
            <p className="workflow-modal-description">
              查看固定任务流程模板，并维护仅本地会话生效的 Prompt 模板；这些模板不直接改变 CloudBase 后端执行逻辑。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="workflow-modal-close"
            onClick={closeWorkflowModal}
            aria-label="关闭"
          >
            ×
          </Button>
        </header>

        <div className="workflow-modal-body">
          <Tabs defaultValue="flow" className="workflow-tabs">
            <TabsList className="workflow-tabs-list">
              <TabsTrigger className="workflow-tabs-trigger" value="flow">
                执行流程
              </TabsTrigger>
              <TabsTrigger className="workflow-tabs-trigger" value="prompts">
                Prompt 模板
              </TabsTrigger>
            </TabsList>

            <TabsContent value="flow" className="workflow-tabs-content">
              <div className="workflow-flow-panel">
                <div className="workflow-panel-heading">
                  <div>
                    <h4 className="workflow-panel-title">任务流程模板</h4>
                    <p className="workflow-panel-description">
                      当前版本使用固定流程模板，不伪装成完整可视化编排器；模型负责判断任务类型，实际工具执行由服务端受控流程完成。
                    </p>
                  </div>
                  <Badge variant="outline" className="workflow-badge workflow-badge-ready">
                    8 个步骤
                  </Badge>
                </div>

                <ScrollArea className="workflow-flow-scroll">
                  <div className="workflow-step-list">
                    {WORKFLOW_STEPS.map((step, index) =>
                      renderWorkflowStep(step, index, index === WORKFLOW_STEPS.length - 1)
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="prompts" className="workflow-tabs-content">
              <PromptTemplatePanel />
            </TabsContent>
          </Tabs>
        </div>

        <footer className="workflow-modal-footer">
          <Button type="button" variant="outline" onClick={closeWorkflowModal}>
            关闭
          </Button>
        </footer>
      </div>
    </div>
  );
}
