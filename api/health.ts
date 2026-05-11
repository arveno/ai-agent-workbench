import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { QueryResultRow } from 'pg';
import {
  createPostgresPool,
  ensureServerEnvLoaded,
  getConnectionStringByProvider,
} from '../src/server/datasources/connection';
import type { DataSourceTestableProviderId } from '../src/types/workbench';
import type {
  HealthCheckResponse,
  HealthEnvironment,
  HealthServiceStatus,
} from '../src/types/health';

interface HealthQueryRow extends QueryResultRow {
  ok?: number;
}

function getRuntimeEnvironment(): HealthEnvironment {
  if (process.env.VERCEL_ENV === 'production') {
    return 'production';
  }

  if (process.env.VERCEL_ENV === 'preview') {
    return 'preview';
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'development';
  }

  return 'unknown';
}

function createGroqStatus(): HealthServiceStatus {
  ensureServerEnvLoaded();

  if (process.env.GROQ_API_KEY?.trim()) {
    return {
      configured: true,
      status: 'configured',
      message: '已配置服务端 Groq Key',
    };
  }

  return {
    configured: false,
    status: 'not_configured',
    message: '未配置服务端 Groq Key，真实 Agent 暂不可用，可使用公开演示模式',
  };
}

function getMissingConnectionStatus(): HealthServiceStatus {
  return {
    configured: false,
    status: 'not_configured',
    message: '未配置服务端连接环境变量',
  };
}

function getConnectionErrorStatus(elapsedMs: number): HealthServiceStatus {
  return {
    configured: true,
    status: 'error',
    message: '数据源连接失败，请检查服务端环境变量或网络配置',
    elapsedMs,
  };
}

function getSafeErrorLog(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return 'unknown error';
}

async function checkDataSource(provider: DataSourceTestableProviderId): Promise<HealthServiceStatus> {
  const connectionString = getConnectionStringByProvider(provider);

  if (!connectionString) {
    return getMissingConnectionStatus();
  }

  const startTime = Date.now();
  const pool = createPostgresPool({
    provider,
    connectionString,
  });

  try {
    const result = await pool.query<HealthQueryRow>({
      text: 'select 1 as ok',
    });
    const elapsedMs = Date.now() - startTime;
    const isConnected = result.rows[0]?.ok === 1;

    return isConnected
      ? {
          configured: true,
          status: 'connected',
          message: '数据源连接正常',
          elapsedMs,
        }
      : getConnectionErrorStatus(elapsedMs);
  } catch (error) {
    const elapsedMs = Date.now() - startTime;

    console.error(`[health] ${provider} connection check failed: ${getSafeErrorLog(error)}`);

    return getConnectionErrorStatus(elapsedMs);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function isHealthy(response: HealthCheckResponse): boolean {
  return (
    response.services.groq.configured &&
    response.services.supabase.status === 'connected' &&
    response.services.postgres.status === 'connected'
  );
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<HealthCheckResponse | { ok: false; errorMessage: string }>,
) {
  if (req.method !== 'GET') {
    res.status(405).json({
      ok: false,
      errorMessage: 'Method not allowed',
    });
    return;
  }

  const services = {
    groq: createGroqStatus(),
    supabase: await checkDataSource('supabase'),
    postgres: await checkDataSource('postgresql'),
  };
  const response: HealthCheckResponse = {
    ok: false,
    environment: getRuntimeEnvironment(),
    checkedAt: new Date().toISOString(),
    services,
  };

  res.status(200).json({
    ...response,
    ok: isHealthy(response),
  });
}
