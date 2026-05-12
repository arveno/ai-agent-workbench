/// <reference types="node" />

import { getSupabaseAdminClient } from '../auth/supabaseAdmin';
import type { ServerAuthDatabase } from '../auth/types';
import type { KnowledgeChunkRecord, KnowledgeDocumentRecord, KnowledgeSourceRecord } from '../../types/persistence';
import type { ServerToolDefinition } from './types';

export interface RagSearchInput {
  query: string;
  topK?: number;
  sourceVisibility?: 'demo' | 'system' | 'private';
}

export interface RagSearchResult {
  chunkId: string;
  documentId: string;
  sourceId: string;
  title: string;
  sourceName: string;
  content: string;
  score: number;
  citationId: string;
}

export interface RagSourceCitation {
  citationId: string;
  chunkId: string;
  documentId: string;
  sourceId: string;
  title: string;
  sourceName: string;
  content: string;
  score: number;
}

export interface RagSearchOutput {
  query: string;
  results: RagSearchResult[];
  sources: RagSourceCitation[];
  elapsedMs: number;
}

type RagRetrievalLogInsert = ServerAuthDatabase['public']['Tables']['rag_retrieval_logs']['Insert'];

interface RankedChunk {
  chunk: KnowledgeChunkRecord;
  document: KnowledgeDocumentRecord;
  source: KnowledgeSourceRecord;
  score: number;
}

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 8;
const MAX_CHUNK_CONTENT_LENGTH = 520;

const DOMAIN_TERMS = [
  '教学评价',
  '教学质量',
  '课堂参与度',
  '作业完成率',
  '学业预警',
  '出勤率',
  '过程性评价',
  '评价口径',
  '成绩波动',
  '教师备注',
  '班级基线',
  '数据源',
  '数据异常',
  '分析报告',
  '字段缺失',
  '样本不足',
  '复核',
  '课堂',
  '作业',
  '出勤',
  '预警',
] as const;

function normalizeTopK(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_TOP_K;
  }

  return Math.max(1, Math.min(MAX_TOP_K, Math.floor(value)));
}

function truncateContent(content: string): string {
  const normalizedContent = content.trim().replace(/\s+/g, ' ');

  if (normalizedContent.length <= MAX_CHUNK_CONTENT_LENGTH) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, MAX_CHUNK_CONTENT_LENGTH)}...`;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 160);
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim().slice(0, 160);
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim().slice(0, 160);
  }

  return 'unknown rag retrieval log error';
}

function logRetrievalWarning(params: {
  operation: 'insert_rag_retrieval_log';
  persistedRunId?: string;
  runtimeRunId?: string;
  error: unknown;
}): void {
  console.warn('[rag-retrieval-log]', {
    operation: params.operation,
    persistedRunId: params.persistedRunId ?? null,
    runtimeRunId: params.runtimeRunId ?? null,
    errorMessage: getSafeErrorMessage(params.error),
  });
}

function extractSearchTerms(query: string): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  const domainTerms = DOMAIN_TERMS.filter((term) => normalizedQuery.includes(term.toLowerCase()));
  const asciiTerms = normalizedQuery
    .split(/[^\p{Letter}\p{Number}_]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !['why', 'how', 'what'].includes(term));

  return uniq([...domainTerms, ...asciiTerms]);
}

function scoreChunk(params: {
  query: string;
  terms: string[];
  chunk: KnowledgeChunkRecord;
  document: KnowledgeDocumentRecord;
  source: KnowledgeSourceRecord;
}): number {
  const haystack = [
    params.source.name,
    params.document.title,
    params.chunk.content,
  ].join('\n').toLowerCase();
  let score = 0;

  for (const term of params.terms) {
    const normalizedTerm = term.toLowerCase();

    if (params.document.title.toLowerCase().includes(normalizedTerm)) {
      score += 3;
    }

    if (params.source.name.toLowerCase().includes(normalizedTerm)) {
      score += 1;
    }

    if (params.chunk.content.toLowerCase().includes(normalizedTerm)) {
      score += normalizedTerm.length >= 4 ? 4 : 2;
    }
  }

  const normalizedQuery = params.query.trim().toLowerCase();

  if (normalizedQuery.length >= 6 && haystack.includes(normalizedQuery)) {
    score += 5;
  }

  return score;
}

function isVisibleToContext(params: {
  visibility: KnowledgeChunkRecord['visibility'];
  userId: string | null;
  ownerUserId: string | null;
  requestedVisibility?: RagSearchInput['sourceVisibility'];
}): boolean {
  if (params.requestedVisibility && params.visibility !== params.requestedVisibility) {
    return false;
  }

  if (params.visibility === 'demo' || params.visibility === 'system') {
    return true;
  }

  return Boolean(params.userId && params.ownerUserId === params.userId);
}

async function writeRetrievalLog(params: {
  userId?: string;
  conversationId?: string;
  persistedRunId?: string;
  runtimeRunId?: string;
  query: string;
  topK: number;
  results: RagSourceCitation[];
  elapsedMs: number;
}): Promise<void> {
  if (!params.userId || !params.conversationId) {
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  const insertPayload: RagRetrievalLogInsert = {
    run_id: params.persistedRunId ?? null,
    conversation_id: params.conversationId,
    user_id: params.userId,
    query: params.query,
    top_k: params.topK,
    results: params.results,
    latency_ms: params.elapsedMs,
    metadata: {
      runtimeRunId: params.runtimeRunId ?? null,
      retrievalMode: 'keyword',
    },
  };

  const { error } = await supabaseAdmin.from('rag_retrieval_logs').insert(insertPayload);

  if (error) {
    logRetrievalWarning({
      operation: 'insert_rag_retrieval_log',
      persistedRunId: params.persistedRunId,
      runtimeRunId: params.runtimeRunId,
      error,
    });
  }
}

export const ragSearchTool: ServerToolDefinition<RagSearchInput, RagSearchOutput> = {
  id: 'rag_search',
  name: 'rag_search',
  description: '检索教学评价制度、指标口径和数据异常处理说明。',
  riskLevel: 'low',
  enabled: true,
  async execute(input, context) {
    const startedAt = Date.now();
    const query = input.query.trim();
    const topK = normalizeTopK(input.topK);

    if (!query) {
      return {
        query,
        results: [],
        sources: [],
        elapsedMs: 0,
      };
    }

    const supabaseAdmin = getSupabaseAdminClient();

    if (!supabaseAdmin) {
      throw new Error('RAG 检索服务暂不可用');
    }

    const { data: chunkRows, error: chunkError } = await supabaseAdmin
      .from('knowledge_chunks')
      .select('id, document_id, source_id, user_id, visibility, chunk_index, content, content_tsv, metadata, created_at')
      .order('chunk_index', { ascending: true })
      .limit(200);

    if (chunkError) {
      throw new Error('RAG 检索失败');
    }

    const visibleChunks = (chunkRows ?? []).filter((chunk) =>
      isVisibleToContext({
        visibility: chunk.visibility,
        userId: context.userId ?? null,
        ownerUserId: chunk.user_id,
        requestedVisibility: input.sourceVisibility,
      }),
    );
    const documentIds = uniq(visibleChunks.map((chunk) => chunk.document_id));
    const sourceIds = uniq(visibleChunks.map((chunk) => chunk.source_id));

    if (documentIds.length === 0 || sourceIds.length === 0) {
      return {
        query,
        results: [],
        sources: [],
        elapsedMs: Date.now() - startedAt,
      };
    }

    const [{ data: documentRows, error: documentError }, { data: sourceRows, error: sourceError }] = await Promise.all([
      supabaseAdmin
        .from('knowledge_documents')
        .select('id, source_id, user_id, visibility, title, uri, mime_type, status, content_text, created_at, updated_at, metadata')
        .in('id', documentIds),
      supabaseAdmin
        .from('knowledge_sources')
        .select('id, user_id, visibility, name, type, status, created_at, updated_at, metadata')
        .in('id', sourceIds),
    ]);

    if (documentError || sourceError) {
      throw new Error('RAG 来源读取失败');
    }

    const documentMap = new Map((documentRows ?? []).map((document) => [document.id, document]));
    const sourceMap = new Map((sourceRows ?? []).map((source) => [source.id, source]));
    const terms = extractSearchTerms(query);
    const rankedCandidates: RankedChunk[] = [];

    for (const chunk of visibleChunks) {
      const document = documentMap.get(chunk.document_id);
      const source = sourceMap.get(chunk.source_id);

      if (!document || !source || document.status !== 'active' || source.status !== 'active') {
        continue;
      }

      const score = scoreChunk({
        query,
        terms,
        chunk,
        document,
        source,
      });

      if (score > 0) {
        rankedCandidates.push({
          chunk,
          document,
          source,
          score,
        });
      }
    }

    const ranked = rankedCandidates
      .sort((left, right) => right.score - left.score || left.chunk.chunk_index - right.chunk.chunk_index)
      .slice(0, topK);

    const maxScore = ranked[0]?.score ?? 1;
    const results = ranked.map<RagSearchResult>((item, index) => ({
      chunkId: item.chunk.id,
      documentId: item.document.id,
      sourceId: item.source.id,
      title: item.document.title,
      sourceName: item.source.name,
      content: truncateContent(item.chunk.content),
      score: Number((item.score / maxScore).toFixed(3)),
      citationId: `S${index + 1}`,
    }));
    const sources: RagSourceCitation[] = results.map((result) => ({ ...result }));
    const elapsedMs = Date.now() - startedAt;

    await writeRetrievalLog({
      userId: context.userId,
      conversationId: context.conversationId,
      persistedRunId: context.persistedRunId,
      runtimeRunId: context.runtimeRunId,
      query,
      topK,
      results: sources,
      elapsedMs,
    });

    return {
      query,
      results,
      sources,
      elapsedMs,
    };
  },
};
