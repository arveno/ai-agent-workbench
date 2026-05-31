import type { RunSource } from '../../../types/rag';

export type RunViewModelMode = 'mock' | 'agent';

export type RunViewModelIntent = 'capability_intro' | 'data_analysis' | 'knowledge_qa' | 'unsupported' | 'unknown';

export type RunViewModelStatus = 'idle' | 'pending' | 'running' | 'success' | 'error' | 'stopped';

export type RunViewModelStepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'stopped';

export type RunViewModelToolStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'stopped';

export type RunViewModelConclusionSource = 'model' | 'fallback' | 'mock' | 'none';

export type RunViewModelReportState = 'hidden' | 'pending' | 'generating' | 'generated' | 'skipped' | 'failed';

export interface RunViewModelUsageCounts {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface RunViewModelUsage extends RunViewModelUsageCounts {
  usageAvailable: boolean;
  usageSource: string | null;
  usageUnavailableReason: string | null;
}

export interface RunViewModelCostEstimate {
  estimatedCost: number | null;
  currency: string | null;
  pricingUnit: string | null;
  isEstimated: boolean;
  pricingSource: string | null;
  costUnavailableReason: string | null;
}

export interface RunViewModelTrace {
  selectedModelId: string;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  usage: RunViewModelUsage;
  costEstimate: RunViewModelCostEstimate;
  fallbackReason: string | null;
  modelErrorType: string | null;
  modelHttpStatus?: number | null;
  modelErrorMessage?: string | null;
  conclusionSource: RunViewModelConclusionSource;
}

export interface RunViewModelConclusionSection {
  title?: string | null;
  markdownText: string;
  plainText: string;
}

export interface RunViewModelAgentConclusion {
  markdownText: string;
  plainText: string;
  sections?: RunViewModelConclusionSection[];
  notice?: string | null;
  rawText?: string;
}

export interface RunViewModelStep {
  id: string;
  title: string;
  description?: string;
  status: RunViewModelStepStatus;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
}

export interface RunViewModelToolInvocation {
  id: string;
  toolId: string;
  toolName: string;
  displayName: string;
  status: RunViewModelToolStatus;
  inputSummary: string;
  outputSummary: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
}

export type RunViewModelChartType = 'bar' | 'line';

export interface RunViewModelChartSeries {
  name: string;
  values: number[];
}

export interface RunViewModelChartData {
  title: string;
  chartType: RunViewModelChartType;
  labels: string[];
  series: RunViewModelChartSeries[];
  summary?: string;
}

export interface RunViewModelDataSource {
  provider: 'mock' | 'cloudbase_mysql';
  name: string;
  typeLabel: string;
  schema?: string;
  tableCount?: number;
}

export interface RunViewModelPlan {
  intent: RunViewModelIntent;
  shouldUseDataAnalysis: boolean;
  reason?: string;
  metric?: string;
  groupBy?: string;
  timeRangeLabel?: string;
  comparison?: 'none' | 'previous_month';
}

export interface RunViewModel {
  id: string;
  clientRunId?: string;
  conversationId: string;
  displayRunId: string;
  mode: RunViewModelMode;
  status: RunViewModelStatus;
  intent: RunViewModelIntent;
  prompt: string;
  plan?: RunViewModelPlan;
  dataSource?: RunViewModelDataSource;
  steps: RunViewModelStep[];
  toolInvocations: RunViewModelToolInvocation[];
  sources: RunSource[];
  chartData?: RunViewModelChartData;
  conclusion: string;
  conclusionSource: RunViewModelConclusionSource;
  agentConclusion?: RunViewModelAgentConclusion;
  modelTrace?: RunViewModelTrace;
  reportState: RunViewModelReportState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  errorMessage?: string;
}
