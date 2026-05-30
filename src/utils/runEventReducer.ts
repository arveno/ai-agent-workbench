import type { NormalizedRunEvent } from '@/domain/run/boundary';
import type {
  RunViewModel,
  RunViewModelTrace,
} from '@/domain/run/view-model';
import { RunViewModelFactory } from '@/domain/run/view-model';
import { reduceRunChartData } from './runChartState';
import { reduceRunConclusionState } from './runConclusionState';
import { reduceRunReportState } from './runReportState';
import { reduceRunSources } from './runSourcesState';
import {
  reduceRunSteps,
  stopRunningSteps,
} from './runStepsState';
import {
  reduceRunTools,
  stopRunningTools,
} from './runToolsState';

function nowIso(): string {
  return new Date().toISOString();
}

function isRunIdMatched(currentRun: RunViewModel | null, runId: string): currentRun is RunViewModel {
  return Boolean(currentRun && currentRun.id === runId);
}

function isRunReusedEventForCurrentRun(
  currentRun: RunViewModel,
  event: Extract<NormalizedRunEvent, { type: 'run_reused' }>,
): boolean {
  const clientRunId = event.clientRunId?.trim();

  if (clientRunId && currentRun.id === clientRunId) {
    return true;
  }

  return currentRun.id === event.runId;
}

function withUpdatedAt(run: RunViewModel, updatedAt = nowIso()): RunViewModel {
  return {
    ...run,
    updatedAt,
  };
}

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

function applyRunStartedEvent(
  currentRun: RunViewModel | null,
  event: Extract<NormalizedRunEvent, { type: 'run_started' }>,
): RunViewModel | null {
  const conversationId = event.conversationId?.trim();

  if (!conversationId) {
    return currentRun;
  }

  const runViewModel = RunViewModelFactory.fromRunStartedInput({
    id: event.runId,
    conversationId,
    clientRunId: event.clientRunId,
    displayRunId: event.run.displayRunId,
    mode: event.run.mode,
    status: event.run.status ?? 'running',
    intent: event.run.intent,
    prompt: event.run.prompt,
    plan: event.run.plan,
    dataSource: event.run.dataSource,
    steps: event.run.steps,
    toolInvocations: event.run.toolInvocations,
    sources: event.run.sources,
    chartData: event.run.chartData,
    conclusion: event.run.conclusion,
    conclusionSource: event.run.conclusionSource,
    agentConclusion: event.run.agentConclusion,
    modelTrace: event.run.modelTrace,
    reportState: event.run.reportState,
    createdAt: event.run.createdAt ?? event.timestamp,
    updatedAt: event.run.updatedAt ?? event.timestamp,
    startedAt: event.run.startedAt,
    completedAt: event.run.completedAt,
    elapsedMs: event.run.elapsedMs,
    errorMessage: event.run.errorMessage,
  });
  const updatedAt = runViewModel.updatedAt;

  return {
    ...runViewModel,
    status: runViewModel.status === 'idle' ? 'pending' : runViewModel.status,
    updatedAt,
  };
}

function applyRunReusedEvent(
  currentRun: RunViewModel | null,
  event: Extract<NormalizedRunEvent, { type: 'run_reused' }>,
): RunViewModel | null {
  if (!currentRun) {
    return currentRun;
  }

  if (!isRunReusedEventForCurrentRun(currentRun, event)) {
    return currentRun;
  }

  return withUpdatedAt(
    {
      ...currentRun,
      status: event.status ?? 'running',
      completedAt: event.existingRun?.completedAt ?? currentRun.completedAt,
    },
    event.timestamp ?? nowIso(),
  );
}

export function applyRunEventToViewModel(currentRun: RunViewModel | null, event: NormalizedRunEvent): RunViewModel | null {
  if (event.type === 'run_started') {
    return applyRunStartedEvent(currentRun, event);
  }

  if (event.type === 'run_reused') {
    return applyRunReusedEvent(currentRun, event);
  }

  if (!isRunIdMatched(currentRun, event.runId)) {
    return currentRun;
  }

  if (event.type === 'step_started' || event.type === 'step_completed' || event.type === 'step_failed') {
    return withUpdatedAt({
      ...currentRun,
      ...(event.type === 'step_started' ? { status: 'running' as const } : {}),
      steps: reduceRunSteps(currentRun.steps, event),
    });
  }

  if (event.type === 'tool_started' || event.type === 'tool_completed' || event.type === 'tool_failed') {
    return withUpdatedAt({
      ...currentRun,
      ...(event.type === 'tool_started' ? { status: 'running' as const } : {}),
      toolInvocations: reduceRunTools(currentRun.toolInvocations, event),
    });
  }

  if (event.type === 'chart_ready') {
    return withUpdatedAt({
      ...currentRun,
      chartData: reduceRunChartData(event),
    });
  }

  if (event.type === 'conclusion_delta' || event.type === 'conclusion_completed') {
    if (event.type === 'conclusion_delta') {
      return withUpdatedAt(reduceRunConclusionState(currentRun, event));
    }

    return withUpdatedAt(reduceRunConclusionState(currentRun, event));
  }

  if (event.type === 'rag_sources_ready') {
    return withUpdatedAt({
      ...currentRun,
      sources: reduceRunSources(event),
    });
  }

  if (event.type === 'report_pending') {
    return withUpdatedAt({
      ...currentRun,
      reportState: reduceRunReportState(),
    });
  }

  if (event.type === 'run_completed') {
    return withUpdatedAt(
      withModelTrace(
        {
          ...currentRun,
          status: 'success',
          completedAt: event.completedAt,
          elapsedMs: event.elapsedMs,
        },
        event.modelTrace,
      ),
      event.completedAt,
    );
  }

  if (event.type === 'run_failed') {
    return withUpdatedAt({
      ...currentRun,
      status: 'error',
      errorMessage: event.errorMessage,
    });
  }

  if (event.type === 'run_stopped') {
    const stoppedAt = nowIso();

    return withUpdatedAt(
      {
        ...currentRun,
        status: 'stopped',
        steps: stopRunningSteps(currentRun.steps, stoppedAt),
        toolInvocations: stopRunningTools(currentRun.toolInvocations, stoppedAt),
      },
      stoppedAt,
    );
  }

  return currentRun;
}
