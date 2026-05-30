import type { RunViewModelReportState } from '@/domain/run/view-model';

export function reduceRunReportState(): RunViewModelReportState {
  return 'pending';
}
