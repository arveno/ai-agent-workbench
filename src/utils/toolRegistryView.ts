import type { WorkbenchToolDefinition } from '@/types/toolRegistry';

export const WORKBENCH_TOOL_DEFINITIONS: WorkbenchToolDefinition[] = [
  {
    id: 'schema_inspect',
    name: 'schema_inspect',
    displayName: '数据源结构读取',
    category: 'schema',
    status: 'connected',
    runtime: 'server',
    riskLevel: 'low',
    enabled: true,
    usedInRunTrace: true,
    description: '读取当前数据源允许访问的 schema、表、字段和字段类型。',
    inputSummary: 'dataSourceId, allowedSchemas',
    outputSummary: 'tables, columns, columnTypes',
  },
  {
    id: 'query_table',
    name: 'query_table',
    displayName: '受控数据查询',
    category: 'query',
    status: 'connected',
    runtime: 'server',
    riskLevel: 'medium',
    enabled: true,
    usedInRunTrace: true,
    description: '按白名单表和字段执行受控查询，不开放任意 SQL。',
    inputSummary: 'table, columns, limit',
    outputSummary: 'rows, rowCount, elapsedMs',
  },
  {
    id: 'aggregate_table',
    name: 'aggregate_table',
    displayName: '数据聚合分析',
    category: 'analysis',
    status: 'connected',
    runtime: 'server',
    riskLevel: 'medium',
    enabled: true,
    usedInRunTrace: true,
    description: '对教学指标进行受控聚合，支持时间范围、指标和维度约束。',
    inputSummary: 'metric, groupBy, timeRange, comparison, limit',
    outputSummary: 'aggregates, chartData, elapsedMs',
  },
  {
    id: 'chart_render',
    name: 'chart_render',
    displayName: '图表数据生成',
    category: 'render',
    status: 'connected',
    runtime: 'server',
    riskLevel: 'low',
    enabled: true,
    usedInRunTrace: true,
    description: '将查询或聚合结果转换为前端可渲染的图表数据结构。',
    inputSummary: 'rows, chartType, labelKey, valueKey',
    outputSummary: 'chartData, summary',
  },
  {
    id: 'knowledge_search',
    name: 'knowledge_search',
    displayName: 'CloudBase 知识检索',
    category: 'knowledge',
    status: 'connected',
    runtime: 'server',
    riskLevel: 'low',
    enabled: true,
    usedInRunTrace: true,
    description: '通过 CloudBase MySQL 的 knowledge_documents / knowledge_chunks 做受控检索，返回可引用来源片段。',
    inputSummary: 'query, topK',
    outputSummary: 'retrievedChunkCount, sources, citations, score',
  },
  {
    id: 'report_generate',
    name: 'report_generate',
    displayName: '报告生成',
    category: 'report',
    status: 'mock',
    runtime: 'mock',
    riskLevel: 'low',
    enabled: true,
    usedInRunTrace: false,
    description: '基于当前 Run 结果生成 Markdown 简版报告，目前由前端基于 currentRun 生成。',
    inputSummary: 'runId, conclusion, toolInvocations, chartData',
    outputSummary: 'reportMarkdown',
  },
];

export function getWorkbenchToolDefinition(toolId: string): WorkbenchToolDefinition | null {
  const normalizedToolId = toolId === 'rag_search' ? 'knowledge_search' : toolId;
  return WORKBENCH_TOOL_DEFINITIONS.find((tool) => tool.id === normalizedToolId || tool.name === normalizedToolId) ?? null;
}

export function getWorkbenchToolDisplayName(toolId: string): string {
  return getWorkbenchToolDefinition(toolId)?.displayName ?? toolId;
}

export function getToolStatusLabel(status: WorkbenchToolDefinition['status']): string {
  if (status === 'connected') {
    return '已接入';
  }

  if (status === 'mock') {
    return '本地演示';
  }

  return '规划中';
}

export function getToolRuntimeLabel(runtime: WorkbenchToolDefinition['runtime']): string {
  if (runtime === 'server') {
    return '服务端执行';
  }

  if (runtime === 'mock') {
    return '本地执行';
  }

  return '待接入';
}

export function getToolRiskLabel(riskLevel: WorkbenchToolDefinition['riskLevel']): string {
  if (riskLevel === 'low') {
    return '低风险';
  }

  if (riskLevel === 'medium') {
    return '中风险';
  }

  return '高风险';
}
