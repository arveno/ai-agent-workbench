import type { ReportArtifactRecord } from '@/types/persistence';
import type { RunSource, RunSourceType } from '@/types/rag';
import type { WorkbenchMessage } from '@/types/workbench';

const SOURCE_TYPES = new Set<RunSourceType>(['knowledge', 'tool', 'report', 'manual']);

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getNumberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) ? normalizedValue : undefined;
}

function normalizeSourceType(value: unknown): RunSourceType {
  const sourceType = typeof value === 'string' ? value : 'knowledge';
  return SOURCE_TYPES.has(sourceType as RunSourceType) ? (sourceType as RunSourceType) : 'knowledge';
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function normalizeReportSource(value: unknown): RunSource | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getStringField(value, 'id');
  const runId = getStringField(value, 'runId', 'run_id');
  const conversationId = getStringField(value, 'conversationId', 'conversation_id');
  const title = getStringField(value, 'title');
  const preview = getStringField(value, 'preview') ?? '';
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const sourceOrder =
    getNumberField(value, 'sourceOrder') ??
    getNumberField(value, 'source_order') ??
    getNumberField(metadata, 'sourceOrder');

  if (!id || !runId || !conversationId || !title) {
    return null;
  }

  const source: RunSource = {
    id,
    runId,
    conversationId,
    toolInvocationId: getStringField(value, 'toolInvocationId', 'tool_invocation_id'),
    retrievalLogId: getStringField(value, 'retrievalLogId', 'retrieval_log_id'),
    documentId: getStringField(value, 'documentId', 'document_id'),
    chunkId: getStringField(value, 'chunkId', 'chunk_id'),
    citationLabel: getStringField(value, 'citationLabel', 'citation_label'),
    sourceOrder,
    title,
    preview,
    score: getNumberField(value, 'score'),
    sourceType: normalizeSourceType(value.sourceType ?? value.source_type),
    usedInAnswer: normalizeBoolean(value.usedInAnswer ?? value.used_in_answer),
    noSourceReason: getStringField(value, 'noSourceReason', 'no_source_reason'),
    createdAt: getStringField(value, 'createdAt', 'created_at') ?? '',
    metadata,
  };

  return source;
}

function readReportSources(record: ReportArtifactRecord): RunSource[] {
  if (Array.isArray(record.sources)) {
    return record.sources
      .map((source) => normalizeReportSource(source))
      .filter((source): source is RunSource => source !== null);
  }

  if (Array.isArray(record.metadata.sources)) {
    return record.metadata.sources
      .map((source) => normalizeReportSource(source))
      .filter((source): source is RunSource => source !== null);
  }

  return [];
}

function readReportSourceCount(record: ReportArtifactRecord, sources: RunSource[]): number {
  const sourceCount = Number(record.sourceCount ?? record.metadata.sourceCount);
  return Number.isFinite(sourceCount) ? sourceCount : sources.length;
}

export function reportArtifactToMessage(record: ReportArtifactRecord): WorkbenchMessage {
  const runtimeRunId = getMetadataString(record.metadata, 'runtimeRunId');
  const dbRunId = record.run_id?.trim() || null;
  const clientMessageId = `report_artifact_${record.id}`;
  const reportSources = readReportSources(record);
  const message: WorkbenchMessage = {
    id: clientMessageId,
    clientMessageId,
    role: 'assistant',
    kind: 'report',
    content: record.content_markdown,
    createdAt: toTimestamp(record.created_at),
    reportSources,
    reportSourceCount: readReportSourceCount(record, reportSources),
  };

  if (dbRunId || runtimeRunId) {
    message.runId = dbRunId || runtimeRunId;
  }

  return message;
}
