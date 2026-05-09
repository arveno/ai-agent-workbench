import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { QueryResultRow } from 'pg';
import { createPostgresPool, getConnectionStringByProvider } from '../../src/server/datasources/connection';

type DataSourceTestableProviderId = 'postgresql' | 'supabase';

interface DataSourceTestRequest {
  provider?: unknown;
}

interface DataSourceTestSuccessResponse {
  ok: true;
  provider: DataSourceTestableProviderId;
  status: 'connected';
  elapsedMs: number;
  serverTime: string;
  databaseVersion?: string;
}

interface DataSourceTestErrorResponse {
  ok: false;
  provider?: DataSourceTestableProviderId;
  status: 'error';
  errorMessage: string;
  elapsedMs?: number;
}

interface VersionQueryRow extends QueryResultRow {
  version?: string;
  server_time?: Date | string;
}

function isDataSourceTestableProviderId(value: unknown): value is DataSourceTestableProviderId {
  return value === 'postgresql' || value === 'supabase';
}

function parseRequestBody(body: unknown): DataSourceTestRequest {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as DataSourceTestRequest;
    } catch {
      return {};
    }
  }

  if (typeof body === 'object' && body !== null) {
    return body as DataSourceTestRequest;
  }

  return {};
}

function createErrorResponse(
  response: VercelResponse<DataSourceTestErrorResponse>,
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

function toIsoTime(value: Date | string | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const parsedTime = new Date(value);

    if (!Number.isNaN(parsedTime.getTime())) {
      return parsedTime.toISOString();
    }
  }

  return new Date().toISOString();
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return '数据库连接失败，请检查服务端环境变量或网络配置。';
    }
  }

  return '数据库连接失败，请检查服务端环境变量或网络配置。';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<DataSourceTestSuccessResponse | DataSourceTestErrorResponse>
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
    const result = await pool.query<VersionQueryRow>({
      text: 'SELECT version() AS version, now() AS server_time',
    });

    const elapsedMs = Date.now() - startTime;
    const row = result.rows[0];

    res.status(200).json({
      ok: true,
      provider,
      status: 'connected',
      elapsedMs,
      serverTime: toIsoTime(row?.server_time),
      databaseVersion: row?.version,
    });
  } catch (error) {
    const elapsedMs = Date.now() - startTime;

    console.error('[datasource:test] connection failed', error);

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
