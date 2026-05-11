import type { WorkbenchSession } from '../types/workbench';

const now = Date.now();

export const mockSessions: WorkbenchSession[] = [
  {
    id: 's_001',
    title: '本月教学数据分析',
    updatedAt: now - 5 * 60 * 1000,
    taskId: 't_month_analytics',
    messages: [
      {
        id: 'm_user_default',
        role: 'user',
        kind: 'normal',
        content: '分析 2026 年 5 月教学质量数据，找出异常指标。',
        createdAt: now - 5 * 60 * 1000,
      },
      {
        id: 'm_assistant_default',
        role: 'assistant',
        kind: 'normal',
        content:
          '我将先检索相关指标口径与教学质量分析规则，再查询本月各年级成绩与出勤数据，随后给出异常项和简短分析结论。',
        createdAt: now - 5 * 60 * 1000 + 1,
      },
    ],
    runsById: {},
  },
  {
    id: 's_002',
    title: '七年级成绩异常排查',
    updatedAt: now - 24 * 60 * 60 * 1000,
    taskId: 't_abnormal_reason',
    messages: [],
    runsById: {},
  },
  {
    id: 's_003',
    title: '生成简短分析报告',
    updatedAt: now - 2 * 24 * 60 * 60 * 1000,
    taskId: 't_report',
    messages: [],
    runsById: {},
  },
  {
    id: 's_004',
    title: '班级出勤情况分析',
    updatedAt: now - 3 * 24 * 60 * 60 * 1000,
    messages: [],
    runsById: {},
  },
  {
    id: 's_005',
    title: '期中考试成绩分析',
    updatedAt: now - 4 * 24 * 60 * 60 * 1000,
    messages: [],
    runsById: {},
  },
  {
    id: 's_006',
    title: '学科均衡性评估',
    updatedAt: now - 5 * 24 * 60 * 60 * 1000,
    messages: [],
    runsById: {},
  },
  {
    id: 's_007',
    title: '教师教学效果分析',
    updatedAt: now - 6 * 24 * 60 * 60 * 1000,
    messages: [],
    runsById: {},
  },
];
