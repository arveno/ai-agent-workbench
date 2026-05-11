import type {
  RunConclusionSource,
  RunIntent,
  RunMode,
  RunSnapshot,
  RunStatus,
  RunStepStatus,
  RunToolStatus,
} from '@/types/run';

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
  if (status === 'idle') {
    return '未开始';
  }

  if (status === 'pending') {
    return '等待中';
  }

  if (status === 'running') {
    return '运行中';
  }

  if (status === 'success') {
    return '已完成';
  }

  if (status === 'error') {
    return '执行异常';
  }

  return '已停止';
}

export function getRunStatusTone(status: RunStatus): RunStatusTone {
  if (status === 'running' || status === 'pending') {
    return 'active';
  }

  if (status === 'success') {
    return 'success';
  }

  if (status === 'error') {
    return 'danger';
  }

  if (status === 'stopped') {
    return 'warning';
  }

  return 'muted';
}

export function getStepStatusLabel(status: RunStepStatus): string {
  if (status === 'pending') {
    return '待执行';
  }

  if (status === 'running') {
    return '进行中';
  }

  if (status === 'success') {
    return '已完成';
  }

  if (status === 'error') {
    return '执行异常';
  }

  if (status === 'skipped') {
    return '已跳过';
  }

  return '已停止';
}

export function getToolStatusLabel(status: RunToolStatus): string {
  if (status === 'pending') {
    return '待执行';
  }

  if (status === 'running') {
    return '执行中';
  }

  if (status === 'success') {
    return '已完成';
  }

  if (status === 'error') {
    return '执行异常';
  }

  if (status === 'skipped') {
    return '已跳过';
  }

  return '已停止';
}

export function getConclusionSourceLabel(source: RunConclusionSource): string {
  if (source === 'model') {
    return '模型生成';
  }

  if (source === 'fallback') {
    return '本地摘要';
  }

  if (source === 'mock') {
    return 'Mock 生成';
  }

  return '未生成';
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
