import type { RagSourceChunk } from '@/types/rag';
import type { RunSnapshot } from '@/types/run';

export function createMockRagSources(): RagSourceChunk[] {
  return [
    {
      id: 'mock_source_1',
      documentTitle: '《教学质量异常指标判定规则》',
      chunkTitle: '异常指标识别口径',
      contentPreview: '当平均分、出勤率、作业完成率或异常次数偏离月度基线时，应优先结合学科和班级维度定位异常来源。',
      score: 0.92,
      citationLabel: '[S1]',
      usedInAnswer: true,
      sourceType: 'policy',
      sourceName: '公开演示规则库',
      isMock: true,
      updatedAt: '2026-05-01',
    },
    {
      id: 'mock_source_2',
      documentTitle: '《月度成绩波动分析口径》',
      chunkTitle: '成绩波动解释规则',
      contentPreview: '月度成绩波动需要结合历史均值、同学科分布和年级差异判断，避免只依据单个指标下结论。',
      score: 0.87,
      citationLabel: '[S2]',
      usedInAnswer: true,
      sourceType: 'knowledge_base',
      sourceName: '公开演示规则库',
      isMock: true,
      updatedAt: '2026-04-28',
    },
    {
      id: 'mock_source_3',
      documentTitle: '《出勤率与成绩关联分析说明》',
      chunkTitle: '出勤率辅助判断',
      contentPreview: '出勤率下降可能与阶段性成绩波动相关，但应结合班级、学科和作业完成率进一步交叉验证。',
      score: 0.78,
      citationLabel: '[S3]',
      usedInAnswer: false,
      sourceType: 'document',
      sourceName: '公开演示规则库',
      isMock: true,
      updatedAt: '2026-04-20',
    },
  ];
}

export function getRunRagSources(run: RunSnapshot | null): RagSourceChunk[] {
  return run?.sources ?? [];
}

export function formatSourceScore(score?: number): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '相关度 -';
  }

  const normalizedScore = score > 1 ? score : score * 100;
  return `相关度 ${Math.round(normalizedScore)}%`;
}
