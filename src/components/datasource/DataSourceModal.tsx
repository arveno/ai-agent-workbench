import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { DataSourceProvider } from '../../types/workbench';
import { DataSourceProviderCard } from './DataSourceProviderCard';

const DATA_SOURCE_PROVIDERS: DataSourceProvider[] = [
  {
    id: 'mysql',
    name: 'CloudBase MySQL',
    description: '当前正式数据上下文，由 CloudBase HTTP Functions 受控访问。',
    relationHint: 'Agent Run 的 teaching_metrics 数据工具和 knowledge_search 均读取 CloudBase MySQL。',
    demoBadgeText: '当前主线数据源',
    status: 'connected',
    enabled: true,
    meta: {
      connectionMode: 'CloudBase HTTP Functions',
      database: 'CloudBase MySQL',
      schemas: ['teaching_metrics', 'knowledge_documents', 'knowledge_chunks'],
      tableCount: 3,
      rowCountLabel: '由 CloudBase seed 与业务表提供',
      updatedAt: undefined,
    },
  },
];

type DataSourceTabId = 'all' | 'connected';

interface DataSourceTabDefinition {
  id: DataSourceTabId;
  label: string;
  description: string;
}

const DATA_SOURCE_TABS: DataSourceTabDefinition[] = [
  {
    id: 'all',
    label: '全部',
    description: '查看当前工作台可用的数据上下文。',
  },
  {
    id: 'connected',
    label: '当前主线',
    description: '当前 CloudBase 主线已经接入的数据源。',
  },
];

function getProvidersByTab(tabId: DataSourceTabId): DataSourceProvider[] {
  if (tabId === 'all') {
    return DATA_SOURCE_PROVIDERS;
  }

  return DATA_SOURCE_PROVIDERS.filter((provider) => provider.status === 'connected');
}

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
      aria-label="数据源管理"
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
            <h3 className="datasource-modal-title">数据源管理</h3>
            <p className="datasource-modal-description">
              查看 Agent 可用的数据上下文。当前不是完整数据源 CRUD，只展示服务端受控数据源，前端不保存数据库连接串。
            </p>
            <p className="datasource-modal-relation-note">
              说明：数据分析、RAG 检索和报告生成都通过 CloudBase HTTP Functions 与服务端工具访问 CloudBase MySQL。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="datasource-modal-close"
            onClick={closeDataSourceModal}
            aria-label="关闭"
          >
            ×
          </Button>
        </header>

        <div className="datasource-modal-body">
          <Card className="datasource-modal-info-card" size="sm">
            <CardContent className="datasource-modal-info-content">
              <p>当前主线使用 CloudBase MySQL，Agent Run 的数据分析和 RAG 检索均通过受控函数读取。</p>
              <p>前端不保存数据库连接串，也不直接连接数据库。</p>
              <p>模型只提出工具意图，实际查询由 CloudBase HTTP Functions、服务端白名单工具和权限校验控制。</p>
            </CardContent>
          </Card>

          <Tabs defaultValue="all" className="datasource-tabs">
            <TabsList className="datasource-tabs-list">
              {DATA_SOURCE_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="datasource-tab-trigger">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {DATA_SOURCE_TABS.map((tab) => {
              const providers = getProvidersByTab(tab.id);

              return (
                <TabsContent key={tab.id} value={tab.id} className="datasource-tab-content">
                  <div className="datasource-tab-heading">
                    <div>
                      <h4 className="datasource-tab-title">{tab.label}</h4>
                      <p className="datasource-tab-description">{tab.description}</p>
                    </div>
                    <span className="datasource-tab-count">{providers.length} 个数据源</span>
                  </div>

                  <ScrollArea className="datasource-scroll">
                    {providers.length > 0 ? (
                      <div className="datasource-provider-grid">
                        {providers.map((provider) => (
                          <DataSourceProviderCard key={provider.id} provider={provider} />
                        ))}
                      </div>
                    ) : (
                      <div className="datasource-empty-state">暂无该类型数据源</div>
                    )}
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>

        <footer className="datasource-modal-footer">
          <Button type="button" variant="outline" onClick={closeDataSourceModal}>
            关闭
          </Button>
        </footer>
      </div>
    </div>
  );
}
