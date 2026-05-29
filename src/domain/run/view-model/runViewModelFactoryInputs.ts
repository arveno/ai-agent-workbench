import type { AgentConclusion, ModelTrace, RunSnapshot } from '../../../../contracts/generated/workbench-contract';
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
} from './types';

export type RunViewModelFactoryStatusInput = RunViewModelStatus | RunSnapshot['status'];

export interface RunViewModelCreateInput {
  id: string;
  sessionId: string;
  mode: RunViewModelMode;
  status: RunViewModelFactoryStatusInput;
  intent: RunViewModelIntent;
  prompt: string;
  clientRunId?: string | null;
  displayRunId?: string | null;
  plan?: RunViewModelPlan;
  dataSource?: RunViewModelDataSource;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  chartData?: RunViewModelChartData;
  conclusion?: string | null;
  conclusionSource?: RunViewModelConclusionSource | null;
  agentConclusion?: AgentConclusion | RunViewModelAgentConclusion | null;
  modelTrace?: ModelTrace | RunViewModelTrace | null;
  reportState?: RunViewModelReportState | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  elapsedMs?: number | null;
  errorMessage?: string | null;
}

export interface CanonicalRunViewModelInput {
  run: RunSnapshot;
  sessionId: string;
  displayRunId?: string | null;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  conclusion?: string | null;
  conclusionSource?: RunViewModelConclusionSource | null;
  agentConclusion?: AgentConclusion | RunViewModelAgentConclusion | null;
  modelTrace?: ModelTrace | RunViewModelTrace | null;
}

export interface RunStartedViewModelInput {
  id: string;
  sessionId: string;
  mode: RunViewModelMode;
  status: RunViewModelFactoryStatusInput;
  intent?: RunViewModelIntent | null;
  prompt?: string | null;
  clientRunId?: string | null;
  displayRunId?: string | null;
  plan?: RunViewModelPlan;
  dataSource?: RunViewModelDataSource;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  chartData?: RunViewModelChartData;
  conclusion?: string | null;
  conclusionSource?: RunViewModelConclusionSource | null;
  agentConclusion?: AgentConclusion | RunViewModelAgentConclusion | null;
  modelTrace?: ModelTrace | RunViewModelTrace | null;
  reportState?: RunViewModelReportState | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  elapsedMs?: number | null;
  errorMessage?: string | null;
}

export interface PendingAgentRunInput {
  runId: string;
  prompt: string;
  sessionId: string;
  timestamp?: string;
}

export interface MockRunInput {
  runId: string;
  prompt: string;
  sessionId: string;
  plan: RunViewModelPlan;
  dataSource: RunViewModelDataSource;
  steps: RunViewModelStep[];
  sources?: RunSource[];
  modelTrace?: RunViewModelTrace;
  timestamp?: string;
}

export interface DemoSeedRunAdapterInput {
  id: string;
  sessionId: string;
  fallbackPrompt: string;
  fallbackCreatedAt: string;
  fallbackUpdatedAt: string;
  clientRunId?: string | null;
  displayRunId?: string | null;
  mode?: RunViewModelMode | null;
  status?: RunViewModelFactoryStatusInput | null;
  intent?: RunViewModelIntent | null;
  prompt?: string | null;
  plan?: RunViewModelPlan;
  dataSource?: RunViewModelDataSource;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  chartData?: RunViewModelChartData;
  conclusion?: string | null;
  conclusionSource?: RunViewModelConclusionSource | null;
  agentConclusion?: RunViewModelAgentConclusion | null;
  modelTrace?: RunViewModelTrace | null;
  reportState?: RunViewModelReportState | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  elapsedMs?: number | null;
  errorMessage?: string | null;
}

export interface RestoredRunAdapterInput {
  id: string;
  sessionId: string;
  mode: RunViewModelMode;
  status: RunViewModelStatus;
  intent: RunViewModelIntent;
  prompt: string;
  conclusion: string;
  conclusionSource: RunViewModelConclusionSource;
  reportState: RunViewModelReportState;
  createdAt: string;
  updatedAt: string;
  clientRunId?: string | null;
  displayRunId?: string | null;
  plan?: RunViewModelPlan;
  dataSource?: RunViewModelDataSource;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  chartData?: RunViewModelChartData;
  agentConclusion?: RunViewModelAgentConclusion | null;
  modelTrace?: ModelTrace | RunViewModelTrace | null;
  startedAt?: string | null;
  completedAt?: string | null;
  elapsedMs?: number | null;
  errorMessage?: string | null;
}
