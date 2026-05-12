import type { RagRetrievalLogRecord, RagSourceCitationRecord } from '@/types/persistence';
import type { RagSourceChunk } from '@/types/rag';

function toCitationLabel(citationId: string): string {
  const normalizedCitationId = citationId.trim();

  if (!normalizedCitationId) {
    return '[S?]';
  }

  return normalizedCitationId.startsWith('[') ? normalizedCitationId : `[${normalizedCitationId}]`;
}

function citationRecordToSource(record: RagSourceCitationRecord, retrievalCreatedAt?: string): RagSourceChunk {
  return {
    id: record.chunkId,
    documentTitle: record.title,
    contentPreview: record.content,
    score: record.score,
    citationLabel: toCitationLabel(record.citationId),
    usedInAnswer: true,
    sourceType: 'policy',
    sourceName: record.sourceName,
    updatedAt: retrievalCreatedAt ? retrievalCreatedAt.slice(0, 10) : undefined,
  };
}

export function ragRetrievalLogsToSources(records: RagRetrievalLogRecord[]): RagSourceChunk[] {
  const sourceMap = new Map<string, RagSourceChunk>();

  for (const record of records) {
    for (const result of record.results) {
      if (!sourceMap.has(result.chunkId)) {
        sourceMap.set(result.chunkId, citationRecordToSource(result, record.created_at));
      }
    }
  }

  return [...sourceMap.values()];
}
