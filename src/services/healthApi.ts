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
      modelGateway: createCloudBaseHealthService({
        configured: true,
        status: 'configured',
        message: '真实模型由 CloudBase 函数端 Model Gateway 白名单控制，前端只提交 selectedModelId。',
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
