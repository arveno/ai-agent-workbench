import type { RunSnapshot } from '@/types/run';
import { formatToolInvocationForInspector } from './toolInvocationFormat';

function formatDataSource(run: RunSnapshot): string {
  if (!run.dataSource) {
    return '本次未访问数据源。';
  }

  const schemaText = run.dataSource.schema ? `，Schema：${run.dataSource.schema}` : '';
  const tableText = typeof run.dataSource.tableCount === 'number' ? `，表数量：${run.dataSource.tableCount}` : '';

  return `${run.dataSource.name}（${run.dataSource.typeLabel}${schemaText}${tableText}）`;
}

function formatToolLines(run: RunSnapshot): string {
  if (run.toolInvocations.length === 0) {
    return '本次未调用工具。';
  }

  return run.toolInvocations
    .map((tool) => {
      const formattedTool = formatToolInvocationForInspector(tool);
      return `- ${formattedTool.displayName}：${formattedTool.outputText}`;
    })
    .join('\n');
}

export function createRunReportMarkdown(run: RunSnapshot): string {
  return [
    '# 教学质量分析简版报告',
    '',
    '## 分析问题',
    run.prompt || '未记录',
    '',
    '## 使用数据源',
    formatDataSource(run),
    '',
    '## 调用工具',
    formatToolLines(run),
    '',
    '## 分析结论',
    run.conclusion || '本次 Run 未生成明确结论。',
    '',
    '## 后续建议',
    '建议结合本次分析结果，继续关注异常指标较高的学科或班级，并结合平均分、出勤率、作业完成率等指标做进一步排查。',
  ].join('\n');
}
