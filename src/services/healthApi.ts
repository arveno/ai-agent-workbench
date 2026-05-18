import type { HealthCheckResponse, HealthServiceStatus } from '@/types/health';

function createCloudBaseHealthService(params: {
  configured: boolean;
  status: HealthServiceStatus['status'];
  message: string;
}): HealthServiceStatus {
  return {
    configured: params.configured,
    status: params.status,
    message: params.message,
  };
}

function createCloudBaseDefaultHealthCheck(): HealthCheckResponse {
  return {
    ok: true,
    environment: 'development',
    checkedAt: new Date().toISOString(),
    services: {
      groq: createCloudBaseHealthService({
        configured: false,
        status: 'not_configured',
        message: '真实 Agent 模型 Provider 未配置时会显示明确状态，不影响公开演示 Mock 流程。',
      }),
      supabase: createCloudBaseHealthService({
        configured: true,
        status: 'configured',
        message: 'CloudBase Auth 状态由当前登录态和 /api/auth/me 表达，前端不把未检测写成未配置。',
      }),
      postgres: createCloudBaseHealthService({
        configured: true,
        status: 'configured',
        message: 'CloudBase MySQL 由 CloudBase HTTP Functions 受控访问，前端不直连数据库。',
      }),
    },
  };
}

export async function requestHealthCheck(): Promise<HealthCheckResponse> {
  return createCloudBaseDefaultHealthCheck();
}
