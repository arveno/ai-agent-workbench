import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type {
  DataSourceProvider,
  DataSourceSchemaResponse,
  DataSourceTestResponse,
  DataSourceTestableProviderId,
} from '../../types/workbench';
import { readDataSourceSchema, testDataSourceConnection } from '../../services/datasourceApi';
import {
  DataSourceProviderCard,
  type DataSourceProviderRuntimeState,
  type DataSourceProviderSchemaRuntimeState,
} from './DataSourceProviderCard';

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
  {
    id: 'postgresql',
    name: '外部关系型数据库（历史占位）',
    description: '外部数据库接入暂不开放；当前正式数据能力已收敛到 CloudBase MySQL。',
    status: 'idle',
    enabled: false,
    comingSoon: true,
    meta: {
      connectionMode: '已下线',
    },
  },
];

type ProviderTestState = Partial<Record<DataSourceTestableProviderId, DataSourceProviderRuntimeState>>;

type ProviderSchemaState = Partial<
  Record<DataSourceTestableProviderId, DataSourceProviderSchemaRuntimeState>
>;

type DataSourceTabId = 'all' | 'connected' | 'testable' | 'planned';

interface DataSourceTabDefinition {
  id: DataSourceTabId;
  label: string;
  description: string;
}

const DATA_SOURCE_TABS: DataSourceTabDefinition[] = [
  {
    id: 'all',
    label: '全部数据源',
    description: '查看 Agent 可用的数据上下文和后续预留项。',
  },
  {
    id: 'connected',
    label: '已连接',
    description: '当前 CloudBase 主线已经接入的数据源。',
  },
  {
    id: 'testable',
    label: '可测试',
    description: '当前不提供前端直接测试外部数据库连接。',
  },
  {
    id: 'planned',
    label: '规划中',
    description: '后续预留接入的数据源类型。',
  },
];

function isTestableProvider(providerId: DataSourceProvider['id']): providerId is DataSourceTestableProviderId {
  void providerId;
  return false;
}

function isConnectedProvider(
  provider: DataSourceProvider,
  providerTestState: ProviderTestState,
  providerSchemaState: ProviderSchemaState
): boolean {
  if (provider.status === 'connected') {
    return true;
  }

  if (!isTestableProvider(provider.id)) {
    return false;
  }

  return providerTestState[provider.id]?.status === 'success' || providerSchemaState[provider.id]?.status === 'success';
}

function getProvidersByTab(
  tabId: DataSourceTabId,
  providerTestState: ProviderTestState,
  providerSchemaState: ProviderSchemaState
): DataSourceProvider[] {
  if (tabId === 'all') {
    return DATA_SOURCE_PROVIDERS;
  }

  if (tabId === 'connected') {
    return DATA_SOURCE_PROVIDERS.filter((provider) =>
      isConnectedProvider(provider, providerTestState, providerSchemaState)
    );
  }

  if (tabId === 'testable') {
    return DATA_SOURCE_PROVIDERS.filter((provider) => isTestableProvider(provider.id));
  }

  return DATA_SOURCE_PROVIDERS.filter((provider) => provider.comingSoon);
}

function buildTestSuccessMessage(response: DataSourceTestResponse): string {
  if (!response.ok) {
    return response.errorMessage;
  }

  return `连接成功，用时 ${response.elapsedMs}ms`;
}

function buildSchemaSuccessMessage(response: DataSourceSchemaResponse): string {
  if (!response.ok) {
    return response.errorMessage;
  }

  return `Schema 读取成功，共 ${response.tableCount} 张表，用时 ${response.elapsedMs}ms`;
}

export function DataSourceModal() {
  const isDataSourceModalOpen = useWorkbenchStore((state) => state.isDataSourceModalOpen);
  const closeDataSourceModal = useWorkbenchStore((state) => state.closeDataSourceModal);
  const [providerTestState, setProviderTestState] = useState<ProviderTestState>({});
  const [providerSchemaState, setProviderSchemaState] = useState<ProviderSchemaState>({});

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

  const handleTestConnection = async (provider: DataSourceTestableProviderId) => {
    setProviderTestState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: 'testing',
        message: '正在测试连接...',
      },
    }));

    try {
      const response = await testDataSourceConnection(provider);

      if (response.ok) {
        setProviderTestState((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            status: 'success',
            message: buildTestSuccessMessage(response),
            elapsedMs: response.elapsedMs,
          },
        }));

        return;
      }

      setProviderTestState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          status: 'error',
          message: response.errorMessage,
          elapsedMs: response.elapsedMs,
        },
      }));
    } catch {
      setProviderTestState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          status: 'error',
          message: '连接失败，请检查服务端环境变量或网络配置',
        },
      }));
    }
  };

  const handleReadSchema = async (provider: DataSourceTestableProviderId) => {
    setProviderSchemaState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: 'loading',
        message: '正在读取 Schema...',
      },
    }));

    try {
      const response = await readDataSourceSchema(provider);

      if (response.ok) {
        setProviderSchemaState((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            status: 'success',
            message: buildSchemaSuccessMessage(response),
            elapsedMs: response.elapsedMs,
            schemas: response.schemas,
            tableCount: response.tableCount,
            tables: response.tables,
            readAt: response.readAt,
          },
        }));

        return;
      }

      setProviderSchemaState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          status: 'error',
          message: response.errorMessage,
          elapsedMs: response.elapsedMs,
        },
      }));
    } catch {
      setProviderSchemaState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          status: 'error',
          message: '读取 Schema 失败，请检查服务端环境变量、数据库连接或网络配置。',
        },
      }));
    }
  };

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
              查看 Agent 可用的数据上下文。当前版本只展示服务端受控数据源，前端不保存数据库连接串。
            </p>
            <p className="datasource-modal-relation-note">
              说明：数据分析和知识检索都通过 CloudBase HTTP Functions 访问 CloudBase MySQL。
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
              <p>模型只提出工具意图，实际查询由服务端白名单工具和权限校验控制。</p>
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
              const providers = getProvidersByTab(tab.id, providerTestState, providerSchemaState);

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
                        {providers.map((provider) => {
                          if (isTestableProvider(provider.id)) {
                            const testableProviderId = provider.id;
                            const testState = providerTestState[testableProviderId];
                            const schemaState = providerSchemaState[testableProviderId];
                            const canReadSchema = testState?.status === 'success';

                            return (
                              <DataSourceProviderCard
                                key={provider.id}
                                provider={provider}
                                runtimeState={testState}
                                schemaState={schemaState}
                                canReadSchema={canReadSchema}
                                onTestConnection={() => {
                                  void handleTestConnection(testableProviderId);
                                }}
                                onReadSchema={() => {
                                  void handleReadSchema(testableProviderId);
                                }}
                              />
                            );
                          }

                          return <DataSourceProviderCard key={provider.id} provider={provider} />;
                        })}
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
