import type { RunSource } from '@/types/rag';
import type { RunViewModel } from '@/domain/run/view-model';

export function createMockRagSources(): RunSource[] {
  return [
    {
      id: 'mock_source_1',
      runId: 'mock_run',
      conversationId: 'mock_session',
      documentId: 'mock_doc_1',
      chunkId: 'mock_source_1',
      citationLabel: '[S1]',
      sourceOrder: 1,
      title: '《教学质量异常指标判定规则》',
      preview: '当平均分、出勤率、作业完成率或异常次数偏离月度基线时，应优先结合学科和班级维度定位异常来源。',
      score: 0.92,
      usedInAnswer: true,
      sourceType: 'knowledge',
      createdAt: '2026-05-01',
      metadata: {
        provider: 'mock_knowledge_search',
      },
    },
    {
      id: 'mock_source_2',
      runId: 'mock_run',
      conversationId: 'mock_session',
      documentId: 'mock_doc_2',
      chunkId: 'mock_source_2',
      citationLabel: '[S2]',
      sourceOrder: 2,
      title: '《月度成绩波动分析口径》',
      preview: '月度成绩波动需要结合历史均值、同学科分布和年级差异判断，避免只依据单个指标下结论。',
      score: 0.87,
      usedInAnswer: true,
      sourceType: 'knowledge',
      createdAt: '2026-04-28',
      metadata: {
        provider: 'mock_knowledge_search',
      },
    },
    {
      id: 'mock_source_3',
      runId: 'mock_run',
      conversationId: 'mock_session',
      documentId: 'mock_doc_3',
      chunkId: 'mock_source_3',
      citationLabel: '[S3]',
      sourceOrder: 3,
      title: '《出勤率与成绩关联分析说明》',
      preview: '出勤率下降可能与阶段性成绩波动相关，但应结合班级、学科和作业完成率进一步交叉验证。',
      score: 0.78,
      usedInAnswer: false,
      sourceType: 'knowledge',
      createdAt: '2026-04-20',
      metadata: {
        provider: 'mock_knowledge_search',
      },
    },
  ];
}

export function getRunRagSources(run: RunViewModel | null): RunSource[] {
  if (!run) {
    return [];
  }

  return run.sources;
}

export function formatSourceScore(score?: number): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '相关度 -';
  }

  const normalizedScore = score > 1 ? score : score * 100;
  return `相关度 ${Math.round(normalizedScore)}%`;
}
