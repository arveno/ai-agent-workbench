import type { RagSourceChunk } from '@/types/rag';
import type { RunSnapshot } from '@/types/run';
import { formatSourceScore, getRunRagSources } from './ragSources';

export interface RagSourceView {
  id: string;
  citationId: string;
  title: string;
  snippet: string;
  sourceName: string;
  scoreText: string;
  isUsedInAnswer: boolean;
  isMock: boolean;
}

export interface RagSourcesView {
  title: string;
  description: string;
  items: RagSourceView[];
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  canRetry: boolean;
  emptyTitle: string;
  emptyDescription: string;
  loadingMessage: string;
  retryLabel: string;
}

function truncateSnippet(value: string): string {
  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  if (normalizedValue.length <= 140) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 139)}…`;
}

function sourceToView(source: RagSourceChunk, runMode: RunSnapshot['mode']): RagSourceView {
  return {
    id: source.id,
    citationId: source.citationLabel,
    title: source.documentTitle,
    snippet: truncateSnippet(source.contentPreview),
    sourceName: source.sourceName ?? (runMode === 'mock' ? '公开演示来源' : '教学评价制度示例知识库'),
    scoreText: formatSourceScore(source.score),
    isUsedInAnswer: source.usedInAnswer,
    isMock: runMode === 'mock' || source.isMock === true,
  };
}

export function createRagSourcesView(params: {
  run: RunSnapshot | null;
  isLoading: boolean;
  errorMessage: string | null;
}): RagSourcesView {
  const sources = getRunRagSources(params.run);
  const items = params.run ? sources.map((source) => sourceToView(source, params.run?.mode ?? 'agent')) : [];
  const isEmpty = !params.isLoading && !params.errorMessage && items.length === 0;
  const isMock = params.run?.mode === 'mock';

  return {
    title: isMock ? '公开演示来源' : '检索来源',
    description: isMock ? 'Mock RAG 来源，仅用于公开演示' : '真实 RAG 来源、引用与证据链',
    items,
    isLoading: params.isLoading,
    isEmpty,
    errorMessage: params.errorMessage,
    canRetry: Boolean(params.errorMessage && params.run),
    emptyTitle: '暂无检索来源',
    emptyDescription: params.run
      ? '当前 Run 暂无检索来源。'
      : '发送涉及知识检索的问题后，这里会展示来源片段和引用信息。',
    loadingMessage: '正在读取 RAG 检索来源...',
    retryLabel: '重试',
  };
}
