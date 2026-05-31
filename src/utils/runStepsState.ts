import type { NormalizedRunEvent } from '@/domain/run/boundary';
import type { RunViewModelStep } from '@/domain/run/view-model';

type RunStepEvent = Extract<
  NormalizedRunEvent,
  { type: 'step_started' | 'step_completed' | 'step_failed' }
>;

function updateStep(
  steps: RunViewModelStep[],
  stepId: string,
  updater: (step: RunViewModelStep) => RunViewModelStep,
): RunViewModelStep[] {
  return steps.map((step) => (step.id === stepId ? updater(step) : step));
}

export function reduceRunSteps(steps: RunViewModelStep[], event: RunStepEvent): RunViewModelStep[] {
  if (event.type === 'step_started') {
    const existingStep = steps.find((step) => step.id === event.stepId);
    const nextStep: RunViewModelStep = {
      id: event.stepId,
      title: event.title,
      description: event.description,
      status: 'running',
      startedAt: event.startedAt,
    };

    return existingStep
      ? updateStep(steps, event.stepId, (step) => ({
          ...step,
          title: event.title,
          description: event.description,
          status: 'running',
          startedAt: event.startedAt,
        }))
      : [...steps, nextStep];
  }

  if (event.type === 'step_completed') {
    return updateStep(steps, event.stepId, (step) => ({
      ...step,
      status: 'success',
      completedAt: event.completedAt,
      elapsedMs: event.elapsedMs,
    }));
  }

  return updateStep(steps, event.stepId, (step) => ({
    ...step,
    status: 'error',
    description: event.errorMessage,
    completedAt: event.completedAt,
    elapsedMs: event.elapsedMs,
  }));
}

export function stopRunningSteps(steps: RunViewModelStep[], stoppedAt: string): RunViewModelStep[] {
  return steps.map((step) =>
    step.status === 'running'
      ? {
          ...step,
          status: 'stopped',
          completedAt: stoppedAt,
        }
      : step,
  );
}
