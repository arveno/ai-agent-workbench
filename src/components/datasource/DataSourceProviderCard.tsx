import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
    return 'datasource-badge datasource-badge-muted';
  }

  if (displayStatus === 'connected') {
    return 'datasource-badge datasource-badge-success';
  }

  if (displayStatus === 'testing') {
    return 'datasource-badge datasource-badge-active';
  }

  if (displayStatus === 'error') {
    return 'datasource-badge datasource-badge-error';
  }

  return 'datasource-badge datasource-badge-muted';
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

function getSchemaStatusLabel(schemaState?: DataSourceProviderSchemaRuntimeState): string {
  if (!schemaState || schemaState.status === 'idle') {
    return 'Schema 未读取';
  }

  if (schemaState.status === 'loading') {
    return 'Schema 读取中';
  }

  if (schemaState.status === 'success') {
    return 'Schema 读取成功';
  }

  return 'Schema 读取失败';
}

function getSchemaStatusClassName(schemaState?: DataSourceProviderSchemaRuntimeState): string {
  if (schemaState?.status === 'loading') {
    return 'datasource-badge datasource-badge-active';
  }

  if (schemaState?.status === 'success') {
    return 'datasource-badge datasource-badge-success';
  }

  if (schemaState?.status === 'error') {
    return 'datasource-badge datasource-badge-error';
  }

  return 'datasource-badge datasource-badge-muted';
}

function getPreviewTableNames(schemaState?: DataSourceProviderSchemaRuntimeState): string[] {
  if (schemaState?.status !== 'success' || !schemaState.tables || schemaState.tables.length === 0) {
    return [];
  }

  return schemaState.tables.slice(0, 5).map((table) => table.tableName);
}

function getHiddenTableCount(schemaState?: DataSourceProviderSchemaRuntimeState): number {
  if (schemaState?.status !== 'success' || !schemaState.tables || schemaState.tables.length <= 5) {
    return 0;
  }

  return schemaState.tables.length - 5;
}

function getEnvironmentModeLabel(connectionMode: string): string {
  return connectionMode === 'Server Env' ? '服务端环境变量' : connectionMode;
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
  const hiddenTableCount = getHiddenTableCount(schemaState);

  return (
    <Card size="sm" className="datasource-provider-card">
      <CardHeader className="datasource-provider-card-header">
        <div className="datasource-provider-title-group">
          <div className="datasource-provider-icon">
            <AppIcon icon={icons.database} size={18} />
          </div>
          <div className="datasource-provider-title-wrap">
            <CardTitle className="datasource-provider-name">{provider.name}</CardTitle>
            <CardDescription className="datasource-provider-description">{provider.description}</CardDescription>
            {provider.relationHint ? (
              <p className="datasource-provider-relation-hint">{provider.relationHint}</p>
            ) : null}
          </div>
        </div>

        <div className="datasource-provider-badge-group">
          {provider.demoBadgeText ? (
            <Badge variant="outline" className="datasource-badge datasource-demo-badge">
              {provider.demoBadgeText}
            </Badge>
          ) : null}
          <Badge variant="outline" className={getStatusClassName(provider, displayStatus)}>
            {getStatusLabel(provider, displayStatus)}
          </Badge>
          <Badge variant="outline" className={getSchemaStatusClassName(schemaState)}>
            {getSchemaStatusLabel(schemaState)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="datasource-provider-card-content">
        <div className="datasource-provider-meta">
          <div className="datasource-provider-meta-item">
            <span className="datasource-provider-meta-label">连接方式</span>
            <span className="datasource-provider-meta-value">{getEnvironmentModeLabel(provider.meta.connectionMode)}</span>
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

        <Separator className="datasource-provider-separator" />

        <div className="datasource-provider-status-panel">
          <div className="datasource-provider-status-row">
            <span>连接状态</span>
            <strong>{getStatusLabel(provider, displayStatus)}</strong>
            {typeof runtimeState?.elapsedMs === 'number' ? <em>{runtimeState.elapsedMs}ms</em> : null}
          </div>
          <div className="datasource-provider-status-row">
            <span>Schema 状态</span>
            <strong>{getSchemaStatusLabel(schemaState)}</strong>
            {typeof schemaState?.elapsedMs === 'number' ? <em>{schemaState.elapsedMs}ms</em> : null}
          </div>
        </div>

        <div className="datasource-provider-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTestConnection}
            disabled={!canTestConnection || isTesting}
          >
            {testButtonLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReadSchema}
            disabled={!canReadSchemaAction || isReadingSchema}
          >
            {readSchemaButtonLabel}
          </Button>
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
              {hiddenTableCount > 0 ? (
                <li className="datasource-provider-table-item datasource-provider-table-more">
                  等 {hiddenTableCount} 张表
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
