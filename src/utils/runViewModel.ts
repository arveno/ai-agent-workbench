import type {
  RunConclusionSource,
  RunIntent,
  RunMode,
  RunSnapshot,
  RunStatus,
  RunStepStatus,
  RunToolStatus,
} from '@/types/run';
import {
  getConclusionSourceLabel as getObservabilityConclusionSourceLabel,
  getRunStatusLabel as getObservabilityRunStatusLabel,
  getRunStatusTone as getObservabilityRunStatusTone,
  getStepStatusLabel as getObservabilityStepStatusLabel,
  getToolStatusLabel as getObservabilityToolStatusLabel,
} from './observabilityLabels';

export type RunStatusTone = 'muted' | 'active' | 'success' | 'warning' | 'danger';

export function getRunModeLabel(mode: RunMode): string {
  return mode === 'mock' ? '公开演示模式（Mock）' : '真实 Agent';
}

export function getRunIntentLabel(intent: RunIntent): string {
  if (intent === 'capability_intro') {
    return '能力说明';
  }

  if (intent === 'data_analysis') {
    return '数据分析';
  }

  if (intent === 'unsupported') {
    return '暂不支持';
  }

  return '待判断';
}

export function getRunStatusLabel(status: RunStatus): string {
  return getObservabilityRunStatusLabel(status);
}

export function getRunStatusTone(status: RunStatus): RunStatusTone {
  return getObservabilityRunStatusTone(status);
}

export function getStepStatusLabel(status: RunStepStatus): string {
  return getObservabilityStepStatusLabel(status);
}

export function getToolStatusLabel(status: RunToolStatus): string {
  return getObservabilityToolStatusLabel(status);
}

export function getConclusionSourceLabel(source: RunConclusionSource): string {
  return getObservabilityConclusionSourceLabel(source);
}

export function formatRunElapsed(run: RunSnapshot | null): string {
  if (!run) {
    return '-';
  }

  if (typeof run.elapsedMs === 'number') {
    return `${run.elapsedMs}ms`;
  }

  const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : Number.NaN;
  const completedAt = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();

  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    return run.status === 'running' ? '运行中' : '-';
  }

  return `${completedAt - startedAt}ms`;
}

export function getRunTitle(run: RunSnapshot | null): string {
  if (!run) {
    return '暂无 Run';
  }

  if (run.intent === 'capability_intro') {
    return '能力说明 Run';
  }

  if (run.intent === 'unsupported') {
    return '暂不支持 Run';
  }

  if (run.intent === 'data_analysis') {
    return '数据分析 Run';
  }

  return run.mode === 'mock' ? 'Mock Run' : 'Agent Run';
}
