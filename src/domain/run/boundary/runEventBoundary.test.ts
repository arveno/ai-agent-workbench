import { createLocalRunStoppedEvent, normalizeRunEvent } from './runEventBoundary';
import type { NormalizedRunEvent, RunStartedEvent } from './types';

type Assert<T extends true> = T;

type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

const normalizedFlatRunStarted = normalizeRunEvent(
  {
    type: 'run_started',
    runId: 'run_boundary_test',
    conversationId: 'conversation_boundary_test',
    timestamp: '2026-05-29T00:00:00.000Z',
    run: {
      id: 'run_boundary_test',
      mode: 'agent',
      status: 'running',
      prompt: 'boundary test',
    },
  },
  { source: 'runtime' },
);

const normalizedEnvelopeRunCompleted = normalizeRunEvent({
  type: 'run_completed',
  runId: 'run_boundary_test',
  conversationId: 'conversation_boundary_test',
  timestamp: '2026-05-29T00:00:01.000Z',
  payload: {
    completedAt: '2026-05-29T00:00:01.000Z',
    elapsedMs: 1000,
  },
});

const ignoredRuntimeRunStopped = normalizeRunEvent(
  {
    type: 'run_stopped',
    runId: 'run_boundary_test',
  },
  { source: 'runtime' },
);

const localRunStopped = createLocalRunStoppedEvent('run_boundary_test');

export const runEventBoundaryAssertions = {
  flatRunStartedType: normalizedFlatRunStarted?.type,
  flatRunStartedRunId: normalizedFlatRunStarted?.runId,
  envelopeRunCompletedType: normalizedEnvelopeRunCompleted?.type,
  runtimeRunStoppedIgnored: ignoredRuntimeRunStopped,
  localRunStoppedSource: localRunStopped.source,
};

export type RunEventBoundaryAssertions = [
  Assert<IsEqual<RunStartedEvent['runId'], string>>,
  Assert<IsEqual<RunStartedEvent['conversationId'], string>>,
  Assert<IsEqual<Extract<NormalizedRunEvent, { type: 'run_stopped' }>['source'], 'local'>>,
];

// @ts-expect-error Normalized run_started events must carry event-level runId.
const missingRunId: RunStartedEvent = {
  type: 'run_started',
  conversationId: 'conversation_boundary_test',
  run: {
    id: 'run_boundary_test',
    mode: 'agent',
  },
};

void missingRunId;
