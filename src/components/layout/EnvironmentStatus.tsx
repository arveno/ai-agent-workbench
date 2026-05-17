import { useEffect, useMemo, useState } from 'react';
import { useWorkbenchStore } from '@/stores/workbenchStore';
import { requestHealthCheck } from '../../services/healthApi';
import type { HealthCheckResponse, HealthServiceStatus } from '../../types/health';
import type { ModelProviderStatusView } from '@/types/modelStatus';
import { getModelProviderStatusView } from '@/utils/modelProviderStatus';
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

function getHealthUiState(params: {
  hasFailed: boolean;
  activeStatus: ModelProviderStatusView;
}): HealthUiState {
  if (params.hasFailed) {
    return 'demo';
  }

  if (params.activeStatus.providerId === 'mock') {
    return 'demo';
  }

  if (params.activeStatus.providerId === 'groq' && params.activeStatus.isAvailable) {
    return 'ready';
  }

  return 'demo';
}

function getBadgeText(state: HealthUiState): string {
  return state === 'ready' ? '真实 Agent 已就绪' : '公开演示可用';
}

function getSummaryText(params: {
  hasFailed: boolean;
  uiState: HealthUiState;
  activeStatus: ModelProviderStatusView;
  groqStatus: ModelProviderStatusView;
  health: HealthCheckResponse | null;
}): string {
  if (params.hasFailed) {
    return '环境状态检查失败，但公开演示模式不受影响。';
  }

  if (params.uiState === 'ready') {
    return '当前模型可用，可体验真实 Agent Run。';
  }

  if (params.activeStatus.providerId === 'mock') {
    return '当前处于公开演示模式，可完整体验 Agent 工作台流程。';
  }

  if (params.activeStatus.providerId === 'groq') {
    if (params.groqStatus.isAvailable) {
      return params.groqStatus.statusDescription;
    }

    return '服务端模型 Key 未配置，可继续使用公开演示模式。';
  }

  if (!params.health) {
    return '正在检查真实 Agent 环境，当前可使用公开演示模式。';
  }

  return '当前模型入口为预留状态，建议切换到公开演示模式或已配置的模型。';
}

export function EnvironmentStatus() {
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const modelConfigs = useWorkbenchStore((state) => state.modelConfigs);
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const isLoadingHealth = !health && !hasFailed;

  const groqStatus = useMemo(
    () =>
      getModelProviderStatusView({
        providerId: 'groq',
        currentModelProvider,
        modelConfigs,
        health,
      }),
    [currentModelProvider, health, modelConfigs],
  );

  const activeProviderStatus = useMemo(
    () =>
      getModelProviderStatusView({
        providerId: currentModelProvider,
        currentModelProvider,
        modelConfigs,
        health,
      }),
    [currentModelProvider, health, modelConfigs],
  );

  const uiState = useMemo(
    () =>
      getHealthUiState({
        hasFailed,
        activeStatus: activeProviderStatus,
      }),
    [activeProviderStatus, hasFailed],
  );

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
          <div
            className="environment-status-detail-title"
          >
            {getSummaryText({
              hasFailed,
              uiState,
              activeStatus: activeProviderStatus,
              groqStatus,
              health,
            })}
          </div>
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
                <span>当前模型</span>
                <Badge variant="outline" className="environment-status-value">
                  {activeProviderStatus.displayName}
                </Badge>
              </div>
              <div className="environment-status-message">{activeProviderStatus.statusDescription}</div>
              <div className="environment-status-row">
                <span>Groq</span>
                <Badge variant="outline" className="environment-status-value">
                  {groqStatus.statusLabel}
                </Badge>
              </div>
              <div className="environment-status-message">{groqStatus.statusDescription}</div>
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
