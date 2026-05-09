import { useState } from 'react';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import type { DataSourceProvider } from '../../types/workbench';

interface DataSourceProviderCardProps {
  provider: DataSourceProvider;
}

function getStatusLabel(provider: DataSourceProvider): string {
  if (provider.comingSoon) {
    return '即将支持';
  }

  if (provider.status === 'connected') {
    return '已连接';
  }

  if (provider.status === 'disconnected') {
    return '未连接';
  }

  if (provider.status === 'testing') {
    return '测试中';
  }

  if (provider.status === 'error') {
    return '连接异常';
  }

  return '未配置';
}

function getStatusClassName(provider: DataSourceProvider): string {
  if (provider.comingSoon) {
    return 'datasource-status-badge datasource-status-badge-muted';
  }

  if (provider.status === 'connected') {
    return 'datasource-status-badge datasource-status-badge-success';
  }

  if (provider.status === 'testing') {
    return 'datasource-status-badge datasource-status-badge-active';
  }

  if (provider.status === 'error') {
    return 'datasource-status-badge datasource-status-badge-error';
  }

  return 'datasource-status-badge datasource-status-badge-muted';
}

export function DataSourceProviderCard({ provider }: DataSourceProviderCardProps) {
  const [hint, setHint] = useState('');
  const schemaText = provider.meta.schemas && provider.meta.schemas.length > 0 ? provider.meta.schemas.join(', ') : '未读取';
  const tableCountText =
    typeof provider.meta.tableCount === 'number' ? String(provider.meta.tableCount) : '-';
  const rowCountText = provider.meta.rowCountLabel ?? '-';
  const updatedAtText = provider.meta.updatedAt ?? '-';
  const isActionDisabled = provider.comingSoon;

  const handleAction = () => {
    setHint('真实连接将在 Step 40 接入');
  };

  return (
    <article className="datasource-provider-card">
      <div className="datasource-provider-card-header">
        <div className="datasource-provider-title-group">
          <div className="datasource-provider-icon">
            <AppIcon icon={icons.database} size={18} />
          </div>
          <div className="datasource-provider-title-wrap">
            <h4 className="datasource-provider-name">{provider.name}</h4>
            <p className="datasource-provider-description">{provider.description}</p>
          </div>
        </div>

        <span className={getStatusClassName(provider)}>{getStatusLabel(provider)}</span>
      </div>

      <div className="datasource-provider-meta">
        <div className="datasource-provider-meta-item">
          <span className="datasource-provider-meta-label">连接方式</span>
          <span className="datasource-provider-meta-value">{provider.meta.connectionMode}</span>
        </div>
        <div className="datasource-provider-meta-item">
          <span className="datasource-provider-meta-label">数据库</span>
          <span className="datasource-provider-meta-value">{provider.meta.database ?? '-'}</span>
        </div>
        <div className="datasource-provider-meta-item">
          <span className="datasource-provider-meta-label">Schema</span>
          <span className="datasource-provider-meta-value">{schemaText}</span>
        </div>
        <div className="datasource-provider-meta-item">
          <span className="datasource-provider-meta-label">表数量</span>
          <span className="datasource-provider-meta-value">{tableCountText}</span>
        </div>
        <div className="datasource-provider-meta-item">
          <span className="datasource-provider-meta-label">数据量</span>
          <span className="datasource-provider-meta-value">{rowCountText}</span>
        </div>
        <div className="datasource-provider-meta-item">
          <span className="datasource-provider-meta-label">更新时间</span>
          <span className="datasource-provider-meta-value">{updatedAtText}</span>
        </div>
      </div>

      <div className="datasource-provider-actions">
        <button
          type="button"
          className="datasource-provider-action-button"
          onClick={handleAction}
          disabled={isActionDisabled}
        >
          测试连接
        </button>
        <button
          type="button"
          className="datasource-provider-action-button"
          onClick={handleAction}
          disabled={isActionDisabled}
        >
          读取 Schema
        </button>
      </div>

      {hint ? <p className="datasource-provider-hint">{hint}</p> : null}
    </article>
  );
}

