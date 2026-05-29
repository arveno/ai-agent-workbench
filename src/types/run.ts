import type { RunSource } from './rag';
import type {
  RunViewModelAgentConclusion,
  RunViewModelChartData,
  RunViewModelConclusionSource,
  RunViewModelDataSource,
  RunViewModelIntent,
  RunViewModelMode,
  RunViewModelPlan,
  RunViewModelStatus,
  RunViewModelReportState,
  RunViewModelStep,
  RunViewModelToolInvocation,
  RunViewModelTrace,
} from '../domain/run/view-model';

export interface RunStartedPayload {
  id: string;
  clientRunId?: string | null;
  displayRunId?: string;
  mode: RunViewModelMode;
  status?: RunViewModelStatus | 'completed' | 'failed';
  intent?: RunViewModelIntent;
  prompt?: string;
  plan?: RunViewModelPlan;
  dataSource?: RunViewModelDataSource;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  chartData?: RunViewModelChartData;
  conclusion?: string;
  conclusionSource?: RunViewModelConclusionSource;
  agentConclusion?: RunViewModelAgentConclusion;
  modelTrace?: RunViewModelTrace;
  reportState?: RunViewModelReportState;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  errorMessage?: string;
}

export interface RunStartedEvent {
  type: 'run_started';
  runId?: string;
  usageId?: string | null;
  clientRunId?: string | null;
  conversationId: string;
  timestamp?: string;
  run: RunStartedPayload;
}

export interface RunReusedEvent {
  type: 'run_reused';
  runId: string;
  usageId?: string | null;
  clientRunId?: string | null;
  conversationId?: string | null;
  timestamp?: string;
  duplicate?: boolean;
  reused?: boolean;
  reason?: string;
  status?: string;
  existingRun?: {
    id?: string;
    status?: string;
    conclusionSource?: RunViewModelConclusionSource;
    reportState?: RunViewModelReportState;
    completedAt?: string | null;
  } | null;
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

export interface RunStepFailedEvent {
  type: 'step_failed';
  runId: string;
  stepId: string;
  errorMessage: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunToolStartedEvent {
  type: 'tool_started';
  runId: string;
  tool: RunViewModelToolInvocation;
}

export interface RunToolCompletedEvent {
  type: 'tool_completed';
  runId: string;
  toolId: string;
  outputSummary: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunToolFailedEvent {
  type: 'tool_failed';
  runId: string;
  toolId: string;
  errorMessage: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunChartReadyEvent {
  type: 'chart_ready';
  runId: string;
  chartData: RunViewModelChartData;
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
  agentConclusion?: RunViewModelAgentConclusion;
  modelTrace?: RunViewModelTrace;
}

export interface RunRagSourcesReadyEvent {
  type: 'rag_sources_ready';
  runId: string;
  sources: RunSource[];
}

export interface RunReportPendingEvent {
  type: 'report_pending';
  runId: string;
}

export interface RunCompletedEvent {
  type: 'run_completed';
  runId: string;
  completedAt: string;
  elapsedMs?: number;
  modelTrace?: RunViewModelTrace;
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
  | RunReusedEvent
  | RunStepStartedEvent
  | RunStepCompletedEvent
  | RunStepFailedEvent
  | RunToolStartedEvent
  | RunToolCompletedEvent
  | RunToolFailedEvent
  | RunChartReadyEvent
  | RunConclusionDeltaEvent
  | RunConclusionCompletedEvent
  | RunRagSourcesReadyEvent
  | RunReportPendingEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunStoppedEvent;
