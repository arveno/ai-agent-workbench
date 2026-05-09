import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { QueryResultRow } from 'pg';
import { createPostgresPool, getConnectionStringByProvider } from '../../src/server/datasources/connection';

type DataSourceTestableProviderId = 'postgresql' | 'supabase';

interface DataSourceSchemaRequest {
  provider?: unknown;
}

interface DataSourceColumnSchema {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
}

interface DataSourceTableSchema {
  schema: string;
  tableName: string;
  columns: DataSourceColumnSchema[];
}

interface DataSourceSchemaSuccessResponse {
  ok: true;
  provider: DataSourceTestableProviderId;
  status: 'success';
  elapsedMs: number;
  readAt: string;
  schemas: string[];
  tableCount: number;
  tables: DataSourceTableSchema[];
}

interface DataSourceSchemaErrorResponse {
  ok: false;
  provider?: DataSourceTestableProviderId;
  status: 'error';
  errorMessage: string;
  elapsedMs?: number;
}

interface InformationSchemaRow extends QueryResultRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO' | string;
  ordinal_position: number;
}

function isDataSourceTestableProviderId(value: unknown): value is DataSourceTestableProviderId {
  return value === 'postgresql' || value === 'supabase';
}

function parseRequestBody(body: unknown): DataSourceSchemaRequest {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as DataSourceSchemaRequest;
    } catch {
      return {};
    }
  }

  if (typeof body === 'object' && body !== null) {
    return body as DataSourceSchemaRequest;
  }

  return {};
}

function createErrorResponse(
  response: VercelResponse<DataSourceSchemaErrorResponse>,
  params: {
    httpStatus: number;
    provider?: DataSourceTestableProviderId;
    errorMessage: string;
    elapsedMs?: number;
  }
): void {
  response.status(params.httpStatus).json({
    ok: false,
    provider: params.provider,
    status: 'error',
    errorMessage: params.errorMessage,
    elapsedMs: params.elapsedMs,
  });
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return '读取 Schema 失败，请检查服务端环境变量、数据库连接或网络配置。';
    }
  }

  return '读取 Schema 失败，请检查服务端环境变量、数据库连接或网络配置。';
}

function buildTableSchemas(rows: InformationSchemaRow[]): DataSourceTableSchema[] {
  const tableMap = new Map<string, DataSourceTableSchema>();

  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    const existing = tableMap.get(key);

    const column: DataSourceColumnSchema = {
      columnName: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === 'YES',
      ordinalPosition: Number(row.ordinal_position),
    };

    if (!existing) {
      tableMap.set(key, {
        schema: row.table_schema,
        tableName: row.table_name,
        columns: [column],
      });
      continue;
    }

    existing.columns.push(column);
  }

  return Array.from(tableMap.values());
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<DataSourceSchemaSuccessResponse | DataSourceSchemaErrorResponse>
) {
  if (req.method !== 'POST') {
    createErrorResponse(res, {
      httpStatus: 405,
      errorMessage: 'Method not allowed',
    });
    return;
  }

  const body = parseRequestBody(req.body);
  const providerValue = body.provider;

  if (!isDataSourceTestableProviderId(providerValue)) {
    createErrorResponse(res, {
      httpStatus: 400,
      errorMessage: 'Invalid provider. Expected postgresql or supabase.',
    });
    return;
  }

  const provider = providerValue;
  const connectionString = getConnectionStringByProvider(provider);

  if (!connectionString) {
    createErrorResponse(res, {
      httpStatus: 400,
      provider,
      errorMessage: '未配置服务端连接环境变量',
    });
    return;
  }

  const startTime = Date.now();
  const pool = createPostgresPool({
    provider,
    connectionString,
  });

  try {
    const schemaQueryResult = await pool.query<InformationSchemaRow>({
      text: `
        select
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.ordinal_position
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
         and t.table_name = c.table_name
        where c.table_schema = 'public'
          and t.table_type = 'BASE TABLE'
        order by
          c.table_schema,
          c.table_name,
          c.ordinal_position
      `,
    });

    const tables = buildTableSchemas(schemaQueryResult.rows);
    const schemas = Array.from(new Set(tables.map((table) => table.schema)));
    const elapsedMs = Date.now() - startTime;

    res.status(200).json({
      ok: true,
      provider,
      status: 'success',
      elapsedMs,
      readAt: new Date().toISOString(),
      schemas,
      tableCount: tables.length,
      tables,
    });
  } catch (error) {
    const elapsedMs = Date.now() - startTime;

    console.error('[datasource:schema] read failed', error);

    createErrorResponse(res, {
      httpStatus: 500,
      provider,
      errorMessage: toSafeErrorMessage(error),
      elapsedMs,
    });
  } finally {
    await pool.end().catch(() => undefined);
  }
}
