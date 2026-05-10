/// <reference types="node" />

import type { QueryResultRow } from 'pg';
import { createPostgresPool, getConnectionStringByProvider } from '../datasources/connection';
import type { AgentPlanComparison, AgentPlanTimeRange } from '../agent/types';
import type { ServerToolDefinition, ToolCellValue, ToolRow } from './types';

const METRIC_WHITELIST = [
  'avg_score',
  'attendance_rate',
  'homework_completion_rate',
  'abnormal_count',
] as const;

const GROUP_BY_WHITELIST = ['subject', 'metric_month'] as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type AggregateMetric = (typeof METRIC_WHITELIST)[number];
type AggregateGroupBy = (typeof GROUP_BY_WHITELIST)[number];

export interface AggregateTableInput {
  metric: AggregateMetric;
  groupBy?: AggregateGroupBy;
  limit?: number;
  timeRange?: AgentPlanTimeRange;
  comparison?: AgentPlanComparison;
}

export interface AggregateTableOutput {
  rows: ToolRow[];
  rowCount: number;
  elapsedMs: number;
  timeRangeLabel?: string;
}

type SqlParam = string | number;

function normalizeLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  if (limit < 1) {
    return 1;
  }

  if (limit > MAX_LIMIT) {
    return MAX_LIMIT;
  }

  return Math.floor(limit);
}

function normalizeCellValue(value: unknown): ToolCellValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function sanitizeRows(rows: QueryResultRow[]): ToolRow[] {
  return rows.map((row) => {
    const sanitizedRow: ToolRow = {};

    for (const [key, value] of Object.entries(row)) {
      sanitizedRow[key] = normalizeCellValue(value);
    }

    return sanitizedRow;
  });
}

function isMetricAllowed(metric: string): metric is AggregateMetric {
  return (METRIC_WHITELIST as readonly string[]).includes(metric);
}

function isGroupByAllowed(groupBy: string): groupBy is AggregateGroupBy {
  return (GROUP_BY_WHITELIST as readonly string[]).includes(groupBy);
}

function getNextMonth(month: string): string {
  if (!/^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('不允许的时间范围');
  }

  const [yearValue, monthValue] = month.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonth(month: string): string {
  if (!/^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('不允许的时间范围');
  }

  const [yearValue, monthValue] = month.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getTimeRangeLabel(input: AggregateTableInput): string | undefined {
  if (input.timeRange?.type === 'month') {
    if (input.comparison === 'previous_month') {
      return `${input.timeRange.label}及上月`;
    }

    return input.timeRange.label;
  }

  if (input.timeRange?.type === 'latest_available_month') {
    return input.timeRange.label;
  }

  return undefined;
}

function buildTimeWhereClause(input: AggregateTableInput, values: SqlParam[]): string {
  if (input.timeRange?.type === 'month') {
    const startMonth = input.comparison === 'previous_month'
      ? getPreviousMonth(input.timeRange.month)
      : input.timeRange.month;
    const endMonth = getNextMonth(input.timeRange.month);
    const startParamIndex = values.length + 1;

    values.push(`${startMonth}-01`);
    const endParamIndex = values.length + 1;
    values.push(`${endMonth}-01`);

    return `where metric_month >= $${startParamIndex}::date and metric_month < $${endParamIndex}::date`;
  }

  if (input.timeRange?.type === 'latest_available_month') {
    return 'where metric_month = (select max(metric_month) from "teaching_metrics")';
  }

  return '';
}

function getMetricAggregateExpression(metric: AggregateMetric): string {
  if (metric === 'abnormal_count') {
    return `sum("${metric}")::double precision`;
  }

  return `avg("${metric}")::double precision`;
}

function buildAggregateSql(input: AggregateTableInput, limit: number): { sql: string; values: SqlParam[] } {
  if (!isMetricAllowed(input.metric)) {
    throw new Error('不允许的聚合指标');
  }

  const values: SqlParam[] = [];
  const whereClause = buildTimeWhereClause(input, values);
  const aggregateExpression = getMetricAggregateExpression(input.metric);

  if (!input.groupBy) {
    return {
      sql: `
        select
          ${aggregateExpression} as value
        from "teaching_metrics"
        ${whereClause}
      `,
      values,
    };
  }

  if (!isGroupByAllowed(input.groupBy)) {
    throw new Error('不允许的分组维度');
  }

  values.push(limit);
  const limitParamIndex = values.length;

  return {
    sql: `
      select
        "${input.groupBy}" as dimension,
        ${aggregateExpression} as value
      from "teaching_metrics"
      ${whereClause}
      group by "${input.groupBy}"
      order by value desc nulls last
      limit $${limitParamIndex}
    `,
    values,
  };
}

export const aggregateTableTool: ServerToolDefinition<AggregateTableInput, AggregateTableOutput> = {
  id: 'aggregate_table',
  name: 'aggregate_table',
  description: '对指定表进行受控聚合，例如 count、avg、sum、group by。',
  riskLevel: 'medium',
  enabled: true,
  async execute(input, context) {
    const connectionString = getConnectionStringByProvider(context.provider);

    if (!connectionString) {
      throw new Error('未配置服务端连接环境变量');
    }

    const normalizedLimit = normalizeLimit(input.limit);
    const { sql, values } = buildAggregateSql(input, normalizedLimit);

    const pool = createPostgresPool({
      provider: context.provider,
      connectionString,
    });

    const startTime = Date.now();

    try {
      const result = await pool.query<QueryResultRow>({
        text: sql,
        values,
      });

      return {
        rows: sanitizeRows(result.rows),
        rowCount: result.rowCount ?? result.rows.length,
        elapsedMs: Date.now() - startTime,
        timeRangeLabel: getTimeRangeLabel(input),
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  },
};
