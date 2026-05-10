import type { HealthCheckResponse } from '@/types/health';

export async function requestHealthCheck(): Promise<HealthCheckResponse> {
  const response = await fetch('/api/health', {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('环境状态检查失败');
  }

  return (await response.json()) as HealthCheckResponse;
}
