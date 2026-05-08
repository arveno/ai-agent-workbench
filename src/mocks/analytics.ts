import type { AnalyticsResult } from '../types/workbench';

export const mockAnalyticsResult: AnalyticsResult = {
  kpis: {
    averageScore: 78.6,
    attendanceRate: 94.1,
    abnormalCount: 2,
  },
  gradeScores: [
    { grade: '一', value: 82.4 },
    { grade: '二', value: 84.1 },
    { grade: '三', value: 79.3 },
    { grade: '四', value: 76.8 },
    { grade: '五', value: 78.2 },
    { grade: '六', value: 74.6 },
  ],
};