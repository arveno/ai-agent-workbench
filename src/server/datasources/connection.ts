/// <reference types="node" />

import dotenv from 'dotenv';
import path from 'node:path';
import { Pool } from 'pg';
import type { DataSourceTestableProviderId } from '../../types/workbench';

const CONNECT_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_MS = 5000;

let hasLoadedLocalEnv = false;

export function ensureServerEnvLoaded(): void {
  if (hasLoadedLocalEnv) {
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    dotenv.config({
      path: [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env')],
      quiet: true,
    });
  }

  hasLoadedLocalEnv = true;
}

export function getConnectionStringByProvider(provider: DataSourceTestableProviderId): string | null {
  ensureServerEnvLoaded();

  if (provider === 'postgresql') {
    return process.env.POSTGRES_CONNECTION_STRING ?? null;
  }

  return process.env.SUPABASE_DB_CONNECTION_STRING ?? null;
}

export function createPostgresPool(params: {
  provider: DataSourceTestableProviderId;
  connectionString: string;
}): Pool {
  return new Pool({
    connectionString: params.connectionString,
    max: 1,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    ssl: params.provider === 'supabase' ? { rejectUnauthorized: false } : undefined,
  });
}
