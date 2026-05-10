import type { RunEvent, RunSnapshot, RunStep, RunToolInvocation } from '@/types/run';

function nowIso(): string {
  return new Date().toISOString();
}

function isRunIdMatched(currentRun: RunSnapshot | null, runId: string): currentRun is RunSnapshot {
  return Boolean(currentRun && currentRun.id === runId);
}

function withUpdatedAt(run: RunSnapshot, updatedAt = nowIso()): RunSnapshot {
  return {
    ...run,
    updatedAt,
  };
}

function updateStep(
  steps: RunStep[],
  stepId: string,
  updater: (step: RunStep) => RunStep,
): RunStep[] {
  return steps.map((step) => (step.id === stepId ? updater(step) : step));
}

function updateTool(
  toolInvocations: RunToolInvocation[],
  toolId: string,
  updater: (tool: RunToolInvocation) => RunToolInvocation,
): RunToolInvocation[] {
  return toolInvocations.map((tool) => (tool.id === toolId ? updater(tool) : tool));
}

export function applyRunEventToSnapshot(currentRun: RunSnapshot | null, event: RunEvent): RunSnapshot | null {
  if (event.type === 'run_started') {
    const updatedAt = event.run.updatedAt || nowIso();

    return {
      ...event.run,
      status: event.run.status === 'idle' ? 'pending' : event.run.status,
      updatedAt,
    };
  }

  if (!isRunIdMatched(currentRun, event.runId)) {
    return currentRun;
  }

  if (event.type === 'step_started') {
    const existingStep = currentRun.steps.find((step) => step.id === event.stepId);
    const nextStep: RunStep = {
      id: event.stepId,
      title: event.title,
      description: event.description,
      status: 'running',
      startedAt: event.startedAt,
    };
    const nextSteps = existingStep
      ? updateStep(currentRun.steps, event.stepId, (step) => ({
          ...step,
          title: event.title,
          description: event.description,
          status: 'running',
          startedAt: event.startedAt,
        }))
      : [...currentRun.steps, nextStep];

    return withUpdatedAt({
      ...currentRun,
      status: 'running',
      steps: nextSteps,
    });
  }

  if (event.type === 'step_completed') {
    return withUpdatedAt({
      ...currentRun,
      steps: updateStep(currentRun.steps, event.stepId, (step) => ({
        ...step,
        status: 'success',
        completedAt: event.completedAt,
        elapsedMs: event.elapsedMs,
      })),
    });
  }

  if (event.type === 'tool_started') {
    const existingTool = currentRun.toolInvocations.find((tool) => tool.id === event.tool.id);
    const nextTools = existingTool
      ? updateTool(currentRun.toolInvocations, event.tool.id, () => ({ ...event.tool }))
      : [...currentRun.toolInvocations, { ...event.tool }];

    return withUpdatedAt({
      ...currentRun,
      status: 'running',
      toolInvocations: nextTools,
    });
  }

  if (event.type === 'tool_completed') {
    return withUpdatedAt({
      ...currentRun,
      toolInvocations: updateTool(currentRun.toolInvocations, event.toolId, (tool) => ({
        ...tool,
        status: 'success',
        outputSummary: event.outputSummary,
        completedAt: event.completedAt,
        elapsedMs: event.elapsedMs,
      })),
    });
  }

  if (event.type === 'chart_ready') {
    return withUpdatedAt({
      ...currentRun,
      chartData: event.chartData,
    });
  }

  if (event.type === 'conclusion_delta') {
    return withUpdatedAt({
      ...currentRun,
      conclusion: `${currentRun.conclusion || ''}${event.delta}`,
    });
  }

  if (event.type === 'conclusion_completed') {
    return withUpdatedAt({
      ...currentRun,
      conclusion: event.conclusion,
      conclusionSource: event.conclusionSource,
      conclusionNotice: event.conclusionNotice,
    });
  }

  if (event.type === 'report_pending') {
    return withUpdatedAt({
      ...currentRun,
      reportState: 'pending',
    });
  }

  if (event.type === 'run_completed') {
    return withUpdatedAt(
      {
        ...currentRun,
        status: 'success',
        completedAt: event.completedAt,
        elapsedMs: event.elapsedMs,
      },
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
        steps: currentRun.steps.map((step) =>
          step.status === 'running'
            ? {
                ...step,
                status: 'stopped',
                completedAt: stoppedAt,
              }
            : step,
        ),
        toolInvocations: currentRun.toolInvocations.map((tool) =>
          tool.status === 'running'
            ? {
                ...tool,
                status: 'stopped',
                completedAt: stoppedAt,
              }
            : tool,
        ),
      },
      stoppedAt,
    );
  }

  return currentRun;
}
