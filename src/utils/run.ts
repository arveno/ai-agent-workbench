import type { RunSnapshot } from '@/types/run';

export function isDataAnalysisRun(run: RunSnapshot | null): boolean {
  return run?.intent === 'data_analysis';
}

export function shouldUseMockRun(currentModelProvider: string, run: RunSnapshot | null): run is RunSnapshot {
  return currentModelProvider === 'mock' && run?.mode === 'mock';
}

export function shouldShowReportConfirm(run: RunSnapshot | null): boolean {
  return Boolean(
    run &&
      run.intent === 'data_analysis' &&
      run.status === 'success' &&
      run.conclusion &&
      run.reportState === 'pending',
  );
}

export function createRunId(prefix = 'run'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
