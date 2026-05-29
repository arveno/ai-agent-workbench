import type { RunViewModelChartData, RunViewModelDataSource, RunViewModelPlan } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function mapCanonicalRunPlan(value: unknown): RunViewModelPlan | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const intent = value.intent;
  const shouldUseDataAnalysis = value.shouldUseDataAnalysis;

  if (
    intent !== 'capability_intro' &&
    intent !== 'data_analysis' &&
    intent !== 'knowledge_qa' &&
    intent !== 'unsupported' &&
    intent !== 'unknown'
  ) {
    return undefined;
  }

  return {
    intent,
    shouldUseDataAnalysis: shouldUseDataAnalysis === true,
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    ...(typeof value.metric === 'string' ? { metric: value.metric } : {}),
    ...(typeof value.groupBy === 'string' ? { groupBy: value.groupBy } : {}),
    ...(typeof value.timeRangeLabel === 'string' ? { timeRangeLabel: value.timeRangeLabel } : {}),
    ...(value.comparison === 'none' || value.comparison === 'previous_month'
      ? { comparison: value.comparison }
      : {}),
  };
}

export function mapCanonicalRunDataSource(value: unknown): RunViewModelDataSource | undefined {
  if (!isRecord(value) || (value.provider !== 'mock' && value.provider !== 'cloudbase_mysql')) {
    return undefined;
  }

  const name = getTrimmedString(value.name);
  const typeLabel = getTrimmedString(value.typeLabel);

  if (!name || !typeLabel) {
    return undefined;
  }

  return {
    provider: value.provider,
    name,
    typeLabel,
    ...(typeof value.schema === 'string' ? { schema: value.schema } : {}),
    ...(typeof value.tableCount === 'number' && Number.isFinite(value.tableCount)
      ? { tableCount: value.tableCount }
      : {}),
  };
}

export function mapCanonicalRunChartData(value: unknown): RunViewModelChartData | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const title = getTrimmedString(value.title);
  const chartType = value.chartType;
  const labels = value.labels;
  const series = value.series;

  if (
    !title ||
    (chartType !== 'bar' && chartType !== 'line') ||
    !Array.isArray(labels) ||
    !labels.every((label) => typeof label === 'string') ||
    !Array.isArray(series)
  ) {
    return undefined;
  }

  const chartSeries = series
    .filter(isRecord)
    .map((item) => {
      const name = getTrimmedString(item.name);
      const values = item.values;

      if (!name || !Array.isArray(values) || !values.every((value) => typeof value === 'number')) {
        return null;
      }

      return {
        name,
        values,
      };
    })
    .filter((item): item is RunViewModelChartData['series'][number] => item !== null);

  if (chartSeries.length !== series.length) {
    return undefined;
  }

  return {
    title,
    chartType,
    labels,
    series: chartSeries,
    ...(typeof value.summary === 'string' ? { summary: value.summary } : {}),
  };
}
