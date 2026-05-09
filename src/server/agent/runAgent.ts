/// <reference types="node" />

import { ensureServerEnvLoaded } from '../datasources/connection';
import type { AggregateTableInput, AggregateTableOutput } from '../tools/aggregateTableTool';
import type { ChartRenderInput, ChartRenderOutput } from '../tools/chartRenderTool';
import { serverToolRegistry } from '../tools/registry';
import type { SchemaInspectInput, SchemaInspectOutput } from '../tools/schemaInspectTool';
import type { ServerToolContext } from '../tools/types';
import { buildConclusionMessages, buildFallbackConclusion } from './prompt';
import { detectSimpleIntent } from './intent';
import type {
  AgentRunRequest,
  AgentRunResult,
  AgentRunStep,
  AgentToolInvocationResult,
  AgentConclusionSource,
  AgentRunStatus,
} from './types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

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

async function callGroqConclusion(params: {
  apiKey: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: params.messages,
      temperature: 0.2,
      max_tokens: 600,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error('Groq request failed');
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Empty Groq response');
  }

  return content;
}

export async function runAgent(request: AgentRunRequest): Promise<AgentRunResult> {
  const runId = createRunId();
  const runStart = Date.now();
  const createdAt = new Date(runStart).toISOString();

  const steps: AgentRunStep[] = [
    { id: 'step_create_run', title: '创建 Run', status: 'pending' },
    { id: 'step_schema', title: '读取数据源 Schema', status: 'pending' },
    { id: 'step_intent', title: '理解用户问题', status: 'pending' },
    { id: 'step_aggregate', title: '执行受控聚合工具', status: 'pending' },
    { id: 'step_chart', title: '生成图表数据', status: 'pending' },
    { id: 'step_conclusion', title: '生成最终回复', status: 'pending' },
  ];

  const toolInvocations: AgentToolInvocationResult[] = [];

  const setStep = (
    stepId: AgentRunStep['id'],
    status: AgentRunStep['status'],
    options?: {
      description?: string;
      elapsedMs?: number;
    }
  ) => {
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
  };

  const context: ServerToolContext = {
    provider: request.provider,
  };

  let schemaResult: SchemaInspectOutput;
  let aggregateResult: AggregateTableOutput;
  let chartResult: ChartRenderOutput;

  try {
    setStep('step_create_run', 'running');
    setStep('step_create_run', 'success', {
      description: `Run ID: ${runId}`,
      elapsedMs: Date.now() - runStart,
    });

    const schemaStart = Date.now();
    setStep('step_schema', 'running');
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

    setStep('step_schema', 'success', {
      description: `Schema=${schemaResult.schemas.join(', ') || 'public'}，表数量=${schemaResult.tableCount}`,
      elapsedMs: Date.now() - schemaStart,
    });

    const intentStart = Date.now();
    setStep('step_intent', 'running');
    const intent = detectSimpleIntent(request.prompt);
    setStep('step_intent', 'success', {
      description: `metric=${intent.metric}, groupBy=${intent.groupBy}`,
      elapsedMs: Date.now() - intentStart,
    });

    const aggregateStart = Date.now();
    setStep('step_aggregate', 'running');
    const aggregateInput: AggregateTableInput = {
      metric: intent.metric,
      groupBy: intent.groupBy,
      limit: 20,
    };

    aggregateResult = await serverToolRegistry.aggregate_table.execute(aggregateInput, context);

    toolInvocations.push({
      id: createToolInvocationId(),
      toolId: 'aggregate_table',
      toolName: serverToolRegistry.aggregate_table.name,
      status: 'success',
      inputSummary: stringifySummary(aggregateInput),
      outputSummary: `返回 ${aggregateResult.rowCount} 条聚合结果`,
      elapsedMs: Date.now() - aggregateStart,
    });

    setStep('step_aggregate', 'success', {
      description: `聚合结果条数=${aggregateResult.rowCount}`,
      elapsedMs: Date.now() - aggregateStart,
    });

    const chartStart = Date.now();
    setStep('step_chart', 'running');

    const chartInput: ChartRenderInput = {
      title: intent.groupBy === 'metric_month' ? '按月份趋势分析' : '按学科分布分析',
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

    setStep('step_chart', 'success', {
      description: chartResult.summary,
      elapsedMs: Date.now() - chartStart,
    });

    const conclusionStart = Date.now();
    setStep('step_conclusion', 'running');

    ensureServerEnvLoaded();
    const apiKey = request.apiKey?.trim() || process.env.GROQ_API_KEY?.trim() || '';
    let conclusion = '';
    let conclusionSource: AgentConclusionSource = 'fallback';
    let conclusionNotice: string | undefined;

    if (!apiKey) {
      conclusion = buildFallbackConclusion({
        intent,
        chartResult,
      });
      conclusionSource = 'fallback';
      conclusionNotice = '未配置 Groq API Key，当前结论由本地工具结果摘要生成。';

      setStep('step_conclusion', 'success', {
        description: '未配置 Groq Key，已回退本地摘要结论。',
        elapsedMs: Date.now() - conclusionStart,
      });
    } else {
      try {
        const messages = buildConclusionMessages({
          prompt: request.prompt,
          intent,
          schemaResult,
          aggregateResult,
          chartResult,
        });

        conclusion = await callGroqConclusion({
          apiKey,
          messages,
        });
        conclusionSource = 'model';
        conclusionNotice = undefined;

        setStep('step_conclusion', 'success', {
          description: 'Groq 已生成最终结论。',
          elapsedMs: Date.now() - conclusionStart,
        });
      } catch {
        conclusion = buildFallbackConclusion({
          intent,
          chartResult,
        });
        conclusionSource = 'fallback';
        conclusionNotice = '模型生成失败，当前结论由本地工具结果摘要生成。';

        setStep('step_conclusion', 'success', {
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

    throw new Error(errorMessage);
  }
}
