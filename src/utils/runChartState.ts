import type { NormalizedRunEvent } from '@/domain/run/boundary';
import type { RunViewModelChartData } from '@/domain/run/view-model';

type RunChartEvent = Extract<NormalizedRunEvent, { type: 'chart_ready' }>;

export function reduceRunChartData(event: RunChartEvent): RunViewModelChartData {
  return event.chartData;
}
