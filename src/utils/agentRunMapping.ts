import { RunViewModelFactory } from '@/domain/run/view-model';
import type { RunStartedEvent } from '@/types/run';

export function createAgentPendingRunStartedEvent(params: {
  runId: string;
  prompt: string;
  sessionId: string;
}): RunStartedEvent {
  const timestamp = new Date().toISOString();

  return {
    type: 'run_started',
    runId: params.runId,
    clientRunId: params.runId,
    conversationId: params.sessionId,
    timestamp,
    run: RunViewModelFactory.fromPendingAgentRun({
      runId: params.runId,
      prompt: params.prompt,
      sessionId: params.sessionId,
      timestamp,
    }),
  };
}
