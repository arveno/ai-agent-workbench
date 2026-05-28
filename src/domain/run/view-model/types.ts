import type { RunSource } from '../../../types/rag';
import type {
  AgentConclusion,
  RunChartData,
  RunConclusionSource,
  RunDataSourceSnapshot,
  RunIntent,
  RunMode,
  RunModelTrace,
  RunPlanSnapshot,
  RunReportState,
  RunStatus,
  RunStep,
  RunToolInvocation,
} from '../../../types/run';

export type RunViewModelStatus = RunStatus;
export type RunViewModelConclusionSource = RunConclusionSource;
export type RunViewModelReportState = RunReportState;
export type RunViewModelStep = RunStep;
export type RunViewModelToolInvocation = RunToolInvocation;

export interface RunViewModel {
  id: string;
  clientRunId?: string;
  sessionId: string;
  displayRunId: string;
  mode: RunMode;
  status: RunViewModelStatus;
  intent: RunIntent;
  prompt: string;
  plan?: RunPlanSnapshot;
  dataSource?: RunDataSourceSnapshot;
  steps: RunViewModelStep[];
  toolInvocations: RunViewModelToolInvocation[];
  sources: RunSource[];
  chartData?: RunChartData;
  conclusion: string;
  conclusionSource: RunViewModelConclusionSource;
  agentConclusion?: AgentConclusion;
  modelTrace?: RunModelTrace;
  reportState: RunViewModelReportState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  errorMessage?: string;
}
