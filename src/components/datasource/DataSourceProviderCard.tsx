import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import type {
  DataSourceConnectionStatus,
  DataSourceProvider,
  DataSourceTableSchema,
} from '../../types/workbench';

export interface DataSourceProviderRuntimeState {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  elapsedMs?: number;
}

export interface DataSourceProviderSchemaRuntimeState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  elapsedMs?: number;
  schemas?: string[];
  tableCount?: number;
  tables?: DataSourceTableSchema[];
  readAt?: string;
}

interface DataSourceProviderCardProps {
  provider: DataSourceProvider;
  runtimeState?: DataSourceProviderRuntimeState;
  schemaState?: DataSourceProviderSchemaRuntimeState;
  canReadSchema?: boolean;
  onTestConnection?: () => void;
  onReadSchema?: () => void;
}

function getStatusLabel(provider: DataSourceProvider, displayStatus: DataSourceConnectionStatus): string {
  if (provider.comingSoon) {
    return '即将支持';
  }

  if (displayStatus === 'connected') {
    return '已连接';
  }

  if (displayStatus === 'disconnected' || displayStatus === 'idle') {
    return '未测试';
  }

  if (displayStatus === 'testing') {
    return '连接中';
  }

  if (displayStatus === 'error') {
    return '连接异常';
  }

  return '未配置';
}

function getStatusClassName(provider: DataSourceProvider, displayStatus: DataSourceConnectionStatus): string {
  if (provider.comingSoon) {
    return 'datasource-status-badge datasource-status-badge-muted';
  }

  if (displayStatus === 'connected') {
    return 'datasource-status-badge datasource-status-badge-success';
  }

  if (displayStatus === 'testing') {
    return 'datasource-status-badge datasource-status-badge-active';
  }

  if (displayStatus === 'error') {
    return 'datasource-status-badge datasource-status-badge-error';
  }

  return 'datasource-status-badge datasource-status-badge-muted';
}

function getDisplayStatus(
  provider: DataSourceProvider,
  runtimeState?: DataSourceProviderRuntimeState
): DataSourceConnectionStatus {
  if (provider.comingSoon || !runtimeState || runtimeState.status === 'idle') {
    return provider.status;
  }

  if (runtimeState.status === 'testing') {
    return 'testing';
  }

  if (runtimeState.status === 'error') {
    return 'error';
  }

  return 'connected';
}

function formatReadAt(readAt?: string): string {
  if (!readAt) {
    return '-';
  }

  const date = new Date(readAt);

  if (Number.isNaN(date.getTime())) {
    return readAt;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
  });
}

function getSchemaSummary(provider: DataSourceProvider, schemaState?: DataSourceProviderSchemaRuntimeState): string {
  if (schemaState?.status === 'success' && schemaState.schemas && schemaState.schemas.length > 0) {
    return schemaState.schemas.join(', ');
  }

  if (provider.meta.schemas && provider.meta.schemas.length > 0) {
    return provider.meta.schemas.join(', ');
  }

  return '未读取';
}

function getTableCount(provider: DataSourceProvider, schemaState?: DataSourceProviderSchemaRuntimeState): string {
  if (schemaState?.status === 'success' && typeof schemaState.tableCount === 'number') {
    return String(schemaState.tableCount);
  }

  if (typeof provider.meta.tableCount === 'number') {
    return String(provider.meta.tableCount);
  }

  return '-';
}

function getUpdatedAt(provider: DataSourceProvider, schemaState?: DataSourceProviderSchemaRuntimeState): string {
  if (schemaState?.status === 'success') {
    return formatReadAt(schemaState.readAt);
  }

  return provider.meta.updatedAt ?? '-';
}

function getReadSchemaButtonLabel(schemaState?: DataSourceProviderSchemaRuntimeState): string {
  if (!schemaState || schemaState.status === 'idle') {
    return '读取 Schema';
  }

  if (schemaState.status === 'loading') {
    return '正在读取...';
  }

  return '重新读取';
}

function getPreviewTableNames(schemaState?: DataSourceProviderSchemaRuntimeState): string[] {
  if (schemaState?.status !== 'success' || !schemaState.tables || schemaState.tables.length === 0) {
    return [];
  }

  return schemaState.tables.slice(0, 3).map((table) => table.tableName);
}

export function DataSourceProviderCard({
  provider,
  runtimeState,
  schemaState,
  canReadSchema = false,
  onTestConnection,
  onReadSchema,
}: DataSourceProviderCardProps) {
  const schemaText = getSchemaSummary(provider, schemaState);
  const tableCountText = getTableCount(provider, schemaState);
  const rowCountText = provider.meta.rowCountLabel ?? '-';
  const updatedAtText = getUpdatedAt(provider, schemaState);
  const displayStatus = getDisplayStatus(provider, runtimeState);
  const isTesting = runtimeState?.status === 'testing';
  const isReadingSchema = schemaState?.status === 'loading';
  const isActionDisabled = provider.comingSoon;
  const canTestConnection = Boolean(onTestConnection) && !isActionDisabled;
  const canReadSchemaAction = Boolean(onReadSchema) && !isActionDisabled && canReadSchema;
  const testButtonLabel = isTesting
    ? '正在测试连接...'
    : runtimeState?.status === 'success' || runtimeState?.status === 'error'
      ? '重新测试'
      : '测试连接';
  const readSchemaButtonLabel = getReadSchemaButtonLabel(schemaState);
  const previewTableNames = getPreviewTableNames(schemaState);

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
            {provider.relationHint ? (
              <p className="datasource-provider-relation-hint">{provider.relationHint}</p>
            ) : null}
          </div>
        </div>

        <div className="datasource-provider-badge-group">
          {provider.demoBadgeText ? (
            <span className="datasource-demo-badge">{provider.demoBadgeText}</span>
          ) : null}
          <span className={getStatusClassName(provider, displayStatus)}>
            {getStatusLabel(provider, displayStatus)}
          </span>
        </div>
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
          onClick={onTestConnection}
          disabled={!canTestConnection || isTesting}
        >
          {testButtonLabel}
        </button>
        <button
          type="button"
          className="datasource-provider-action-button"
          onClick={onReadSchema}
          disabled={!canReadSchemaAction || isReadingSchema}
        >
          {readSchemaButtonLabel}
        </button>
      </div>

      {runtimeState?.message ? (
        <p
          className={`datasource-provider-hint ${
            runtimeState.status === 'success'
              ? 'datasource-provider-hint-success'
              : runtimeState.status === 'error'
                ? 'datasource-provider-hint-error'
                : ''
          }`}
        >
          {runtimeState.message}
        </p>
      ) : null}
      {schemaState?.message ? (
        <p
          className={`datasource-provider-hint ${
            schemaState.status === 'success'
              ? 'datasource-provider-hint-success'
              : schemaState.status === 'error'
                ? 'datasource-provider-hint-error'
                : ''
          }`}
        >
          {schemaState.message}
        </p>
      ) : null}
      {previewTableNames.length > 0 ? (
        <div className="datasource-provider-table-summary">
          <div className="datasource-provider-table-summary-title">已读取表</div>
          <ul className="datasource-provider-table-list">
            {previewTableNames.map((tableName) => (
              <li key={tableName} className="datasource-provider-table-item">
                {tableName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
