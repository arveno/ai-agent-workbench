/// <reference types="node" />

import type { ServerToolDefinition, ToolRow } from './types';

export interface ChartRenderInput {
  title: string;
  chartType: 'bar' | 'line';
  labelKey: string;
  valueKey: string;
  rows: ToolRow[];
}

export interface ChartRenderOutput {
  title: string;
  chartType: 'bar' | 'line';
  labels: string[];
  values: number[];
  summary: string;
}

function toNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
}

export const chartRenderTool: ServerToolDefinition<ChartRenderInput, ChartRenderOutput> = {
  id: 'chart_render',
  name: 'chart_render',
  description: '将查询或聚合结果转换为前端图表数据。',
  riskLevel: 'low',
  enabled: true,
  async execute(input) {
    const labels: string[] = [];
    const values: number[] = [];

    for (const row of input.rows) {
      const rawLabel = row[input.labelKey];
      const rawValue = row[input.valueKey];
      const numericValue = toNumericValue(rawValue);

      if (numericValue === null) {
        continue;
      }

      labels.push(String(rawLabel ?? ''));
      values.push(numericValue);
    }

    const summary = labels.length
      ? `已生成 ${labels.length} 个数据点，图表类型为 ${input.chartType}。`
      : '没有可用于图表渲染的有效数据点。';

    return {
      title: input.title,
      chartType: input.chartType,
      labels,
      values,
      summary,
    };
  },
};
