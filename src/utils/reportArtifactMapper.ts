import type { ReportArtifactRecord } from '@/types/persistence';
import type { WorkbenchMessage } from '@/types/workbench';

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export function reportArtifactToMessage(record: ReportArtifactRecord): WorkbenchMessage {
  const runtimeRunId = getMetadataString(record.metadata, 'runtimeRunId');
  const message: WorkbenchMessage = {
    id: `report_artifact_${record.id}`,
    role: 'assistant',
    kind: 'report',
    content: record.content_markdown,
    createdAt: toTimestamp(record.created_at),
  };

  if (runtimeRunId) {
    message.runId = runtimeRunId;
  }

  return message;
}
