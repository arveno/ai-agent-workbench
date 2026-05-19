import { useEffect, useMemo, useState } from 'react';
import { useAuthSessionView } from '@/stores/authStore';
import { useWorkbenchStore } from '@/stores/workbenchStore';
import { requestHealthCheck } from '../../services/healthApi';
import type { AuthSessionView } from '@/types/auth';
import type { HealthCheckResponse } from '../../types/health';
import type { CapabilityStatus } from '../../types/workbench';
import type { ModelProviderStatusView } from '@/types/modelStatus';
import { getModelProviderStatusView } from '@/utils/modelSelectionStatus';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

type HealthUiState = 'demo' | 'ready';

interface EnvironmentStatusBadgeView {
  label: string;
  status: CapabilityStatus;
  message: string;
}

function getStatusClassName(status: CapabilityStatus): string {
  return `environment-status-value environment-status-value-${status}`;
}

function getProviderCapabilityStatus(statusView: ModelProviderStatusView): CapabilityStatus {
  if (statusView.availability === 'available') {
    return 'available';
  }

  if (statusView.availability === 'error') {
    return 'error';
  }

  if (statusView.availability === 'reserved') {
    return 'planned';
  }

  return 'not_configured';
}

function getCloudBaseAuthStatusView(authView: AuthSessionView): EnvironmentStatusBadgeView {
  if (authView.status === 'authenticated') {
    return {
      label: '已登录',
      status: 'connected',
      message: `当前用户：${authView.displayName}。真实 Agent 仍需要额度和已配置的模型 Provider。`,
    };
  }

  if (authView.status === 'loading') {
    return {
      label: '未检测',
      status: 'not_checked',
      message: '正在恢复 CloudBase 登录态；公开演示 Mock 流程不依赖登录。',
    };
  }

  if (authView.status === 'error') {
    return {
      label: '异常',
      status: 'error',
      message: 'CloudBase 登录态检查异常；可继续使用公开演示，真实 Agent 需要重新登录后再试。',
    };
  }

  return {
    label: '访客模式',
    status: 'demo',
    message: '当前可完整体验公开演示 Mock 流程；真实 Agent 需要登录、额度和模型 Provider。',
  };
}

function getCloudBaseMysqlStatusView(params: {
  health: HealthCheckResponse | null;
  hasFailed: boolean;
}): EnvironmentStatusBadgeView {
  if (params.hasFailed) {
    return {
      label: '未检测',
      status: 'not_checked',
      message: '环境状态检查失败；数据访问仍由 CloudBase HTTP Functions 和服务端工具受控执行。',
    };
  }

  if (!params.health) {
    return {
      label: '未检测',
      status: 'not_checked',
      message: '尚未执行独立健康检查；数据读取通过 CloudBase HTTP Functions 受控访问。',
    };
  }

  const mysqlStatus = params.health.services.postgres;

  if (mysqlStatus.status === 'error') {
    return {
      label: '异常',
      status: 'error',
      message: mysqlStatus.message,
    };
  }

  return {
    label: '受控访问',
    status: 'connected',
    message: mysqlStatus.message || 'CloudBase MySQL 由 CloudBase HTTP Functions 受控访问，前端不直连数据库。',
  };
}

function getHealthUiState(params: {
  hasFailed: boolean;
  activeStatus: ModelProviderStatusView;
}): HealthUiState {
  if (params.hasFailed) {
    return 'demo';
  }

  if (params.activeStatus.providerId === 'mock-agent') {
    return 'demo';
  }

  if (params.activeStatus.isAvailable) {
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
  health: HealthCheckResponse | null;
}): string {
  if (params.hasFailed) {
    return '环境状态检查失败，但公开演示模式不受影响。';
  }

  if (params.uiState === 'ready') {
    return '当前模型可用，可体验真实 Agent Run。';
  }

  if (params.activeStatus.providerId === 'mock-agent') {
    return '当前处于公开演示模式，可完整体验 Agent 工作台流程。';
  }

  if (params.activeStatus.isAvailable) {
    return params.activeStatus.statusDescription;
  }

  if (!params.health) {
    return '正在检查真实 Agent 环境，当前可使用公开演示模式。';
  }

  return '当前模型入口为预留状态，建议切换到公开演示模式或已配置的模型。';
}

export function EnvironmentStatus() {
  const authView = useAuthSessionView();
  const selectedModelId = useWorkbenchStore((state) => state.selectedModelId);
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  const activeProviderStatus = useMemo(
    () =>
      getModelProviderStatusView({
        providerId: selectedModelId,
        selectedModelId,
      }),
    [selectedModelId],
  );

  const uiState = useMemo(
    () =>
      getHealthUiState({
        hasFailed,
        activeStatus: activeProviderStatus,
      }),
    [activeProviderStatus, hasFailed],
  );

  const cloudBaseAuthStatus = useMemo(() => getCloudBaseAuthStatusView(authView), [authView]);
  const cloudBaseMysqlStatus = useMemo(
    () => getCloudBaseMysqlStatusView({ health, hasFailed }),
    [hasFailed, health],
  );
  const activeModelStatus = getProviderCapabilityStatus(activeProviderStatus);

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
            <AppIcon icon={icons.stepDone} size={14} />
            <span className="environment-status-dot" aria-hidden="true"></span>
            <span>{getBadgeText(uiState)}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" sideOffset={8} className="environment-status-detail">
          <div className="environment-status-detail-title">
            {getSummaryText({
              hasFailed,
              uiState,
              activeStatus: activeProviderStatus,
              health,
            })}
          </div>
          <div className="environment-status-message environment-status-message-primary">
            真实 Agent 需要登录、额度和模型 Provider；数据读取通过 CloudBase HTTP Functions 受控访问。
          </div>

          <div className="environment-status-row">
            <span>公开演示模式</span>
            <Badge variant="outline" className={getStatusClassName('available')}>
              可用
            </Badge>
          </div>
          <div className="environment-status-message">
            当前可完整体验 Mock Run、Run Trace、RAG 来源和报告流程。
          </div>

          <div className="environment-status-row">
            <span>CloudBase Auth</span>
            <Badge variant="outline" className={getStatusClassName(cloudBaseAuthStatus.status)}>
              {cloudBaseAuthStatus.label}
            </Badge>
          </div>
          <div className="environment-status-message">{cloudBaseAuthStatus.message}</div>

          <div className="environment-status-row">
            <span>CloudBase MySQL</span>
            <Badge variant="outline" className={getStatusClassName(cloudBaseMysqlStatus.status)}>
              {cloudBaseMysqlStatus.label}
            </Badge>
          </div>
          <div className="environment-status-message">{cloudBaseMysqlStatus.message}</div>

          <div className="environment-status-row">
            <span>当前模型</span>
            <Badge variant="outline" className={getStatusClassName(activeModelStatus)}>
              {activeProviderStatus.displayName}
            </Badge>
          </div>
          <div className="environment-status-message">{activeProviderStatus.statusDescription}</div>

          <div className="environment-status-row">
            <span>Model Gateway</span>
            <Badge variant="outline" className={getStatusClassName(activeModelStatus)}>
              {activeProviderStatus.statusLabel}
            </Badge>
          </div>
          <div className="environment-status-message">{activeProviderStatus.statusDescription}</div>

          <div className="environment-status-row">
            <span>运行环境</span>
            <Badge variant="outline" className={getStatusClassName('not_checked')}>
              {health?.environment ?? '未检测'}
            </Badge>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
