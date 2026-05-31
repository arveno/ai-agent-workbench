import type { RunViewModel } from '@/domain/run/view-model';

export function isDataAnalysisRun(run: RunViewModel | null): boolean {
  return run?.intent === 'data_analysis';
}

export function shouldUseMockRun(selectedModelId: string, run: RunViewModel | null): run is RunViewModel {
  return selectedModelId === 'mock-agent' && run?.mode === 'mock';
}

export function shouldUseUnifiedRun(run: RunViewModel | null): run is RunViewModel {
  return run?.mode === 'mock' || run?.mode === 'agent';
}

export function shouldShowReportConfirm(run: RunViewModel | null): boolean {
  return Boolean(
    run &&
      run.intent === 'data_analysis' &&
      run.status === 'success' &&
      run.conclusion.trim() &&
      run.reportState === 'pending',
  );
}

export function createRunId(prefix = 'run'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
