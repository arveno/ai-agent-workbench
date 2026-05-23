import type { RunToolInvocation } from '@/types/run';
import type { WorkbenchToolId } from '@/types/toolRegistry';
import { getToolFailureLabel, getToolStatusLabel } from './observabilityLabels';
import {
  getToolCategoryLabel,
  getWorkbenchToolDefinition,
  normalizeWorkbenchToolId,
} from './toolRegistryView';

export interface FormattedToolInvocation {
  id: string;
  toolName: string;
  displayName: string;
  categoryLabel: string;
  statusLabel: string;
  inputText: string;
  outputText: string;
  failureText: string;
  elapsedText: string;
}

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

function getKnownToolId(invocation: RunToolInvocation): WorkbenchToolId | null {
  const candidates = [invocation.toolId, invocation.toolName, invocation.displayName]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  for (const candidate of candidates) {
    const normalizedToolId = normalizeWorkbenchToolId(candidate);

    if (normalizedToolId) {
      return normalizedToolId;
    }
  }

  return null;
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

function formatInputText(toolId: WorkbenchToolId | null, invocation: RunToolInvocation): string {
  const inputObject = tryParseJsonObject(invocation.inputSummary);

  if (toolId === 'schema_inspect') {
    return '读取可访问的数据源结构。';
  }

  if (toolId === 'knowledge_search') {
    return '检索与本轮问题相关的知识资料。';
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

  return invocation.inputSummary.trim().startsWith('{') ? '执行工具调用。' : invocation.inputSummary || '执行工具调用。';
}

function formatOutputText(toolId: WorkbenchToolId | null, invocation: RunToolInvocation): string {
  if (invocation.status === 'error') {
    return '工具执行异常。';
  }

  if (invocation.status === 'stopped') {
    return '工具执行已停止。';
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

  return outputText.startsWith('{') ? '工具已执行完成。' : outputText || '工具已执行完成。';
}

function formatElapsedText(elapsedMs: number | undefined): string {
  return typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) ? `${elapsedMs}ms` : '-';
}

function formatToolInvocation(invocation: RunToolInvocation, limits: FormatLimits): FormattedToolInvocation {
  const toolId = getKnownToolId(invocation);
  const toolDefinition = toolId ? getWorkbenchToolDefinition(toolId) : null;
  const displayName = (toolDefinition?.displayName ?? invocation.displayName) || invocation.toolName;
  const categoryLabel = toolDefinition ? getToolCategoryLabel(toolDefinition.category) : '工具';

  return {
    id: invocation.id,
    toolName: invocation.toolName,
    displayName,
    categoryLabel,
    statusLabel: getToolStatusLabel(invocation.status),
    inputText: truncateText(formatInputText(toolId, invocation), limits.input),
    outputText: truncateText(formatOutputText(toolId, invocation), limits.output),
    failureText: invocation.status === 'error' ? truncateText(getToolFailureLabel(invocation), limits.output) : '',
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
