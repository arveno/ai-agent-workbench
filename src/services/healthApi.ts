import type { HealthCheckResponse, HealthServiceStatus } from '@/types/health';

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
      groq: createCloudBaseHealthService('模型状态由 CloudBase Agent Run 事件和 fallback metadata 体现。'),
      supabase: createCloudBaseHealthService('当前默认使用 CloudBase Auth，不检查 Supabase。'),
      postgres: createCloudBaseHealthService('CloudBase 默认链路不检查 legacy PostgreSQL。'),
    },
  };
}

export async function requestHealthCheck(): Promise<HealthCheckResponse> {
  return createCloudBaseDefaultHealthCheck();
}
