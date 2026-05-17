import type { HealthCheckResponse, HealthServiceStatus } from '@/types/health';
import { buildApiPath, isCloudBasePrivateApiEnabled } from './cloudbaseApiClient';

let healthCheckInFlight: Promise<HealthCheckResponse> | null = null;

function createCloudBaseHealthService(message: string): HealthServiceStatus {
  return {
    configured: false,
    status: 'not_configured',
    message,
  };
}

function createCloudBaseDefaultHealthCheck(): HealthCheckResponse {
  return {
    ok: true,
    environment: 'development',
    checkedAt: new Date().toISOString(),
    services: {
      groq: createCloudBaseHealthService('CloudBase 默认链路不检查 legacy Groq health。'),
      supabase: createCloudBaseHealthService('当前默认使用 CloudBase Auth，不检查 Supabase。'),
      postgres: createCloudBaseHealthService('CloudBase 默认链路不检查 legacy PostgreSQL。'),
    },
  };
}

export async function requestHealthCheck(): Promise<HealthCheckResponse> {
  if (isCloudBasePrivateApiEnabled()) {
    return createCloudBaseDefaultHealthCheck();
  }

  if (healthCheckInFlight) {
    return healthCheckInFlight;
  }

  healthCheckInFlight = fetch(buildApiPath('/api/health'), {
    method: 'GET',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('环境状态检查失败');
      }

      return (await response.json()) as HealthCheckResponse;
    })
    .finally(() => {
      healthCheckInFlight = null;
    });

  return healthCheckInFlight;
}
