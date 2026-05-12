/// <reference types="node" />

import type { SchemaInspectOutput } from '../tools/schemaInspectTool';
import type { AggregateTableOutput } from '../tools/aggregateTableTool';
import type { ChartRenderOutput } from '../tools/chartRenderTool';
import type { RagSearchOutput } from '../tools/ragSearchTool';
import type { AgentPlanComparison, AgentPlanGroupBy, AgentPlanMetric, AgentPlanTimeRange } from './types';

interface DataAnalysisPlanFields {
  metric: AgentPlanMetric;
  groupBy: AgentPlanGroupBy;
  timeRange?: AgentPlanTimeRange;
  comparison?: AgentPlanComparison;
}

interface AgentPromptContext {
  prompt: string;
  intent: DataAnalysisPlanFields;
  schemaResult: SchemaInspectOutput;
  aggregateResult: AggregateTableOutput;
  chartResult: ChartRenderOutput;
}

function summarizeSchema(result: SchemaInspectOutput): string {
  const tableNames = result.tables.slice(0, 5).map((table) => table.tableName).join(', ');
  return `schemas=${result.schemas.join(', ') || 'public'}; tableCount=${result.tableCount}; tables=${tableNames || '-'};`;
}

function summarizeAggregate(result: AggregateTableOutput): string {
  const preview = result.rows
    .slice(0, 5)
    .map((row) => JSON.stringify(row))
    .join('\n');

  return `rowCount=${result.rowCount}\nrows:\n${preview || '[]'}`;
}

function getTimeRangeLabel(intent: DataAnalysisPlanFields): string {
  if (intent.timeRange?.type === 'month' || intent.timeRange?.type === 'latest_available_month') {
    return intent.timeRange.label;
  }

  return '未指定';
}

export function buildConclusionMessages(context: AgentPromptContext): Array<{ role: 'system' | 'user'; content: string }> {
  const systemMessage =
    '你是一个教育数据分析助手。请基于工具结果输出简洁、可信的分析结论，不要编造工具结果中没有的数据。若数据不足请明确说明。不能引用工具结果以外的月份或指标代替。';

  const userMessage = [
    '【用户问题】',
    context.prompt,
    '',
    '【意图识别】',
    `metric=${context.intent.metric}, groupBy=${context.intent.groupBy}`,
    `timeRange=${getTimeRangeLabel(context.intent)}, comparison=${context.intent.comparison ?? 'none'}`,
    '',
    '【Schema 摘要】',
    summarizeSchema(context.schemaResult),
    '',
    '【聚合结果摘要】',
    summarizeAggregate(context.aggregateResult),
    '',
    '【图表摘要】',
    context.chartResult.summary,
    '',
    '【约束】',
    `用户指定的时间范围：${getTimeRangeLabel(context.intent)}`,
    `分析指标：${context.intent.metric}`,
    `分组维度：${context.intent.groupBy}`,
    '请只基于工具结果中符合该时间范围的数据生成结论。',
    '如果工具结果为空或数据不足，请明确说明，不能引用其他月份的数据代替。',
    '',
    '请输出：',
    '1) 关键发现',
    '2) 可能原因',
    '3) 下一步建议',
    '每部分 2-4 条，保持简洁。',
  ].join('\n');

  return [
    {
      role: 'system',
      content: systemMessage,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];
}

export function buildFallbackConclusion(params: {
  intent: DataAnalysisPlanFields;
  chartResult: ChartRenderOutput;
}): string {
  const metricNameMap: Record<AgentPlanMetric, string> = {
    avg_score: '平均分',
    attendance_rate: '出勤率',
    homework_completion_rate: '作业完成率',
    abnormal_count: '异常指标',
  };

  const groupByNameMap: Record<AgentPlanGroupBy, string> = {
    subject: '学科',
    metric_month: '月份',
  };

  const metricName = metricNameMap[params.intent.metric];
  const groupByName = groupByNameMap[params.intent.groupBy];
  const timeRangeLabel = getTimeRangeLabel(params.intent);
  const labels = params.chartResult.labels;
  const values = params.chartResult.values;

  if (labels.length === 0 || values.length === 0) {
    if (timeRangeLabel !== '未指定') {
      return [
        `当前数据源中未找到符合“${timeRangeLabel}”时间范围的数据，无法完成该时间范围下的分析。`,
        '本次不会使用其他月份的数据代替该时间范围。',
        '建议确认数据源是否已同步该月份数据，或调整时间范围后重新分析。',
      ].join('\n\n');
    }

    return [
      `本次分析已完成 ${metricName} 的工具执行流程，并按${groupByName}维度完成数据聚合。`,
      '已完成数据源读取和工具执行，但当前聚合结果不足以生成明确结论。',
      '建议补充更多样本或切换分析维度后再继续分析。',
    ].join('\n\n');
  }

  const maxIndex = values.reduce((maxIdx, currentValue, currentIndex, array) => {
    return currentValue > array[maxIdx] ? currentIndex : maxIdx;
  }, 0);
  const maxLabel = labels[maxIndex] ?? '当前维度';
  const maxValue = values[maxIndex];
  const topLabels = labels.slice(0, 3).join('、');

  return [
    `本次分析已基于真实数据源完成，并围绕“${metricName}”按${groupByName}维度执行了聚合分析${timeRangeLabel !== '未指定' ? `，时间范围为“${timeRangeLabel}”` : ''}。`,
    `从当前聚合结果看，${maxLabel}在该指标上最为突出（约 ${maxValue.toFixed(2)}），建议优先关注该维度并结合班级层级进一步排查。`,
    topLabels
      ? `当前结果主要覆盖：${topLabels}。建议下一步联动平均分、出勤率与作业完成率进行交叉对比，定位异常成因。`
      : '建议下一步联动平均分、出勤率与作业完成率进行交叉对比，定位异常成因。',
  ].join('\n\n');
}

export function buildRagAnswerMessages(params: {
  prompt: string;
  ragResult: RagSearchOutput;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const systemMessage = [
    '你是一个教育知识库问答助手。',
    '只能基于给定检索片段回答，不要编造来源或制度条款。',
    '回答中必须使用 [S1]、[S2] 这样的引用标记。',
    '如果检索片段不足以回答，请明确说明未找到充分依据。',
  ].join('\n');
  const sourcesText = params.ragResult.results
    .map((result) =>
      [
        `[${result.citationId}] ${result.title}`,
        `来源：${result.sourceName}`,
        `片段：${result.content}`,
      ].join('\n'),
    )
    .join('\n\n');
  const userMessage = [
    '【用户问题】',
    params.prompt,
    '',
    '【检索片段】',
    sourcesText || '未找到相关片段。',
    '',
    '【回答要求】',
    '1) 先直接回答问题；',
    '2) 给出 2-4 条依据；',
    '3) 每条依据后标注来源，例如 [S1]；',
    '4) 不要引用未提供的来源。',
  ].join('\n');

  return [
    {
      role: 'system',
      content: systemMessage,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];
}

export function buildFallbackRagConclusion(params: {
  ragResult: RagSearchOutput;
}): string {
  if (params.ragResult.results.length === 0) {
    return [
      '未在当前示例知识库中找到足够相关的制度依据。',
      '本次不会编造来源或使用未检索到的材料。',
      '可以换用“教学评价制度、课堂参与度、作业完成率、学业预警、数据异常处理”等更贴近示例知识库的问题重新检索。',
    ].join('\n\n');
  }

  const bullets = params.ragResult.results.slice(0, 3).map((result) => {
    return `- ${result.content} [${result.citationId}]`;
  });

  return [
    '根据当前示例知识库，可以这样理解：',
    '',
    ...bullets,
    '',
    '因此，这类问题不应只看单一指标，而应结合过程性表现、持续性风险和数据质量限制形成管理判断。',
  ].join('\n');
}
