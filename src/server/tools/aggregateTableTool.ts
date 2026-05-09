/// <reference types="node" />

import type { QueryResultRow } from 'pg';
import { createPostgresPool, getConnectionStringByProvider } from '../datasources/connection';
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
}

export interface AggregateTableOutput {
  rows: ToolRow[];
  rowCount: number;
  elapsedMs: number;
}

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

function buildAggregateSql(input: AggregateTableInput, limit: number): { sql: string; values: number[] } {
  if (!isMetricAllowed(input.metric)) {
    throw new Error('不允许的聚合指标');
  }

  if (!input.groupBy) {
    return {
      sql: `
        select
          avg("${input.metric}")::double precision as value
        from "teaching_metrics"
      `,
      values: [],
    };
  }

  if (!isGroupByAllowed(input.groupBy)) {
    throw new Error('不允许的分组维度');
  }

  return {
    sql: `
      select
        "${input.groupBy}" as dimension,
        avg("${input.metric}")::double precision as value
      from "teaching_metrics"
      group by "${input.groupBy}"
      order by value desc nulls last
      limit $1
    `,
    values: [limit],
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
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  },
};
