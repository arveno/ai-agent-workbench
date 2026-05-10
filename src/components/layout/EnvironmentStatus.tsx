import { useEffect, useMemo, useState } from 'react';
import { requestHealthCheck } from '../../services/healthApi';
import type { HealthCheckResponse, HealthServiceStatus } from '../../types/health';

type HealthUiState = 'loading' | 'success' | 'warning' | 'error';

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

function getHealthUiState(health: HealthCheckResponse | null, failed: boolean): HealthUiState {
  if (failed) {
    return 'error';
  }

  if (!health) {
    return 'loading';
  }

  if (health.services.supabase.status === 'error' || health.services.postgres.status === 'error') {
    return 'error';
  }

  if (
    !health.services.groq.configured ||
    health.services.supabase.status !== 'connected' ||
    health.services.postgres.status !== 'connected'
  ) {
    return 'warning';
  }

  return 'success';
}

function getBadgeText(state: HealthUiState): string {
  if (state === 'success') {
    return '环境正常';
  }

  if (state === 'warning') {
    return '部分服务未配置';
  }

  if (state === 'error') {
    return '环境状态异常';
  }

  return '环境检查中';
}

function getSummaryText(health: HealthCheckResponse | null, failed: boolean): string {
  if (failed) {
    return '环境状态检查失败';
  }

  if (!health) {
    return '正在检查服务端环境';
  }

  if (health.services.supabase.status === 'error' || health.services.postgres.status === 'error') {
    return '数据源连接异常';
  }

  if (!health.services.groq.configured) {
    return '模型服务未配置';
  }

  if (health.services.supabase.status !== 'connected' || health.services.postgres.status !== 'connected') {
    return '数据源未完整配置';
  }

  return '模型已配置 · 数据源已连接';
}

export function EnvironmentStatus() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const uiState = useMemo(() => getHealthUiState(health, hasFailed), [health, hasFailed]);

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
    <div className="environment-status">
      <button
        type="button"
        className={`environment-status-badge environment-status-badge-${uiState}`}
        aria-label="环境状态"
      >
        <span className="environment-status-dot" aria-hidden="true"></span>
        <span>{getBadgeText(uiState)}</span>
      </button>

      <div className="environment-status-popover" role="status">
        <div className="environment-status-popover-title">{getSummaryText(health, hasFailed)}</div>
        <div className="environment-status-row">
          <span>运行环境</span>
          <strong>{health?.environment ?? '-'}</strong>
        </div>
        <div className="environment-status-row">
          <span>Groq</span>
          <strong>{health ? getServiceText(health.services.groq) : '-'}</strong>
        </div>
        <div className="environment-status-message">
          {health?.services.groq.message ?? '正在读取服务端模型配置状态。'}
        </div>
        <div className="environment-status-row">
          <span>Supabase</span>
          <strong>{health ? getServiceText(health.services.supabase) : '-'}</strong>
        </div>
        <div className="environment-status-message">
          {health?.services.supabase.message ?? '正在检查 Supabase 数据源。'}
        </div>
        <div className="environment-status-row">
          <span>PostgreSQL</span>
          <strong>{health ? getServiceText(health.services.postgres) : '-'}</strong>
        </div>
        <div className="environment-status-message">
          {health?.services.postgres.message ?? '正在检查 PostgreSQL 数据源。'}
        </div>
      </div>
    </div>
  );
}
