import { useEffect, useMemo, useState } from 'react';
import { requestHealthCheck } from '../../services/healthApi';
import type { HealthCheckResponse, HealthServiceStatus } from '../../types/health';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

type HealthUiState = 'demo' | 'ready';

function getServiceText(service: HealthServiceStatus): string {
  if (service.status === 'connected') {
    return '已连接';
  }

  if (service.status === 'configured') {
    return '已配置';
  }

  if (service.status === 'error') {
    return '连接失败';
  }

  return '未配置';
}

function isRealAgentReady(health: HealthCheckResponse): boolean {
  return (
    health.services.groq.configured &&
    health.services.supabase.status === 'connected' &&
    health.services.postgres.status === 'connected'
  );
}

function getHealthUiState(health: HealthCheckResponse | null): HealthUiState {
  if (!health) {
    return 'demo';
  }

  return isRealAgentReady(health) ? 'ready' : 'demo';
}

function getBadgeText(state: HealthUiState): string {
  return state === 'ready' ? '真实 Agent 已就绪' : '公开演示可用';
}

function getSummaryText(health: HealthCheckResponse | null, failed: boolean, state: HealthUiState): string {
  if (state === 'ready') {
    return '模型服务和数据源连接正常，可体验真实 Agent Run。';
  }

  if (failed) {
    return '环境状态检查失败，但公开演示模式不受影响。';
  }

  if (!health) {
    return '当前可使用公开演示模式完整体验 Agent 工作台流程。正在检查真实 Agent 环境。';
  }

  const hasServiceError = health.services.supabase.status === 'error' || health.services.postgres.status === 'error';
  const hasAllMissingConfig =
    !health.services.groq.configured &&
    health.services.supabase.status === 'not_configured' &&
    health.services.postgres.status === 'not_configured';

  if (hasAllMissingConfig) {
    return '当前可使用公开演示模式完整体验 Agent 工作台流程。真实 Agent 需要服务端配置模型和数据源环境变量。';
  }

  if (hasServiceError) {
    return '部分真实服务未配置或连接异常，当前仍可使用公开演示模式。';
  }

  return '部分真实服务未配置，当前仍可使用公开演示模式。';
}

export function EnvironmentStatus() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const uiState = useMemo(() => getHealthUiState(health), [health]);
  const isLoadingHealth = !health && !hasFailed;
  const groqMessageFallback = hasFailed ? '环境检查失败，暂未获取模型配置状态。' : '正在读取服务端模型配置状态。';
  const supabaseMessageFallback = hasFailed ? '环境检查失败，暂未获取 Supabase 状态。' : '正在检查 Supabase 数据源。';
  const postgresMessageFallback = hasFailed ? '环境检查失败，暂未获取 PostgreSQL 状态。' : '正在检查 PostgreSQL 数据源。';

  useEffect(() => {
    let isMounted = true;

    void requestHealthCheck()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setHealth(response);
        setHasFailed(false);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setHasFailed(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`environment-status-trigger environment-status-trigger-${uiState}`}
            aria-label="环境状态"
          >
            <span className="environment-status-dot" aria-hidden="true"></span>
            <span>{getBadgeText(uiState)}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" sideOffset={8} className="environment-status-detail">
          <div className="environment-status-detail-title">{getSummaryText(health, hasFailed, uiState)}</div>
          {isLoadingHealth ? (
            <div className="environment-status-skeleton-list">
              <Skeleton className="environment-status-skeleton" />
              <Skeleton className="environment-status-skeleton" />
              <Skeleton className="environment-status-skeleton" />
            </div>
          ) : (
            <>
              <div className="environment-status-row">
                <span>公开演示模式</span>
                <Badge variant="outline" className="environment-status-value">
                  可用
                </Badge>
              </div>
              <div className="environment-status-row">
                <span>运行环境</span>
                <Badge variant="outline" className="environment-status-value">
                  {health?.environment ?? '-'}
                </Badge>
              </div>
              <div className="environment-status-row">
                <span>Groq</span>
                <Badge variant="outline" className="environment-status-value">
                  {health ? getServiceText(health.services.groq) : '-'}
                </Badge>
              </div>
              <div className="environment-status-message">
                {health?.services.groq.message ?? groqMessageFallback}
              </div>
              <div className="environment-status-row">
                <span>Supabase</span>
                <Badge variant="outline" className="environment-status-value">
                  {health ? getServiceText(health.services.supabase) : '-'}
                </Badge>
              </div>
              <div className="environment-status-message">
                {health?.services.supabase.message ?? supabaseMessageFallback}
              </div>
              <div className="environment-status-row">
                <span>PostgreSQL</span>
                <Badge variant="outline" className="environment-status-value">
                  {health ? getServiceText(health.services.postgres) : '-'}
                </Badge>
              </div>
              <div className="environment-status-message">
                {health?.services.postgres.message ?? postgresMessageFallback}
              </div>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
