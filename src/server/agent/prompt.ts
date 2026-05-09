/// <reference types="node" />

import type { SchemaInspectOutput } from '../tools/schemaInspectTool';
import type { AggregateTableOutput } from '../tools/aggregateTableTool';
import type { ChartRenderOutput } from '../tools/chartRenderTool';
import type { SimpleAgentIntent } from './intent';

interface AgentPromptContext {
  prompt: string;
  intent: SimpleAgentIntent;
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

export function buildConclusionMessages(context: AgentPromptContext): Array<{ role: 'system' | 'user'; content: string }> {
  const systemMessage =
    '你是一个教育数据分析助手。请基于工具结果输出简洁、可信的分析结论，不要编造工具结果中没有的数据。若数据不足请明确说明。';

  const userMessage = [
    '【用户问题】',
    context.prompt,
    '',
    '【意图识别】',
    `metric=${context.intent.metric}, groupBy=${context.intent.groupBy}`,
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
  intent: SimpleAgentIntent;
  chartResult: ChartRenderOutput;
}): string {
  const metricNameMap: Record<SimpleAgentIntent['metric'], string> = {
    avg_score: '平均分',
    attendance_rate: '出勤率',
    homework_completion_rate: '作业完成率',
    abnormal_count: '异常指标',
  };

  const groupByNameMap: Record<SimpleAgentIntent['groupBy'], string> = {
    subject: '学科',
    metric_month: '月份',
  };

  const metricName = metricNameMap[params.intent.metric];
  const groupByName = groupByNameMap[params.intent.groupBy];
  const labels = params.chartResult.labels;
  const values = params.chartResult.values;

  if (labels.length === 0 || values.length === 0) {
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
    `本次分析已基于真实数据源完成，并围绕“${metricName}”按${groupByName}维度执行了聚合分析。`,
    `从当前聚合结果看，${maxLabel}在该指标上最为突出（约 ${maxValue.toFixed(2)}），建议优先关注该维度并结合班级层级进一步排查。`,
    topLabels
      ? `当前结果主要覆盖：${topLabels}。建议下一步联动平均分、出勤率与作业完成率进行交叉对比，定位异常成因。`
      : '建议下一步联动平均分、出勤率与作业完成率进行交叉对比，定位异常成因。',
  ].join('\n\n');
}
