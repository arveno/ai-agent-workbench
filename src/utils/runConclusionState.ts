import type {
  RunViewModel,
  RunViewModelAgentConclusion,
  RunViewModelTrace,
} from '@/domain/run/view-model';

export type RunConclusionStateEvent =
  | {
      type: 'conclusion_delta';
      delta: string;
    }
  | {
      type: 'conclusion_completed';
      conclusion: string;
      agentConclusion?: RunViewModelAgentConclusion;
      modelTrace?: RunViewModelTrace;
    };

function withModelTrace(run: RunViewModel, modelTrace?: RunViewModelTrace): RunViewModel {
  if (!modelTrace) {
    return run;
  }

  return {
    ...run,
    modelTrace: {
      ...run.modelTrace,
      ...modelTrace,
    },
  };
}

export function reduceRunConclusionState(run: RunViewModel, event: RunConclusionStateEvent): RunViewModel {
  if (event.type === 'conclusion_delta') {
    return {
      ...run,
      conclusion: `${run.conclusion || ''}${event.delta}`,
    };
  }

  const conclusionSource = event.modelTrace?.conclusionSource ?? run.modelTrace?.conclusionSource ?? 'none';

  return withModelTrace(
    {
      ...run,
      conclusion: event.conclusion,
      conclusionSource,
      ...(event.agentConclusion ? { agentConclusion: event.agentConclusion } : {}),
    },
    event.modelTrace,
  );
}
