import type { RunSource } from '../../../types/rag';
import type {
  RunViewModelAgentConclusion,
  RunViewModelChartData,
  RunViewModelConclusionSource,
  RunViewModelDataSource,
  RunViewModelIntent,
  RunViewModelMode,
  RunViewModelPlan,
  RunViewModelReportState,
  RunViewModelStatus,
  RunViewModelStep,
  RunViewModelToolInvocation,
  RunViewModelTrace,
} from '../view-model';

export type RunEventType =
  | 'run_started'
  | 'run_reused'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'
  | 'chart_ready'
  | 'conclusion_delta'
  | 'conclusion_completed'
  | 'rag_sources_ready'
  | 'report_pending'
  | 'run_completed'
  | 'run_failed'
  | 'run_stopped';

export type RunEventBoundarySource = 'runtime' | 'persistence' | 'local';

export interface RunEventBoundaryContext {
  source?: RunEventBoundarySource;
  clientRunId?: string | null;
  runId?: string | null;
  conversationId?: string | null;
  timestamp?: string | null;
}

export interface RunStartedPayload {
  id: string;
  clientRunId?: string | null;
  displayRunId?: string;
  mode: RunViewModelMode;
  status?: RunViewModelStatus;
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

export interface RunEventIdentity {
  runId: string;
  conversationId?: string;
  timestamp?: string;
  clientRunId?: string | null;
}

export interface RunStartedEvent extends Omit<RunEventIdentity, 'conversationId'> {
  type: 'run_started';
  conversationId: string;
  run: RunStartedPayload;
}

export interface RunReusedEvent extends RunEventIdentity {
  type: 'run_reused';
  duplicate?: boolean;
  reused?: boolean;
  reason?: string;
  status?: RunViewModelStatus;
  existingRun?: {
    id?: string;
    status?: RunViewModelStatus;
    conclusionSource?: RunViewModelConclusionSource;
    reportState?: RunViewModelReportState;
    completedAt?: string | null;
  } | null;
}

export interface RunStepStartedEvent extends RunEventIdentity {
  type: 'step_started';
  stepId: string;
  title: string;
  description?: string;
  startedAt: string;
}

export interface RunStepCompletedEvent extends RunEventIdentity {
  type: 'step_completed';
  stepId: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunStepFailedEvent extends RunEventIdentity {
  type: 'step_failed';
  stepId: string;
  errorMessage: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunToolStartedEvent extends RunEventIdentity {
  type: 'tool_started';
  tool: RunViewModelToolInvocation;
}

export interface RunToolCompletedEvent extends RunEventIdentity {
  type: 'tool_completed';
  toolId: string;
  outputSummary: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunToolFailedEvent extends RunEventIdentity {
  type: 'tool_failed';
  toolId: string;
  errorMessage: string;
  completedAt: string;
  elapsedMs?: number;
}

export interface RunChartReadyEvent extends RunEventIdentity {
  type: 'chart_ready';
  chartData: RunViewModelChartData;
}

export interface RunConclusionDeltaEvent extends RunEventIdentity {
  type: 'conclusion_delta';
  delta: string;
}

export interface RunConclusionCompletedEvent extends RunEventIdentity {
  type: 'conclusion_completed';
  conclusion: string;
  agentConclusion?: RunViewModelAgentConclusion;
  modelTrace?: RunViewModelTrace;
}

export interface RunRagSourcesReadyEvent extends RunEventIdentity {
  type: 'rag_sources_ready';
  sources: RunSource[];
}

export interface RunReportPendingEvent extends RunEventIdentity {
  type: 'report_pending';
}

export interface RunCompletedEvent extends RunEventIdentity {
  type: 'run_completed';
  completedAt: string;
  elapsedMs?: number;
  modelTrace?: RunViewModelTrace;
}

export interface RunFailedEvent extends RunEventIdentity {
  type: 'run_failed';
  errorMessage: string;
  modelTrace?: RunViewModelTrace;
}

export interface RunStoppedEvent extends RunEventIdentity {
  type: 'run_stopped';
  source: 'local';
}

export type NormalizedRunEvent =
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

export type RunEvent = NormalizedRunEvent;
export type RunEventBoundaryInput = unknown;
