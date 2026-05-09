import { useEffect } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { DataSourceProvider } from '../../types/workbench';
import { DataSourceProviderCard } from './DataSourceProviderCard';

const DATA_SOURCE_PROVIDERS: DataSourceProvider[] = [
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: '用于读取业务表结构和执行受控查询',
    status: 'connected',
    enabled: true,
    meta: {
      connectionMode: 'Server Env',
      database: 'edu_analytics_prod',
      schemas: ['public', 'dim', 'fact', 'metrics'],
      tableCount: 12,
      rowCountLabel: '2.4M rows',
      updatedAt: '2026-05-17 10:00:00',
    },
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: '基于 PostgreSQL 的托管数据源，适合公开 Demo 快速接入',
    status: 'disconnected',
    enabled: false,
    meta: {
      connectionMode: 'Server Env',
      schemas: [],
      tableCount: undefined,
      rowCountLabel: undefined,
      updatedAt: undefined,
    },
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: '预留企业常见业务库接入方式',
    status: 'idle',
    enabled: false,
    comingSoon: true,
    meta: {
      connectionMode: '暂未开放',
    },
  },
];

export function DataSourceModal() {
  const isDataSourceModalOpen = useWorkbenchStore((state) => state.isDataSourceModalOpen);
  const closeDataSourceModal = useWorkbenchStore((state) => state.closeDataSourceModal);

  useEffect(() => {
    if (!isDataSourceModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDataSourceModal();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeDataSourceModal, isDataSourceModalOpen]);

  if (!isDataSourceModalOpen) {
    return null;
  }

  return (
    <div
      className="datasource-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="数据源配置"
      onClick={closeDataSourceModal}
    >
      <div
        className="datasource-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="datasource-modal-header">
          <div>
            <h3 className="datasource-modal-title">数据源配置</h3>
            <p className="datasource-modal-description">
              配置 Agent 可访问的数据源。第一版仅支持服务端受控连接，前端不保存数据库连接串。
            </p>
          </div>
          <button
            type="button"
            className="datasource-modal-close"
            onClick={closeDataSourceModal}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        <div className="datasource-modal-body">
          <div className="datasource-provider-grid">
            {DATA_SOURCE_PROVIDERS.map((provider) => (
              <DataSourceProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        </div>

        <footer className="datasource-modal-footer">
          <button type="button" className="datasource-modal-close-button" onClick={closeDataSourceModal}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}

