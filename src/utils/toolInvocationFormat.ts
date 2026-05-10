import type { RunToolInvocation } from '@/types/run';

export interface FormattedToolInvocation {
  id: string;
  toolName: string;
  displayName: string;
  categoryLabel: string;
  statusLabel: string;
  inputText: string;
  outputText: string;
  elapsedText: string;
}

const TOOL_DISPLAY_NAME_MAP = {
  schema_inspect: '数据源结构读取',
  knowledge_search: '知识检索',
  query_data: '数据查询',
  query_table: '受控数据查询',
  aggregate_table: '数据聚合分析',
  chart_render: '图表数据生成',
  report_generate: '报告生成',
} as const;

const TOOL_CATEGORY_LABEL_MAP = {
  schema_inspect: 'Schema 工具',
  knowledge_search: '知识工具',
  query_data: '查询工具',
  query_table: '查询工具',
  aggregate_table: '分析工具',
  chart_render: '可视化工具',
  report_generate: '报告工具',
} as const;

const KNOWN_TOOL_IDS = Object.keys(TOOL_DISPLAY_NAME_MAP) as Array<keyof typeof TOOL_DISPLAY_NAME_MAP>;

type KnownToolId = (typeof KNOWN_TOOL_IDS)[number];

type FormatLimits = {
  input: number;
  output: number;
};

function truncateText(text: string, maxLength: number): string {
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function tryParseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function getKnownToolId(invocation: RunToolInvocation): KnownToolId | null {
  const candidates = [invocation.toolId, invocation.toolName, invocation.displayName]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return KNOWN_TOOL_IDS.find((toolId) => candidates.some((candidate) => candidate === toolId || candidate.includes(toolId))) ?? null;
}

function getStatusLabel(status: RunToolInvocation['status']): string {
  if (status === 'pending') {
    return '待执行';
  }

  if (status === 'running') {
    return '执行中';
  }

  if (status === 'success') {
    return '已完成';
  }

  if (status === 'skipped') {
    return '已跳过';
  }

  return '异常';
}

function getStringField(source: Record<string, unknown> | null, key: string): string {
  const value = source?.[key];

  return typeof value === 'string' ? value : '';
}

function getNumberField(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function humanizeMetric(metric: string): string {
  if (metric === 'avg_score') {
    return '平均分';
  }

  if (metric === 'attendance_rate') {
    return '出勤率';
  }

  if (metric === 'homework_completion_rate') {
    return '作业完成率';
  }

  if (metric === 'abnormal_count') {
    return '异常指标';
  }

  return metric;
}

function humanizeGroupBy(groupBy: string): string {
  if (groupBy === 'subject') {
    return '学科';
  }

  if (groupBy === 'metric_month') {
    return '月份';
  }

  return groupBy;
}

function humanizeChartType(chartType: string): string {
  if (chartType === 'bar') {
    return '柱状图';
  }

  if (chartType === 'line') {
    return '折线图';
  }

  return chartType;
}

function extractCount(text: string, unitPattern: string): string | null {
  const match = text.match(new RegExp(`(\\d+)\\s*(?:${unitPattern})`));

  return match?.[1] ?? null;
}

function formatInputText(toolId: KnownToolId | null, invocation: RunToolInvocation): string {
  const inputObject = tryParseJsonObject(invocation.inputSummary);

  if (toolId === 'schema_inspect') {
    return '读取可访问的数据源结构。';
  }

  if (toolId === 'knowledge_search') {
    return '检索与本轮问题相关的知识资料。';
  }

  if (toolId === 'query_data') {
    return '查询本轮分析所需的业务数据。';
  }

  if (toolId === 'query_table') {
    const table = getStringField(inputObject, 'table');
    return table ? `查询 ${table} 表中的受控字段。` : '执行受控表查询。';
  }

  if (toolId === 'aggregate_table') {
    const metric = getStringField(inputObject, 'metric');
    const groupBy = getStringField(inputObject, 'groupBy');
    return metric && groupBy
      ? `按${humanizeGroupBy(groupBy)}聚合${humanizeMetric(metric)}。`
      : '执行受控指标聚合。';
  }

  if (toolId === 'chart_render') {
    const chartType = getStringField(inputObject, 'chartType');
    return chartType ? `生成${humanizeChartType(chartType)}数据。` : '生成图表展示数据。';
  }

  if (toolId === 'report_generate') {
    return '基于本轮 Run 结果生成报告。';
  }

  return invocation.inputSummary.trim().startsWith('{') ? '执行工具调用。' : invocation.inputSummary || '执行工具调用。';
}

function formatOutputText(toolId: KnownToolId | null, invocation: RunToolInvocation): string {
  if (invocation.status === 'error') {
    return '工具执行异常。';
  }

  const outputText = invocation.outputSummary.trim();
  const outputObject = tryParseJsonObject(outputText);

  if (toolId === 'schema_inspect') {
    const tableCount = extractCount(outputText, '张表|个表') ?? getNumberField(outputObject, 'tableCount')?.toString();
    return tableCount ? `已读取 public schema，共 ${tableCount} 张表。` : '已读取数据源结构。';
  }

  if (toolId === 'aggregate_table') {
    const rowCount = extractCount(outputText, '条') ?? getNumberField(outputObject, 'rowCount')?.toString();
    return rowCount ? `已完成聚合分析，返回 ${rowCount} 条结果。` : '已完成聚合分析。';
  }

  if (toolId === 'chart_render') {
    const inputObject = tryParseJsonObject(invocation.inputSummary);
    const chartType = getStringField(inputObject, 'chartType') || getStringField(outputObject, 'chartType');
    return chartType ? `已生成${humanizeChartType(chartType)}数据。` : '已生成图表数据。';
  }

  if (toolId === 'knowledge_search') {
    const count = extractCount(outputText, '条');
    return count ? `已检索到 ${count} 条相关知识资料。` : '已检索到相关知识资料。';
  }

  if (toolId === 'query_table' || toolId === 'query_data') {
    const rowCount = extractCount(outputText, '条') ?? getNumberField(outputObject, 'rowCount')?.toString();
    return rowCount ? `已返回 ${rowCount} 条查询结果。` : '已返回查询结果。';
  }

  if (toolId === 'report_generate') {
    return '已生成报告内容。';
  }

  return outputText.startsWith('{') ? '工具已执行完成。' : outputText || '工具已执行完成。';
}

function formatElapsedText(elapsedMs: number | undefined): string {
  return typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) ? `${elapsedMs}ms` : '-';
}

function formatToolInvocation(invocation: RunToolInvocation, limits: FormatLimits): FormattedToolInvocation {
  const toolId = getKnownToolId(invocation);
  const displayName = toolId
    ? TOOL_DISPLAY_NAME_MAP[toolId]
    : invocation.displayName || invocation.toolName;
  const categoryLabel = toolId ? TOOL_CATEGORY_LABEL_MAP[toolId] : '工具';

  return {
    id: invocation.id,
    toolName: invocation.toolName,
    displayName,
    categoryLabel,
    statusLabel: getStatusLabel(invocation.status),
    inputText: truncateText(formatInputText(toolId, invocation), limits.input),
    outputText: truncateText(formatOutputText(toolId, invocation), limits.output),
    elapsedText: formatElapsedText(invocation.elapsedMs),
  };
}

export function formatToolInvocationForChat(
  invocation: RunToolInvocation,
): FormattedToolInvocation {
  return formatToolInvocation(invocation, {
    input: 80,
    output: 100,
  });
}

export function formatToolInvocationForInspector(
  invocation: RunToolInvocation,
): FormattedToolInvocation {
  return formatToolInvocation(invocation, {
    input: 120,
    output: 160,
  });
}
