import type { ExampleTask } from '../types/workbench';

export const mockTasks: ExampleTask[] = [
  {
    id: 't_month_analytics',
    title: '分析本月教学数据',
    description: '分析教学质量、出勤率和异常指标',
    prompt: '请分析 2026 年 5 月教学质量相关数据，找出异常指标，并给出简短结论。',
  },
  {
    id: 't_abnormal_reason',
    title: '查询指标异常原因',
    description: '根据指标波动查询可能原因',
    prompt: '请帮我查询本月教学指标异常的主要原因。',
  },
  {
    id: 't_report',
    title: '生成分析报告',
    description: '基于当前数据生成简短报告',
    prompt: '请基于当前教学数据生成一份简短分析报告。',
  },
];