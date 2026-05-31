import type { NormalizedRunEvent } from '@/domain/run/boundary';
import type { RunViewModelToolInvocation } from '@/domain/run/view-model';

type RunToolEvent = Extract<
  NormalizedRunEvent,
  { type: 'tool_started' | 'tool_completed' | 'tool_failed' }
>;

function updateTool(
  toolInvocations: RunViewModelToolInvocation[],
  toolId: string,
  updater: (tool: RunViewModelToolInvocation) => RunViewModelToolInvocation,
): RunViewModelToolInvocation[] {
  return toolInvocations.map((tool) => (tool.id === toolId ? updater(tool) : tool));
}

export function reduceRunTools(
  toolInvocations: RunViewModelToolInvocation[],
  event: RunToolEvent,
): RunViewModelToolInvocation[] {
  if (event.type === 'tool_started') {
    const existingTool = toolInvocations.find((tool) => tool.id === event.tool.id);

    return existingTool
      ? updateTool(toolInvocations, event.tool.id, () => ({ ...event.tool }))
      : [...toolInvocations, { ...event.tool }];
  }

  if (event.type === 'tool_completed') {
    return updateTool(toolInvocations, event.toolId, (tool) => ({
      ...tool,
      status: 'success',
      outputSummary: event.outputSummary,
      completedAt: event.completedAt,
      elapsedMs: event.elapsedMs,
    }));
  }

  return updateTool(toolInvocations, event.toolId, (tool) => ({
    ...tool,
    status: 'error',
    outputSummary: event.errorMessage,
    completedAt: event.completedAt,
    elapsedMs: event.elapsedMs,
  }));
}

export function stopRunningTools(
  toolInvocations: RunViewModelToolInvocation[],
  stoppedAt: string,
): RunViewModelToolInvocation[] {
  return toolInvocations.map((tool) =>
    tool.status === 'running'
      ? {
          ...tool,
          status: 'stopped',
          completedAt: stoppedAt,
        }
      : tool,
  );
}
