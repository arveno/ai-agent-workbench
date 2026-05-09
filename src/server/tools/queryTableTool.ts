/// <reference types="node" />

import type { QueryResultRow } from 'pg';
import { createPostgresPool, getConnectionStringByProvider } from '../datasources/connection';
import type { ServerToolDefinition, ToolCellValue, ToolRow } from './types';

const TABLE_COLUMN_WHITELIST = {
  schools: ['id', 'name', 'region'],
  classes: ['id', 'school_id', 'grade', 'class_name'],
  teaching_metrics: [
    'id',
    'class_id',
    'metric_month',
    'subject',
    'avg_score',
    'attendance_rate',
    'homework_completion_rate',
    'abnormal_count',
  ],
} as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type QueryTableName = keyof typeof TABLE_COLUMN_WHITELIST;

type QueryTableColumn = (typeof TABLE_COLUMN_WHITELIST)[QueryTableName][number];

export interface QueryTableInput {
  table: QueryTableName;
  columns?: QueryTableColumn[];
  limit?: number;
}

export interface QueryTableOutput {
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

function resolveSelectedColumns(input: QueryTableInput): readonly QueryTableColumn[] {
  const allowedColumns = TABLE_COLUMN_WHITELIST[input.table];

  if (!input.columns || input.columns.length === 0) {
    return allowedColumns;
  }

  const invalidColumns = input.columns.filter(
    (column) => !(allowedColumns as readonly string[]).includes(column)
  );

  if (invalidColumns.length > 0) {
    throw new Error('包含不允许查询的字段');
  }

  return input.columns;
}

export const queryTableTool: ServerToolDefinition<QueryTableInput, QueryTableOutput> = {
  id: 'query_table',
  name: 'query_table',
  description: '按受控条件查询白名单表数据，不允许任意 SQL。',
  riskLevel: 'medium',
  enabled: true,
  async execute(input, context) {
    const connectionString = getConnectionStringByProvider(context.provider);

    if (!connectionString) {
      throw new Error('未配置服务端连接环境变量');
    }

    const selectedColumns = resolveSelectedColumns(input);
    const normalizedLimit = normalizeLimit(input.limit);
    const quotedColumns = selectedColumns.map((column) => `"${column}"`).join(', ');
    const sql = `select ${quotedColumns} from "${input.table}" limit $1`;

    const pool = createPostgresPool({
      provider: context.provider,
      connectionString,
    });

    const startTime = Date.now();

    try {
      const result = await pool.query<QueryResultRow>({
        text: sql,
        values: [normalizedLimit],
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
