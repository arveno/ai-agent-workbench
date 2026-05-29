import { RunViewModelFactory } from '@/domain/run/view-model';
import type { RunStartedEvent } from '@/types/run';

export function createAgentPendingRunStartedEvent(params: {
  runId: string;
  prompt: string;
  conversationId: string;
}): RunStartedEvent {
  const timestamp = new Date().toISOString();

  return {
    type: 'run_started',
    runId: params.runId,
    clientRunId: params.runId,
    conversationId: params.conversationId,
    timestamp,
    run: RunViewModelFactory.fromPendingAgentRun({
      runId: params.runId,
      prompt: params.prompt,
      conversationId: params.conversationId,
      timestamp,
    }),
  };
}
