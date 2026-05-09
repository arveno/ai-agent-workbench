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
  aggregateResult: AggregateTableOutput;
  chartSummary: string;
}): string {
  const previewRows = params.aggregateResult.rows
    .slice(0, 3)
    .map((row, index) => `${index + 1}. ${JSON.stringify(row)}`)
    .join('\n');

  return [
    '已完成工具执行，但未配置模型 Key，暂时返回工具结果摘要。',
    `分析指标：${params.intent.metric}`,
    `分组维度：${params.intent.groupBy}`,
    `聚合结果条数：${params.aggregateResult.rowCount}`,
    `图表摘要：${params.chartSummary}`,
    '结果预览：',
    previewRows || '无可用结果',
  ].join('\n');
}
