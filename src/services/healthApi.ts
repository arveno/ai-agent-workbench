import type { HealthCheckResponse, HealthServiceStatus } from '@/types/health';
import { buildApiPath, isCloudBasePrivateApiEnabled } from './cloudbaseApiClient';

let healthCheckInFlight: Promise<HealthCheckResponse> | null = null;

function createPreviewHealthService(message: string): HealthServiceStatus {
  return {
    configured: false,
    status: 'not_configured',
    message,
  };
}

function createCloudBasePreviewHealthCheck(): HealthCheckResponse {
  return {
    ok: true,
    environment: 'development',
    checkedAt: new Date().toISOString(),
    services: {
      groq: createPreviewHealthService('CloudBase preview 未检查 legacy Groq health。'),
      supabase: createPreviewHealthService('CloudBase preview 使用 CloudBase Auth 迁移链路，未检查 Supabase。'),
      postgres: createPreviewHealthService('CloudBase preview 未检查 legacy PostgreSQL。'),
    },
  };
}

export async function requestHealthCheck(): Promise<HealthCheckResponse> {
  if (isCloudBasePrivateApiEnabled()) {
    return createCloudBasePreviewHealthCheck();
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
