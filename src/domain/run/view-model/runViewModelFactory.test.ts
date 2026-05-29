import type { RunSource } from '../../../types/rag';
import type { RunViewModel } from './types';
import { RunViewModelFactory } from './runViewModelFactory';

type Assert<T extends true> = T;

type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

const factoryRun = RunViewModelFactory.fromRunStartedInput({
  id: 'run_factory_test',
  conversationId: 'conversation_factory_test',
  mode: 'agent',
  status: 'running',
  intent: 'unknown',
  prompt: 'factory type boundary',
});

export const runViewModelFactoryDefaultAssertions = {
  conversationId: factoryRun.conversationId,
  displayRunId: factoryRun.displayRunId,
  sourcesLength: factoryRun.sources.length,
};

export type RunViewModelFactoryAssertions = [
  Assert<IsEqual<typeof factoryRun, RunViewModel>>,
  Assert<IsEqual<typeof factoryRun.conversationId, string>>,
  Assert<IsEqual<typeof factoryRun.displayRunId, string>>,
  Assert<IsEqual<typeof factoryRun.sources, RunSource[]>>,
];

// @ts-expect-error conversationId is required and cannot be inferred from any UI session field.
RunViewModelFactory.fromRunStartedInput({
  id: 'run_missing_conversation',
  mode: 'agent',
  status: 'running',
  intent: 'unknown',
  prompt: 'missing conversationId',
});
