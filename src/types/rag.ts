export type RunSourceType = 'knowledge' | 'tool' | 'report' | 'manual';

export interface RunSource {
  id: string;
  runId: string;
  conversationId: string;
  toolInvocationId?: string;
  retrievalLogId?: string;
  documentId?: string;
  chunkId?: string;
  citationLabel?: string;
  sourceOrder: number;
  title: string;
  preview: string;
  score?: number;
  sourceType: RunSourceType;
  usedInAnswer?: boolean;
  noSourceReason?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
