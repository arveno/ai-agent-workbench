import type { RunSnapshot } from '../../../contracts/generated/workbench-contract';
import type { RunSource } from '../../types/rag';
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

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;
type IsNotEqual<A, B> = IsEqual<A, B> extends true ? false : true;

export type RunTypeBoundaryAssertions = [
  Assert<IsNotEqual<RunSnapshot, RunViewModel>>,
  Assert<IsEqual<HasKey<RunSnapshot, 'sessionId'>, false>>,
  Assert<IsEqual<RunSnapshot['conversationId'], string>>,
  Assert<IsEqual<HasKey<RunSnapshot, 'displayRunId'>, false>>,
  Assert<IsEqual<HasKey<RunSnapshot, 'steps'>, false>>,
  Assert<IsEqual<HasKey<RunSnapshot, 'toolInvocations'>, false>>,
  Assert<IsEqual<HasKey<RunSnapshot, 'sources'>, false>>,
  Assert<IsEqual<HasKey<RunViewModel, 'sessionId'>, false>>,
  Assert<IsEqual<RunViewModel['conversationId'], string>>,
  Assert<IsEqual<RunViewModel['displayRunId'], string>>,
  Assert<IsEqual<RunViewModel['status'], RunViewModelStatus>>,
  Assert<IsEqual<RunViewModel['steps'], RunViewModelStep[]>>,
  Assert<IsEqual<RunViewModel['toolInvocations'], RunViewModelToolInvocation[]>>,
  Assert<IsEqual<RunViewModel['sources'], RunSource[]>>,
  Assert<IsEqual<RunViewModel['conclusion'], string>>,
  Assert<IsEqual<RunViewModel['conclusionSource'], RunViewModelConclusionSource>>,
  Assert<IsEqual<RunViewModel['reportState'], RunViewModelReportState>>,
];
