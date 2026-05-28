import type { RunSnapshot as GeneratedRunSnapshot } from '../../../contracts/generated/workbench-contract';
import type { RunSource } from '../../types/rag';
import type { RunContractSnapshot } from './contract';
import type {
  RunViewModel,
  RunViewModelConclusionSource,
  RunViewModelReportState,
  RunViewModelStatus,
  RunViewModelStep,
  RunViewModelToolInvocation,
} from './view-model';

type Assert<T extends true> = T;

type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

export type RunTypeBoundaryAssertions = [
  Assert<IsEqual<RunContractSnapshot, GeneratedRunSnapshot>>,
  Assert<IsEqual<RunViewModel['sessionId'], string>>,
  Assert<IsEqual<RunViewModel['displayRunId'], string>>,
  Assert<IsEqual<RunViewModel['status'], RunViewModelStatus>>,
  Assert<IsEqual<RunViewModel['steps'], RunViewModelStep[]>>,
  Assert<IsEqual<RunViewModel['toolInvocations'], RunViewModelToolInvocation[]>>,
  Assert<IsEqual<RunViewModel['sources'], RunSource[]>>,
  Assert<IsEqual<RunViewModel['conclusion'], string>>,
  Assert<IsEqual<RunViewModel['conclusionSource'], RunViewModelConclusionSource>>,
  Assert<IsEqual<RunViewModel['reportState'], RunViewModelReportState>>,
];
