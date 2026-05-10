import type { RunChartData } from '@/types/run';

export function isValidRunChartData(
  chartData: RunChartData | undefined,
): chartData is RunChartData {
  if (!chartData || chartData.labels.length === 0 || chartData.series.length === 0) {
    return false;
  }

  return chartData.series.some((series) => series.values.length > 0);
}

export function getPrimaryChartValue(
  chartData: RunChartData | undefined,
  index: number,
): number | null {
  if (!isValidRunChartData(chartData)) {
    return null;
  }

  const value = chartData.series[0]?.values[index];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getChartPointCount(chartData: RunChartData | undefined): number {
  if (!isValidRunChartData(chartData)) {
    return 0;
  }

  const valueLengths = chartData.series.map((series) => series.values.length);
  return Math.min(chartData.labels.length, Math.max(...valueLengths));
}

export function getChartValueExtent(
  chartData: RunChartData | undefined,
): { min: number; max: number } | null {
  if (!isValidRunChartData(chartData)) {
    return null;
  }

  const values = chartData.series
    .flatMap((series) => series.values)
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
