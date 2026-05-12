export interface RagSourceChunk {
  id: string;
  documentTitle: string;
  chunkTitle?: string;
  contentPreview: string;
  score?: number;
  citationLabel: string;
  usedInAnswer: boolean;
  sourceType: 'knowledge_base' | 'document' | 'database_note' | 'policy';
  sourceName?: string;
  isMock?: boolean;
  updatedAt?: string;
}
