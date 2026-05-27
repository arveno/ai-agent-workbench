import type { ReportArtifactRecord } from '@/types/persistence';
import type { RunSource, RunSourceType } from '@/types/rag';
import type { WorkbenchMessage } from '@/types/workbench';

const SOURCE_TYPES = new Set<RunSourceType>(['knowledge', 'tool', 'report', 'manual']);

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
  const runId = getStringField(value, 'runId');
  const conversationId = getStringField(value, 'conversationId');
  const title = getStringField(value, 'title');
  const preview = getStringField(value, 'preview') ?? '';
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const sourceOrder = getNumberField(value, 'sourceOrder') ?? 0;

  if (!id) {
    return null;
  }

  if (!runId) {
    return null;
  }

  if (!conversationId) {
    return null;
  }

  if (!title) {
    return null;
  }

  const source: RunSource = {
    id,
    runId,
    conversationId,
    toolInvocationId: getStringField(value, 'toolInvocationId'),
    retrievalLogId: getStringField(value, 'retrievalLogId'),
    documentId: getStringField(value, 'documentId'),
    chunkId: getStringField(value, 'chunkId'),
    citationLabel: getStringField(value, 'citationLabel'),
    sourceOrder,
    title,
    preview,
    score: getNumberField(value, 'score'),
    sourceType: normalizeSourceType(value.sourceType),
    usedInAnswer: normalizeBoolean(value.usedInAnswer),
    noSourceReason: getStringField(value, 'noSourceReason'),
    createdAt: getStringField(value, 'createdAt') ?? '',
    metadata,
  };

  return source;
}

function readReportSources(record: ReportArtifactRecord): RunSource[] {
  if (!Array.isArray(record.sources)) {
    return [];
  }

  return record.sources
    .map((source) => normalizeReportSource(source))
    .filter((source): source is RunSource => source !== null);
}

function readReportSourceCount(record: ReportArtifactRecord, sources: RunSource[]): number {
  const sourceCount = Number(record.sourceCount);
  return Number.isFinite(sourceCount) ? sourceCount : sources.length;
}

export function reportArtifactToMessage(record: ReportArtifactRecord): WorkbenchMessage {
  const runId = record.runId.trim() || null;
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

  if (runId) {
    message.runId = runId;
  }

  return message;
}
