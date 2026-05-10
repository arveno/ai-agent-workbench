import type { RagSourceChunk } from './rag';

export type RunMode = 'mock' | 'agent';

export type RunIntent = 'capability_intro' | 'data_analysis' | 'unsupported' | 'unknown';

export type RunStatus = 'idle' | 'pending' | 'running' | 'success' | 'error' | 'stopped';

export type RunStepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'stopped';

export type RunToolStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'stopped';

export type RunConclusionSource = 'model' | 'fallback' | 'mock' | 'none';

export type RunReportState = 'hidden' | 'pending' | 'generated' | 'skipped';

export interface RunStep {
  id: string;
  title: string;
  description?: string;
  status: RunStepStatus;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
}

export interface RunToolInvocation {
  id: string;
  toolId: string;
  toolName: string;
  displayName: string;
  status: RunToolStatus;
  inputSummary: string;
  outputSummary: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
}

export type RunChartType = 'bar' | 'line';

export interface RunChartSeries {
  name: string;
  values: number[];
}

export interface RunChartData {
  title: string;
  chartType: RunChartType;
  labels: string[];
  series: RunChartSeries[];
  summary?: string;
}

export interface RunDataSourceSnapshot {
  provider: 'mock' | 'postgresql' | 'supabase';
  name: string;
  typeLabel: string;
  schema?: string;
  tableCount?: number;
}

export interface RunPlanSnapshot {
  intent: RunIntent;
  shouldUseDataAnalysis: boolean;
  reason?: string;
  metric?: string;
  groupBy?: string;
  timeRangeLabel?: string;
  comparison?: 'none' | 'previous_month';
}

export interface RunSnapshot {
  id: string;
  sessionId?: string;
  mode: RunMode;
  status: RunStatus;
  intent: RunIntent;
  prompt: string;
  plan?: RunPlanSnapshot;
  dataSource?: RunDataSourceSnapshot;
  steps: RunStep[];
  toolInvocations: RunToolInvocation[];
  sources?: RagSourceChunk[];
  chartData?: RunChartData;
  conclusion: string;
  conclusionSource: RunConclusionSource;
  conclusionNotice?: string;
  reportState: RunReportState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  errorMessage?: string;
}

export interface RunStartedEvent {
  type: 'run_started';
  run: RunSnapshot;
}

export interface RunStepStartedEvent {
  type: 'step_started';
  runId: string;
  stepId: string;
  title: string;
  description?: string;
  startedAt: string;
}

export interface RunStepCompletedEvent {
  type: 'step_completed';
  runId: string;
  stepId: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunToolStartedEvent {
  type: 'tool_started';
  runId: string;
  tool: RunToolInvocation;
}

export interface RunToolCompletedEvent {
  type: 'tool_completed';
  runId: string;
  toolId: string;
  outputSummary: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunChartReadyEvent {
  type: 'chart_ready';
  runId: string;
  chartData: RunChartData;
}

export interface RunConclusionDeltaEvent {
  type: 'conclusion_delta';
  runId: string;
  delta: string;
}

export interface RunConclusionCompletedEvent {
  type: 'conclusion_completed';
  runId: string;
  conclusion: string;
  conclusionSource: RunConclusionSource;
  conclusionNotice?: string;
}

export interface RunReportPendingEvent {
  type: 'report_pending';
  runId: string;
}

export interface RunReportGeneratedEvent {
  type: 'report_generated';
  runId: string;
}

export interface RunReportSkippedEvent {
  type: 'report_skipped';
  runId: string;
}

export interface RunCompletedEvent {
  type: 'run_completed';
  runId: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunFailedEvent {
  type: 'run_failed';
  runId: string;
  errorMessage: string;
}

export interface RunStoppedEvent {
  type: 'run_stopped';
  runId: string;
}

export type RunEvent =
  | RunStartedEvent
  | RunStepStartedEvent
  | RunStepCompletedEvent
  | RunToolStartedEvent
  | RunToolCompletedEvent
  | RunChartReadyEvent
  | RunConclusionDeltaEvent
  | RunConclusionCompletedEvent
  | RunReportPendingEvent
  | RunReportGeneratedEvent
  | RunReportSkippedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunStoppedEvent;
