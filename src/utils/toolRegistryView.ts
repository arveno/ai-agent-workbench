import type { WorkbenchToolDefinition, WorkbenchToolId } from '@/types/toolRegistry';

export const OFFICIAL_WORKBENCH_TOOL_IDS: readonly WorkbenchToolId[] = [
  'schema_inspect',
  'aggregate_table',
  'chart_render',
  'knowledge_search',
];

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
    outputSummary: '命中片段数, 来源片段, 引用, 分数',
  },
];

export function normalizeWorkbenchToolId(toolId: string): WorkbenchToolId | null {
  const normalizedToolId = toolId.trim().toLowerCase();
  return OFFICIAL_WORKBENCH_TOOL_IDS.find((id) => id === normalizedToolId) ?? null;
}

export function getWorkbenchToolDefinition(toolId: string): WorkbenchToolDefinition | null {
  const normalizedToolId = normalizeWorkbenchToolId(toolId);

  if (!normalizedToolId) {
    return null;
  }

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
    return '本地执行';
  }

  return '不展示';
}

export function getToolRuntimeLabel(runtime: WorkbenchToolDefinition['runtime']): string {
  if (runtime === 'server') {
    return '服务端执行';
  }

  if (runtime === 'mock') {
    return '本地执行';
  }

  return '不展示';
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

export function getToolCategoryLabel(category: WorkbenchToolDefinition['category']): string {
  if (category === 'schema') {
    return 'Schema 工具';
  }

  if (category === 'analysis') {
    return '分析工具';
  }

  if (category === 'render') {
    return '可视化工具';
  }

  if (category === 'knowledge') {
    return '知识工具';
  }

  if (category === 'query') {
    return '查询工具';
  }

  return '报告工具';
}

export function getOfficialWorkbenchToolSummaryItems(): Array<{
  label: string;
  status: string;
  variant: 'success';
}> {
  return WORKBENCH_TOOL_DEFINITIONS.filter(
    (tool) => tool.enabled && tool.runtime === 'server' && tool.status === 'connected',
  ).map((tool) => ({
    label: tool.displayName,
    status: '已接入',
    variant: 'success',
  }));
}
