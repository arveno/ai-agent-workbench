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
    description: '读取当前数据源允许访问的结构、对象和字段类型。',
    inputSummary: '数据源访问范围',
    outputSummary: '受控数据对象与字段结构',
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
    inputSummary: '指标、分组、时间范围、限制条数',
    outputSummary: '聚合结果、图表数据、耗时',
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
    inputSummary: '聚合结果、图表类型、展示字段',
    outputSummary: '图表数据与摘要',
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
    description: '通过服务端受控知识库做检索，返回可引用来源片段。',
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
    return '结构工具';
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
