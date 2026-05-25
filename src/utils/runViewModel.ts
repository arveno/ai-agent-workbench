import type {
  RunConclusionSource,
  RunDataSourceSnapshot,
  RunEvent,
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

export interface RunDataSourceViewModel {
  name: string;
  subtitle: string;
  description: string;
  metaItems: Array<{
    label: string;
    value: string;
  }>;
}

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

export function getRunDisplayId(run: Pick<RunSnapshot, 'id' | 'displayRunId'> | null): string {
  if (!run) {
    return '-';
  }

  return run.displayRunId?.trim() || run.id;
}

export function isRunEventForRun(
  event: Pick<RunEvent, 'runId'> & { clientRunId?: string | null },
  run: Pick<RunSnapshot, 'id' | 'clientRunId'> | null,
): boolean {
  if (!run) {
    return false;
  }

  if (event.runId === run.id) {
    return true;
  }

  return Boolean(run.clientRunId && event.clientRunId === run.clientRunId);
}

export function getLatestRunReusedEventForRun(
  run: Pick<RunSnapshot, 'id' | 'clientRunId'> | null,
  events: RunEvent[],
): Extract<RunEvent, { type: 'run_reused' }> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === 'run_reused' && isRunEventForRun(event, run)) {
      return event;
    }
  }

  return null;
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

function getDataSourceBusinessName(run: Pick<RunSnapshot, 'mode' | 'intent'>): string {
  if (run.mode === 'mock') {
    return '演示数据源';
  }

  if (run.intent === 'knowledge_qa') {
    return '知识检索数据源';
  }

  return '教学质量数据源';
}

function getDataSourceSubtitle(run: Pick<RunSnapshot, 'mode'>): string {
  return run.mode === 'mock' ? '本地演示数据' : '服务端受控数据源';
}

function getDataSourceScope(source: RunDataSourceSnapshot | undefined): string {
  if (typeof source?.tableCount === 'number' && source.tableCount > 0) {
    return `${source.tableCount} 个受控数据对象`;
  }

  return '服务端受控范围';
}

export function createRunDataSourceViewModel(
  run: Pick<RunSnapshot, 'mode' | 'intent' | 'status' | 'dataSource'>,
): RunDataSourceViewModel {
  return {
    name: getDataSourceBusinessName(run),
    subtitle: getDataSourceSubtitle(run),
    description: run.dataSource ? getDataSourceSubtitle(run) : '当前 Run 使用的数据源上下文',
    metaItems: [
      { label: '数据源名称', value: getDataSourceBusinessName(run) },
      { label: '访问方式', value: getDataSourceSubtitle(run) },
      { label: '访问范围', value: getDataSourceScope(run.dataSource) },
      { label: 'Run 状态', value: getRunStatusLabel(run.status) },
    ],
  };
}
