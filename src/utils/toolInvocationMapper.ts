import type { ToolInvocationRecord } from '@/types/persistence';
import type { RunToolInvocation, RunToolStatus } from '@/types/run';

function mapToolStatus(status: ToolInvocationRecord['status']): RunToolStatus {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'skipped') return 'skipped';
  if (status === 'pending') return 'pending';
  return 'running';
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

export function toolInvocationRecordToRunTool(record: ToolInvocationRecord): RunToolInvocation {
  const runtimeToolId = getMetadataString(record.metadata, 'runtimeToolId');
  const toolId = getMetadataString(record.metadata, 'toolId') || record.tool_name;

  return {
    id: runtimeToolId || record.id,
    toolId,
    toolName: record.tool_name,
    displayName: record.display_name,
    status: mapToolStatus(record.status),
    inputSummary: record.input_summary ?? '',
    outputSummary: record.output_summary ?? '',
    startedAt: record.started_at,
    completedAt: record.finished_at ?? undefined,
    elapsedMs: record.elapsed_ms ?? undefined,
  };
}
