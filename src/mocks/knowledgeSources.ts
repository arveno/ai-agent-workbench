import type { KnowledgeSource } from '../types/workbench';

export const mockKnowledgeSources: KnowledgeSource[] = [
  {
    id: 'ks_001',
    title: '教学质量分析指标口径',
    summary: '包含平均分、优秀率、及格率、出勤率等指标的定义、计算口径与适用范围说明。',
    matchRate: 92,
  },
  {
    id: 'ks_002',
    title: '学生成绩波动预警规则',
    summary: '定义成绩异常波动的阈值规则与分级标准，支持年级与班级维度的预警判断。',
    matchRate: 88,
  },
  {
    id: 'ks_003',
    title: '区域教育数据统计说明',
    summary: '说明数据来源、统计周期、口径一致性要求及常见问题处理说明。',
    matchRate: 84,
  },
];