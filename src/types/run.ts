import type { RunSource } from './rag';

export type RunMode = 'mock' | 'agent';

export type RunIntent = 'capability_intro' | 'data_analysis' | 'knowledge_qa' | 'unsupported' | 'unknown';

export type RunSnapshotStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

export type RunStatus = 'idle' | 'pending' | 'running' | 'success' | 'error' | 'stopped';

export type RunStepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'stopped';

export type RunToolStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'stopped';

export type RunConclusionSource = 'model' | 'fallback' | 'mock' | 'none';

export type RunReportState = 'hidden' | 'pending' | 'generating' | 'generated' | 'skipped' | 'failed';

export interface RunModelUsageCounts {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface RunModelUsage extends RunModelUsageCounts {
  usageAvailable: boolean;
  usageSource: string | null;
  usageUnavailableReason: string | null;
}

export interface RunModelCostEstimate {
  estimatedCost: number | null;
  currency: string | null;
  pricingUnit: string | null;
  isEstimated: boolean;
  pricingSource: string | null;
  costUnavailableReason: string | null;
}

export interface RunModelTrace {
  selectedModelId: string;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  usage: RunModelUsage;
  costEstimate: RunModelCostEstimate;
  fallbackReason: string | null;
  modelErrorType: string | null;
  modelHttpStatus?: number | null;
  modelErrorMessage?: string | null;
  conclusionSource: RunConclusionSource;
}

export interface AgentConclusionSection {
  title?: string | null;
  markdownText: string;
  plainText: string;
}

export interface AgentConclusion {
  markdownText: string;
  plainText: string;
  sections?: AgentConclusionSection[];
  notice?: string | null;
  rawText?: string;
}

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
  provider: 'mock' | 'cloudbase_mysql';
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
  conversationId: string;
  clientRunId?: string | null;
  usageId?: string | null;
  mode: RunMode;
  status: RunSnapshotStatus;
  intent?: RunIntent;
  prompt?: string;
  plan?: RunPlanSnapshot;
  dataSource?: RunDataSourceSnapshot;
  chartData?: RunChartData;
  agentConclusion?: AgentConclusion | null;
  modelTrace: RunModelTrace | null;
  reportState: RunReportState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  errorMessage?: string;
}

export interface RunStartedInitialView {
  steps?: RunStep[];
  toolInvocations?: RunToolInvocation[];
  sources?: RunSource[];
  conclusion?: string;
}

export interface RunViewModel {
  id: string;
  clientRunId?: string;
  displayRunId: string;
  sessionId: string;
  mode: RunMode;
  status: RunStatus;
  intent: RunIntent;
  prompt: string;
  plan?: RunPlanSnapshot;
  dataSource?: RunDataSourceSnapshot;
  steps: RunStep[];
  toolInvocations: RunToolInvocation[];
  sources?: RunSource[];
  chartData?: RunChartData;
  conclusion: string;
  conclusionSource: RunConclusionSource;
  agentConclusion?: AgentConclusion;
  modelTrace?: RunModelTrace;
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
  runId?: string;
  usageId?: string | null;
  clientRunId?: string | null;
  conversationId?: string | null;
  timestamp?: string;
  run: RunSnapshot;
  initialView?: RunStartedInitialView;
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
    reportState?: RunReportState;
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
  agentConclusion?: AgentConclusion;
  modelTrace?: RunModelTrace;
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
  modelTrace?: RunModelTrace;
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
