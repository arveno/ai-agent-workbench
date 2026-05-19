export type HealthEnvironment = 'development' | 'preview' | 'production' | 'unknown';

export type HealthServiceState = 'not_configured' | 'configured' | 'connected' | 'error';

export interface HealthServiceStatus {
  configured: boolean;
  status: HealthServiceState;
  message: string;
  elapsedMs?: number;
}

export interface HealthCheckResponse {
  ok: boolean;
  environment: HealthEnvironment;
  checkedAt: string;
  services: {
    modelGateway: HealthServiceStatus;
    supabase: HealthServiceStatus;
    postgres: HealthServiceStatus;
  };
}
