/// <reference types="node" />

import { ensureServerEnvLoaded } from '../datasources/connection';
import { generateTextWithModelGateway } from '../models/modelGateway';
import type { AggregateTableInput, AggregateTableOutput } from '../tools/aggregateTableTool';
import type { ChartRenderInput, ChartRenderOutput } from '../tools/chartRenderTool';
import { serverToolRegistry } from '../tools/registry';
import type { SchemaInspectInput, SchemaInspectOutput } from '../tools/schemaInspectTool';
import type { ServerToolContext } from '../tools/types';
import { createCapabilityIntroConclusion, createUnsupportedConclusion } from './capabilityReply';
import { planAgentRun } from './planner';
import { buildConclusionMessages, buildFallbackConclusion } from './prompt';
import type {
  AgentConclusionSource,
  AgentPlanComparison,
  AgentPlan,
  AgentPlanGroupBy,
  AgentPlanMetric,
  AgentPlanTimeRange,
  AgentRunRequest,
  AgentRunResult,
  AgentRunStatus,
  AgentRunStep,
  AgentToolInvocationResult,
} from './types';

function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createToolInvocationId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Agent Run 执行失败';
}

function stringifySummary(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);

  if (text.length <= 180) {
    return text;
  }

  return `${text.slice(0, 180)}...`;
}

function createStep(id: string, title: string): AgentRunStep {
  return {
    id,
    title,
    status: 'pending',
  };
}

function setStep(
  steps: AgentRunStep[],
  stepId: string,
  status: AgentRunStep['status'],
  options?: {
    description?: string;
    elapsedMs?: number;
  }
): void {
  const step = steps.find((item) => item.id === stepId);

  if (!step) {
    return;
  }

  step.status = status;

  if (options?.description !== undefined) {
    step.description = options.description;
  }

  if (options?.elapsedMs !== undefined) {
    step.elapsedMs = options.elapsedMs;
  }
}

function getMetricLabel(metric: AgentPlanMetric): string {
  const metricLabelMap: Record<AgentPlanMetric, string> = {
    avg_score: '平均分',
    attendance_rate: '出勤率',
    homework_completion_rate: '作业完成率',
    abnormal_count: '异常指标',
  };

  return metricLabelMap[metric];
}

function getPlanTimeRange(plan: AgentPlan): AgentPlanTimeRange {
  return plan.timeRange ?? { type: 'none' };
}

function getPlanComparison(plan: AgentPlan): AgentPlanComparison {
  return plan.comparison ?? 'none';
}

function getTimeRangeLabel(timeRange: AgentPlanTimeRange): string {
  if (timeRange.type === 'month' || timeRange.type === 'latest_available_month') {
    return timeRange.label;
  }

  return '未指定';
}

function getEffectiveGroupBy(plan: AgentPlan, requestedGroupBy: AgentPlanGroupBy): AgentPlanGroupBy {
  const timeRange = getPlanTimeRange(plan);

  if (getPlanComparison(plan) === 'previous_month' && timeRange.type === 'month') {
    return 'metric_month';
  }

  return requestedGroupBy;
}

function buildChartTitle(params: {
  metric: AgentPlanMetric;
  groupBy: AgentPlanGroupBy;
  timeRange: AgentPlanTimeRange;
  comparison: AgentPlanComparison;
}): string {
  const metricLabel = getMetricLabel(params.metric);
  const timeRangeLabel = getTimeRangeLabel(params.timeRange);
  const timePrefix = timeRangeLabel === '未指定' ? '' : timeRangeLabel;
  const comparisonText = params.comparison === 'previous_month' && timePrefix ? '及上月' : '';
  const suffix = params.groupBy === 'metric_month' ? '趋势分析' : '分布分析';

  return `${timePrefix}${comparisonText}${metricLabel}${suffix}` || `${metricLabel}${suffix}`;
}

function buildAggregateOutputSummary(params: {
  rowCount: number;
  timeRangeLabel: string;
}): string {
  if (params.rowCount === 0) {
    return params.timeRangeLabel === '未指定'
      ? '未找到可聚合的数据。'
      : `在 ${params.timeRangeLabel} 时间范围内未找到可聚合的数据。`;
  }

  return params.timeRangeLabel === '未指定'
    ? `返回 ${params.rowCount} 条聚合结果`
    : `在 ${params.timeRangeLabel} 时间范围内返回 ${params.rowCount} 条聚合结果`;
}

function buildNonAnalysisResult(params: {
  runId: string;
  runStart: number;
  createdAt: string;
  request: AgentRunRequest;
  plan: AgentPlan;
  conclusion: string;
  routeTitle: string;
  routeDescription: string;
  replyTitle: string;
}): AgentRunResult {
  const now = Date.now();
  const stepIntent = createStep('step_intent', '理解用户问题');
  const stepRoute = createStep('step_route', params.routeTitle);
  const stepReply = createStep('step_reply', params.replyTitle);

  const steps = [stepIntent, stepRoute, stepReply];

  setStep(steps, 'step_intent', 'success', {
    description: `intent=${params.plan.intent}，reason=${params.plan.reason}`,
    elapsedMs: Math.max(1, Math.floor((now - params.runStart) / 3)),
  });
  setStep(steps, 'step_route', 'success', {
    description: params.routeDescription,
    elapsedMs: Math.max(1, Math.floor((now - params.runStart) / 3)),
  });
  setStep(steps, 'step_reply', 'success', {
    description: '已生成说明回复。',
    elapsedMs: Math.max(1, Math.floor((now - params.runStart) / 3)),
  });

  const status: AgentRunStatus = 'success';

  return {
    id: params.runId,
    status,
    prompt: params.request.prompt,
    provider: params.request.provider,
    plan: params.plan,
    steps,
    toolInvocations: [],
    conclusion: params.conclusion,
    conclusionSource: 'fallback',
    createdAt: params.createdAt,
    elapsedMs: Date.now() - params.runStart,
  };
}

export async function runAgent(request: AgentRunRequest): Promise<AgentRunResult> {
  const runId = createRunId();
  const runStart = Date.now();
  const createdAt = new Date(runStart).toISOString();

  ensureServerEnvLoaded();
  const apiKey = request.apiKey?.trim() || process.env.GROQ_API_KEY?.trim() || '';
  const plan = await planAgentRun({
    prompt: request.prompt,
    apiKey: apiKey || undefined,
  });

  if (plan.intent === 'capability_intro') {
    return buildNonAnalysisResult({
      runId,
      runStart,
      createdAt,
      request,
      plan,
      conclusion: createCapabilityIntroConclusion(),
      routeTitle: '判断无需进入数据分析流程',
      routeDescription: '当前请求属于能力说明类问题，不访问数据源。',
      replyTitle: '生成能力说明',
    });
  }

  if (plan.intent === 'unsupported') {
    return buildNonAnalysisResult({
      runId,
      runStart,
      createdAt,
      request,
      plan,
      conclusion: createUnsupportedConclusion(),
      routeTitle: '判断当前暂不支持',
      routeDescription: '当前请求不属于教育数据分析工作台支持范围。',
      replyTitle: '生成说明',
    });
  }

  const steps: AgentRunStep[] = [
    createStep('step_create_run', '创建 Run'),
    createStep('step_intent', '理解用户问题'),
    createStep('step_schema', '读取数据源 Schema'),
    createStep('step_aggregate', '执行受控聚合工具'),
    createStep('step_chart', '生成图表数据'),
    createStep('step_conclusion', '生成最终回复'),
  ];

  const toolInvocations: AgentToolInvocationResult[] = [];
  const context: ServerToolContext = {
    provider: request.provider,
  };

  let schemaResult: SchemaInspectOutput;
  let aggregateResult: AggregateTableOutput;
  let chartResult: ChartRenderOutput;

  try {
    setStep(steps, 'step_create_run', 'running');
    setStep(steps, 'step_create_run', 'success', {
      description: `Run ID: ${runId}`,
      elapsedMs: Date.now() - runStart,
    });

    const metric = plan.metric ?? 'abnormal_count';
    const requestedGroupBy = plan.groupBy ?? 'subject';
    const groupBy = getEffectiveGroupBy(plan, requestedGroupBy);
    const timeRange = getPlanTimeRange(plan);
    const comparison = getPlanComparison(plan);
    const timeRangeLabel = getTimeRangeLabel(timeRange);

    const intentStart = Date.now();
    setStep(steps, 'step_intent', 'running');
    setStep(steps, 'step_intent', 'success', {
      description: `intent=${plan.intent}, metric=${metric}, groupBy=${groupBy}, timeRange=${timeRangeLabel}, comparison=${comparison}`,
      elapsedMs: Date.now() - intentStart,
    });

    const schemaStart = Date.now();
    setStep(steps, 'step_schema', 'running');
    const schemaInput: SchemaInspectInput = {
      includeColumns: true,
    };

    schemaResult = await serverToolRegistry.schema_inspect.execute(schemaInput, context);

    toolInvocations.push({
      id: createToolInvocationId(),
      toolId: 'schema_inspect',
      toolName: serverToolRegistry.schema_inspect.name,
      status: 'success',
      inputSummary: stringifySummary(schemaInput),
      outputSummary: `读取 ${schemaResult.tableCount} 张表`,
      elapsedMs: Date.now() - schemaStart,
    });

    setStep(steps, 'step_schema', 'success', {
      description: `Schema=${schemaResult.schemas.join(', ') || 'public'}，表数量=${schemaResult.tableCount}`,
      elapsedMs: Date.now() - schemaStart,
    });

    const aggregateStart = Date.now();
    setStep(steps, 'step_aggregate', 'running');
    const aggregateInput: AggregateTableInput = {
      metric,
      groupBy,
      limit: 20,
      timeRange,
      comparison,
    };

    aggregateResult = await serverToolRegistry.aggregate_table.execute(aggregateInput, context);
    const aggregateTimeRangeLabel = aggregateResult.timeRangeLabel ?? timeRangeLabel;
    const aggregateOutputSummary = buildAggregateOutputSummary({
      rowCount: aggregateResult.rowCount,
      timeRangeLabel: aggregateTimeRangeLabel,
    });

    toolInvocations.push({
      id: createToolInvocationId(),
      toolId: 'aggregate_table',
      toolName: serverToolRegistry.aggregate_table.name,
      status: 'success',
      inputSummary: stringifySummary(aggregateInput),
      outputSummary: aggregateOutputSummary,
      elapsedMs: Date.now() - aggregateStart,
    });

    setStep(steps, 'step_aggregate', 'success', {
      description: `${aggregateOutputSummary}，metric=${metric}，groupBy=${groupBy}`,
      elapsedMs: Date.now() - aggregateStart,
    });

    if (aggregateResult.rowCount === 0) {
      const conclusionStart = Date.now();
      setStep(steps, 'step_chart', 'success', {
        description: '指定时间范围内无聚合结果，未生成图表数据。',
        elapsedMs: 0,
      });
      setStep(steps, 'step_conclusion', 'running');

      const emptyChartResult: ChartRenderOutput = {
        title: buildChartTitle({
          metric,
          groupBy,
          timeRange,
          comparison,
        }),
        chartType: 'bar',
        labels: [],
        values: [],
        summary: aggregateOutputSummary,
      };
      const conclusion = buildFallbackConclusion({
        intent: {
          metric,
          groupBy,
          timeRange,
          comparison,
        },
        chartResult: emptyChartResult,
      });

      setStep(steps, 'step_conclusion', 'success', {
        description: '指定时间范围内无数据，已生成数据不足说明。',
        elapsedMs: Date.now() - conclusionStart,
      });

      return {
        id: runId,
        status: 'success',
        prompt: request.prompt,
        provider: request.provider,
        plan: {
          ...plan,
          metric,
          groupBy,
          timeRange,
          comparison,
        },
        steps,
        toolInvocations,
        conclusion,
        conclusionSource: 'fallback',
        conclusionNotice: '指定时间范围内未找到可聚合的数据，当前结论由本地工具结果摘要生成。',
        createdAt,
        elapsedMs: Date.now() - runStart,
      };
    }

    const chartStart = Date.now();
    setStep(steps, 'step_chart', 'running');

    const chartInput: ChartRenderInput = {
      title: buildChartTitle({
        metric,
        groupBy,
        timeRange,
        comparison,
      }),
      chartType: 'bar',
      labelKey: 'dimension',
      valueKey: 'value',
      rows: aggregateResult.rows,
    };

    chartResult = await serverToolRegistry.chart_render.execute(chartInput, context);

    toolInvocations.push({
      id: createToolInvocationId(),
      toolId: 'chart_render',
      toolName: serverToolRegistry.chart_render.name,
      status: 'success',
      inputSummary: stringifySummary({
        title: chartInput.title,
        chartType: chartInput.chartType,
        labelKey: chartInput.labelKey,
        valueKey: chartInput.valueKey,
        rowCount: chartInput.rows.length,
      }),
      outputSummary: chartResult.summary,
      elapsedMs: Date.now() - chartStart,
    });

    setStep(steps, 'step_chart', 'success', {
      description: chartResult.summary,
      elapsedMs: Date.now() - chartStart,
    });

    const conclusionStart = Date.now();
    setStep(steps, 'step_conclusion', 'running');

    let conclusion = '';
    let conclusionSource: AgentConclusionSource = 'fallback';
    let conclusionNotice: string | undefined;

    if (!apiKey) {
      conclusion = buildFallbackConclusion({
        intent: {
          metric,
          groupBy,
          timeRange,
          comparison,
        },
        chartResult,
      });
      conclusionSource = 'fallback';
      conclusionNotice = '未配置 Groq API Key，当前结论由本地工具结果摘要生成。';

      setStep(steps, 'step_conclusion', 'success', {
        description: '未配置 Groq Key，已回退本地摘要结论。',
        elapsedMs: Date.now() - conclusionStart,
      });
    } else {
      try {
        const messages = buildConclusionMessages({
          prompt: request.prompt,
          intent: {
            metric,
            groupBy,
            timeRange,
            comparison,
          },
          schemaResult,
          aggregateResult,
          chartResult,
        });

        const modelResult = await generateTextWithModelGateway({
          provider: 'groq',
          apiKey,
          messages,
          temperature: 0.2,
        });
        conclusion = modelResult.text;
        conclusionSource = 'model';
        conclusionNotice = undefined;

        setStep(steps, 'step_conclusion', 'success', {
          description: 'Groq 已生成最终结论。',
          elapsedMs: Date.now() - conclusionStart,
        });
      } catch {
        conclusion = buildFallbackConclusion({
          intent: {
            metric,
            groupBy,
            timeRange,
            comparison,
          },
          chartResult,
        });
        conclusionSource = 'fallback';
        conclusionNotice = '模型生成失败，当前结论由本地工具结果摘要生成。';

        setStep(steps, 'step_conclusion', 'success', {
          description: 'Groq 不可用，已回退到工具结果摘要。',
          elapsedMs: Date.now() - conclusionStart,
        });
      }
    }

    const status: AgentRunStatus = 'success';

    return {
      id: runId,
      status,
      prompt: request.prompt,
      provider: request.provider,
      plan: {
        ...plan,
        metric,
        groupBy,
        timeRange,
        comparison,
      },
      steps,
      toolInvocations,
      chartData: {
        title: chartResult.title,
        chartType: chartResult.chartType,
        labels: chartResult.labels,
        values: chartResult.values,
        summary: chartResult.summary,
      },
      conclusion,
      conclusionSource,
      conclusionNotice,
      createdAt,
      elapsedMs: Date.now() - runStart,
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const runningStep = steps.find((step) => step.status === 'running');

    if (runningStep) {
      runningStep.status = 'error';
      runningStep.description = errorMessage;
      runningStep.elapsedMs = Date.now() - runStart;
    }

    throw new Error(errorMessage, { cause: error });
  }
}
