/// <reference types="node" />

export interface SimpleAgentIntent {
  metric: 'avg_score' | 'attendance_rate' | 'homework_completion_rate' | 'abnormal_count';
  groupBy: 'subject' | 'metric_month';
}

export function detectSimpleIntent(prompt: string): SimpleAgentIntent {
  const normalizedPrompt = prompt.trim();

  let metric: SimpleAgentIntent['metric'] = 'avg_score';

  if (normalizedPrompt.includes('出勤') || normalizedPrompt.includes('出勤率')) {
    metric = 'attendance_rate';
  } else if (normalizedPrompt.includes('作业') || normalizedPrompt.includes('完成率')) {
    metric = 'homework_completion_rate';
  } else if (normalizedPrompt.includes('异常')) {
    metric = 'abnormal_count';
  } else if (
    normalizedPrompt.includes('平均分') ||
    normalizedPrompt.includes('成绩') ||
    normalizedPrompt.includes('分数')
  ) {
    metric = 'avg_score';
  }

  const groupBy: SimpleAgentIntent['groupBy'] =
    normalizedPrompt.includes('月份') ||
    normalizedPrompt.includes('趋势') ||
    normalizedPrompt.includes('对比上月') ||
    normalizedPrompt.includes('上月对比')
      ? 'metric_month'
      : 'subject';

  return {
    metric,
    groupBy,
  };
}
