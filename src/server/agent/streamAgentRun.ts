/// <reference types="node" />

import { ensureServerEnvLoaded } from '../datasources/connection';
import { streamTextWithModelGateway } from '../models/modelGateway';
import type { AggregateTableInput, AggregateTableOutput } from '../tools/aggregateTableTool';
import type { ChartRenderInput, ChartRenderOutput } from '../tools/chartRenderTool';
import { serverToolRegistry } from '../tools/registry';
import type { SchemaInspectInput, SchemaInspectOutput } from '../tools/schemaInspectTool';
import type { ServerToolContext } from '../tools/types';
import type { RunChartData, RunEvent, RunIntent, RunSnapshot, RunStep, RunToolInvocation } from '../../types/run';
import { createCapabilityIntroConclusion, createUnsupportedConclusion } from './capabilityReply';
import { planAgentRun } from './planner';
import { buildConclusionMessages, buildFallbackConclusion } from './prompt';
import type {
  AgentConclusionSource,
  AgentPlan,
  AgentPlanComparison,
  AgentPlanGroupBy,
  AgentPlanMetric,
  AgentPlanTimeRange,
} from './types';

type AgentProvider = 'postgresql' | 'supabase';

function createRunId(): string {
  return `run_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createDataSourceSnapshot(provider: AgentProvider): RunSnapshot['dataSource'] {
  return {
    provider,
    name: provider === 'supabase' ? 'Supabase / Agent Run' : 'PostgreSQL / Agent Run',
    typeLabel: provider === 'supabase' ? 'Supabase 托管 PostgreSQL' : 'PostgreSQL',
    schema: 'public',
  };
}

function createBaseRun(params: {
  runId: string;
  prompt: string;
  provider: AgentProvider;
  createdAt: string;
  plan?: AgentPlan;
  steps?: RunStep[];
}): RunSnapshot {
  const intent: RunIntent = params.plan?.intent ?? 'unknown';

  return {
    id: params.runId,
    mode: 'agent',
    status: 'running',
    intent,
    prompt: params.prompt,
    plan: params.plan
      ? {
          intent,
          shouldUseDataAnalysis: params.plan.shouldUseDataAnalysis,
          reason: params.plan.reason,
          metric: params.plan.metric,
          groupBy: params.plan.groupBy,
          timeRangeLabel: params.plan.timeRange?.label,
          comparison: params.plan.comparison,
        }
      : {
          intent: 'unknown',
          shouldUseDataAnalysis: false,
          reason: '正在判断任务类型',
        },
    dataSource: createDataSourceSnapshot(params.provider),
    steps: params.steps ?? [],
    toolInvocations: [],
    conclusion: '',
    conclusionSource: 'none',
    reportState: 'hidden',
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    startedAt: params.createdAt,
  };
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

function getTimeRangeLabel(timeRange: AgentPlanTimeRange): string {
  if (timeRange.type === 'month' || timeRange.type === 'latest_available_month') {
    return timeRange.label;
  }

  return '未指定';
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

function stringifySummary(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);

  if (text.length <= 180) {
    return text;
  }

  return `${text.slice(0, 180)}...`;
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

function createRunStep(id: string, title: string, status: RunStep['status'], description?: string): RunStep {
  const timestamp = nowIso();

  return {
    id,
    title,
    description,
    status,
    startedAt: timestamp,
    completedAt: status === 'success' ? timestamp : undefined,
  };
}

function createTool(params: {
  id: string;
  displayName: string;
  inputSummary: string;
}): RunToolInvocation {
  return {
    id: params.id,
    toolId: params.id,
    toolName: params.id,
    displayName: params.displayName,
    status: 'running',
    inputSummary: params.inputSummary,
    outputSummary: '',
    startedAt: nowIso(),
  };
}

function toRunChartData(chartResult: ChartRenderOutput): RunChartData {
  return {
    title: chartResult.title,
    chartType: chartResult.chartType,
    labels: chartResult.labels,
    series: [
      {
        name: chartResult.title || '指标值',
        values: chartResult.values,
      },
    ],
    summary: chartResult.summary,
  };
}

function splitTextIntoDeltas(text: string): string[] {
  const deltas: string[] = [];
  let buffer = '';

  for (const char of text) {
    buffer += char;

    if (buffer.length >= 18 || /[。！？\n]/.test(char)) {
      deltas.push(buffer);
      buffer = '';
    }
  }

  if (buffer) {
    deltas.push(buffer);
  }

  return deltas;
}

async function emitTextDeltas(params: {
  runId: string;
  text: string;
  emit: (event: RunEvent) => void;
}): Promise<void> {
  for (const delta of splitTextIntoDeltas(params.text)) {
    params.emit({
      type: 'conclusion_delta',
      runId: params.runId,
      delta,
    });
  }
}

function emitConclusionCompleted(params: {
  runId: string;
  conclusion: string;
  conclusionSource: AgentConclusionSource;
  conclusionNotice?: string;
  emit: (event: RunEvent) => void;
}): void {
  params.emit({
    type: 'conclusion_completed',
    runId: params.runId,
    conclusion: params.conclusion,
    conclusionSource: params.conclusionSource,
    conclusionNotice: params.conclusionNotice,
  });
}

async function streamStaticConclusion(params: {
  runId: string;
  conclusion: string;
  conclusionSource: AgentConclusionSource;
  conclusionNotice?: string;
  emit: (event: RunEvent) => void;
}): Promise<void> {
  await emitTextDeltas({
    runId: params.runId,
    text: params.conclusion,
    emit: params.emit,
  });
  emitConclusionCompleted(params);
}

async function streamNonAnalysisRun(params: {
  runId: string;
  runStart: number;
  conclusion: string;
  conclusionStepTitle: string;
  routeStepTitle: string;
  routeStepDescription: string;
  emit: (event: RunEvent) => void;
}): Promise<void> {
  const routeStart = nowIso();
  params.emit({
    type: 'step_started',
    runId: params.runId,
    stepId: 'step_route',
    title: params.routeStepTitle,
    description: params.routeStepDescription,
    startedAt: routeStart,
  });
  params.emit({
    type: 'step_completed',
    runId: params.runId,
    stepId: 'step_route',
    completedAt: nowIso(),
    elapsedMs: 1,
  });

  const conclusionStart = nowIso();
  params.emit({
    type: 'step_started',
    runId: params.runId,
    stepId: 'step_reply',
    title: params.conclusionStepTitle,
    description: '正在生成说明回复。',
    startedAt: conclusionStart,
  });
  await streamStaticConclusion({
    runId: params.runId,
    conclusion: params.conclusion,
    conclusionSource: 'fallback',
    emit: params.emit,
  });
  params.emit({
    type: 'step_completed',
    runId: params.runId,
    stepId: 'step_reply',
    completedAt: nowIso(),
    elapsedMs: Date.now() - params.runStart,
  });
}

export async function streamAgentRun(params: {
  prompt: string;
  provider: AgentProvider;
  clientRunId?: string;
  emit: (event: RunEvent) => void;
}): Promise<void> {
  const runId = params.clientRunId?.trim() || createRunId();
  const runStart = Date.now();
  const createdAt = new Date(runStart).toISOString();

  params.emit({
    type: 'run_started',
    run: createBaseRun({
      runId,
      prompt: params.prompt,
      provider: params.provider,
      createdAt,
    }),
  });

  try {
    ensureServerEnvLoaded();
    const apiKey = process.env.GROQ_API_KEY?.trim() || '';
    const context: ServerToolContext = {
      provider: params.provider,
    };

    const plannerStartedAt = nowIso();
    params.emit({
      type: 'step_started',
      runId,
      stepId: 'step_intent',
      title: '理解用户问题',
      description: '正在判断用户意图、分析目标和是否需要访问数据源。',
      startedAt: plannerStartedAt,
    });

    const plan = await planAgentRun({
      prompt: params.prompt,
      apiKey: apiKey || undefined,
    });

    params.emit({
      type: 'step_completed',
      runId,
      stepId: 'step_intent',
      completedAt: nowIso(),
      elapsedMs: Date.now() - runStart,
    });
    params.emit({
      type: 'run_started',
      run: createBaseRun({
        runId,
        prompt: params.prompt,
        provider: params.provider,
        createdAt,
        plan,
        steps: [
          createRunStep('step_intent', '理解用户问题', 'success', `intent=${plan.intent}，reason=${plan.reason}`),
        ],
      }),
    });

    if (plan.intent === 'capability_intro') {
      await streamNonAnalysisRun({
        runId,
        runStart,
        conclusion: createCapabilityIntroConclusion(),
        routeStepTitle: '判断无需进入数据分析流程',
        routeStepDescription: '当前请求属于能力说明类问题，不访问数据源。',
        conclusionStepTitle: '生成能力说明',
        emit: params.emit,
      });
      params.emit({
        type: 'run_completed',
        runId,
        completedAt: nowIso(),
        elapsedMs: Date.now() - runStart,
      });
      return;
    }

    if (plan.intent === 'unsupported') {
      await streamNonAnalysisRun({
        runId,
        runStart,
        conclusion: createUnsupportedConclusion(),
        routeStepTitle: '判断当前暂不支持',
        routeStepDescription: '当前请求不属于教育数据分析工作台支持范围。',
        conclusionStepTitle: '生成说明',
        emit: params.emit,
      });
      params.emit({
        type: 'run_completed',
        runId,
        completedAt: nowIso(),
        elapsedMs: Date.now() - runStart,
      });
      return;
    }

    const metric = plan.metric ?? 'abnormal_count';
    const requestedGroupBy = plan.groupBy ?? 'subject';
    const timeRange = plan.timeRange ?? { type: 'none' };
    const comparison = plan.comparison ?? 'none';
    const groupBy = comparison === 'previous_month' && timeRange.type === 'month' ? 'metric_month' : requestedGroupBy;
    const timeRangeLabel = getTimeRangeLabel(timeRange);

    const schemaStartedAt = Date.now();
    params.emit({
      type: 'step_started',
      runId,
      stepId: 'step_schema',
      title: '读取数据源 Schema',
      description: '通过 schema_inspect 读取允许访问的表和字段。',
      startedAt: new Date(schemaStartedAt).toISOString(),
    });
    const schemaInput: SchemaInspectInput = { includeColumns: true };
    const schemaTool = createTool({
      id: 'schema_inspect',
      displayName: '数据源结构读取',
      inputSummary: stringifySummary(schemaInput),
    });
    params.emit({ type: 'tool_started', runId, tool: schemaTool });
    const schemaResult: SchemaInspectOutput = await serverToolRegistry.schema_inspect.execute(schemaInput, context);
    const schemaOutputSummary = `读取 ${schemaResult.tableCount} 张表`;
    params.emit({
      type: 'tool_completed',
      runId,
      toolId: schemaTool.id,
      outputSummary: schemaOutputSummary,
      completedAt: nowIso(),
      elapsedMs: Date.now() - schemaStartedAt,
    });
    params.emit({
      type: 'step_completed',
      runId,
      stepId: 'step_schema',
      completedAt: nowIso(),
      elapsedMs: Date.now() - schemaStartedAt,
    });

    const aggregateStartedAt = Date.now();
    params.emit({
      type: 'step_started',
      runId,
      stepId: 'step_aggregate',
      title: '执行受控查询工具',
      description: `metric=${metric}，groupBy=${groupBy}，timeRange=${timeRangeLabel}，comparison=${comparison}`,
      startedAt: new Date(aggregateStartedAt).toISOString(),
    });
    const aggregateInput: AggregateTableInput = {
      metric,
      groupBy,
      limit: 20,
      timeRange,
      comparison,
    };
    const aggregateTool = createTool({
      id: 'aggregate_table',
      displayName: '数据聚合分析',
      inputSummary: stringifySummary(aggregateInput),
    });
    params.emit({ type: 'tool_started', runId, tool: aggregateTool });
    const aggregateResult: AggregateTableOutput = await serverToolRegistry.aggregate_table.execute(aggregateInput, context);
    const aggregateTimeRangeLabel = aggregateResult.timeRangeLabel ?? timeRangeLabel;
    const aggregateOutputSummary = buildAggregateOutputSummary({
      rowCount: aggregateResult.rowCount,
      timeRangeLabel: aggregateTimeRangeLabel,
    });
    params.emit({
      type: 'tool_completed',
      runId,
      toolId: aggregateTool.id,
      outputSummary: aggregateOutputSummary,
      completedAt: nowIso(),
      elapsedMs: Date.now() - aggregateStartedAt,
    });
    params.emit({
      type: 'step_completed',
      runId,
      stepId: 'step_aggregate',
      completedAt: nowIso(),
      elapsedMs: Date.now() - aggregateStartedAt,
    });

    const chartStartedAt = Date.now();
    params.emit({
      type: 'step_started',
      runId,
      stepId: 'step_chart',
      title: '生成图表数据',
      description: '通过 chart_render 生成统一图表数据结构。',
      startedAt: new Date(chartStartedAt).toISOString(),
    });
    const chartInput: ChartRenderInput = {
      title: buildChartTitle({ metric, groupBy, timeRange, comparison }),
      chartType: 'bar',
      labelKey: 'dimension',
      valueKey: 'value',
      rows: aggregateResult.rows,
    };
    const chartTool = createTool({
      id: 'chart_render',
      displayName: '图表数据生成',
      inputSummary: stringifySummary({
        title: chartInput.title,
        chartType: chartInput.chartType,
        labelKey: chartInput.labelKey,
        valueKey: chartInput.valueKey,
        rowCount: chartInput.rows.length,
      }),
    });
    params.emit({ type: 'tool_started', runId, tool: chartTool });
    const chartResult: ChartRenderOutput = await serverToolRegistry.chart_render.execute(chartInput, context);
    params.emit({
      type: 'tool_completed',
      runId,
      toolId: chartTool.id,
      outputSummary: chartResult.summary,
      completedAt: nowIso(),
      elapsedMs: Date.now() - chartStartedAt,
    });
    params.emit({
      type: 'chart_ready',
      runId,
      chartData: toRunChartData(chartResult),
    });
    params.emit({
      type: 'step_completed',
      runId,
      stepId: 'step_chart',
      completedAt: nowIso(),
      elapsedMs: Date.now() - chartStartedAt,
    });

    const conclusionStartedAt = Date.now();
    params.emit({
      type: 'step_started',
      runId,
      stepId: 'step_conclusion',
      title: '生成最终回复',
      description: '基于工具结果生成最终分析结论。',
      startedAt: new Date(conclusionStartedAt).toISOString(),
    });

    const intent = { metric, groupBy, timeRange, comparison };
    let conclusionSource: AgentConclusionSource = 'fallback';
    let conclusionNotice: string | undefined;
    let conclusion = '';

    if (aggregateResult.rowCount === 0) {
      conclusion = buildFallbackConclusion({ intent, chartResult });
      conclusionNotice = '指定时间范围内未找到可聚合的数据，当前结论由本地工具结果摘要生成。';
      await streamStaticConclusion({
        runId,
        conclusion,
        conclusionSource,
        conclusionNotice,
        emit: params.emit,
      });
    } else if (!apiKey) {
      conclusion = buildFallbackConclusion({ intent, chartResult });
      conclusionNotice = '未配置 Groq API Key，当前结论由本地工具结果摘要生成。';
      await streamStaticConclusion({
        runId,
        conclusion,
        conclusionSource,
        conclusionNotice,
        emit: params.emit,
      });
    } else {
      try {
        const messages = buildConclusionMessages({
          prompt: params.prompt,
          intent,
          schemaResult,
          aggregateResult,
          chartResult,
        });
        const modelResult = await streamTextWithModelGateway({
          provider: 'groq',
          apiKey,
          messages,
          temperature: 0.2,
          onDelta: (delta) => {
            params.emit({ type: 'conclusion_delta', runId, delta });
          },
        });
        conclusion = modelResult.text;

        if (!conclusion.trim()) {
          throw new Error('Empty Groq stream conclusion');
        }

        conclusionSource = 'model';
        emitConclusionCompleted({
          runId,
          conclusion,
          conclusionSource,
          emit: params.emit,
        });
      } catch {
        conclusion = buildFallbackConclusion({ intent, chartResult });
        conclusionSource = 'fallback';
        conclusionNotice = '模型生成失败，当前结论由本地工具结果摘要生成。';
        await streamStaticConclusion({
          runId,
          conclusion,
          conclusionSource,
          conclusionNotice,
          emit: params.emit,
        });
      }
    }

    params.emit({
      type: 'step_completed',
      runId,
      stepId: 'step_conclusion',
      completedAt: nowIso(),
      elapsedMs: Date.now() - conclusionStartedAt,
    });

    if (conclusion.trim()) {
      params.emit({ type: 'report_pending', runId });
    }

    params.emit({
      type: 'run_completed',
      runId,
      completedAt: nowIso(),
      elapsedMs: Date.now() - runStart,
    });
  } catch {
    params.emit({
      type: 'run_failed',
      runId,
      errorMessage: 'Agent Run 执行失败，请检查数据源或模型配置。',
    });
  }
}
