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
      supabase: createCloudBaseHealthService('CloudBase Auth 由登录 session 和 /api/auth/me 验证。'),
      postgres: createCloudBaseHealthService('CloudBase MySQL 由 CloudBase HTTP Functions 受控访问。'),
    },
  };
}

export async function requestHealthCheck(): Promise<HealthCheckResponse> {
  return createCloudBaseDefaultHealthCheck();
}
