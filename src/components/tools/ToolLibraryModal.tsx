import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { WorkbenchToolDefinition } from '../../types/workbench';
import { WORKBENCH_TOOL_DEFINITIONS } from '../../utils/toolRegistryView';
import { ToolCard } from './ToolCard';

type ToolTabId = 'all' | WorkbenchToolDefinition['status'];

interface ToolTabDefinition {
  id: ToolTabId;
  label: string;
  description: string;
}

const TOOL_TABS: ToolTabDefinition[] = [
  {
    id: 'all',
    label: '全部工具',
    description: '当前工作台展示的服务端白名单工具、本地演示能力与规划中工具。',
  },
  {
    id: 'connected',
    label: '已接入',
    description: '已经接入 CloudBase 函数或当前执行链路的受控工具。',
  },
  {
    id: 'mock',
    label: '本地演示',
    description: '仅用于公开演示或本地生成的能力，不伪装成真实 Agent 工具。',
  },
  {
    id: 'planned',
    label: '规划中',
    description: '后续阶段预留接入的工具能力。',
  },
];

function getToolsByTab(tabId: ToolTabId): WorkbenchToolDefinition[] {
  if (tabId === 'all') {
    return WORKBENCH_TOOL_DEFINITIONS;
  }

  return WORKBENCH_TOOL_DEFINITIONS.filter((tool) => tool.status === tabId);
}

export function ToolLibraryModal() {
  const isToolLibraryModalOpen = useWorkbenchStore((state) => state.isToolLibraryModalOpen);
  const closeToolLibraryModal = useWorkbenchStore((state) => state.closeToolLibraryModal);

  useEffect(() => {
    if (!isToolLibraryModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeToolLibraryModal();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeToolLibraryModal, isToolLibraryModalOpen]);

  if (!isToolLibraryModalOpen) {
    return null;
  }

  return (
    <div
      className="tool-library-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="工具库"
      onClick={closeToolLibraryModal}
    >
      <div
        className="tool-library-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="tool-library-modal-header">
          <div>
            <h3 className="tool-library-modal-title">工具库</h3>
            <p className="tool-library-modal-description">
              查看当前 Agent 可使用的服务端白名单工具、执行位置与风险等级。模型不能直接执行任意 SQL，前端也不直接执行工具。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="tool-library-modal-close"
            onClick={closeToolLibraryModal}
            aria-label="关闭"
          >
            ×
          </Button>
        </header>

        <div className="tool-library-modal-body">
          <Tabs defaultValue="all" className="tool-library-tabs">
            <TabsList className="tool-library-tabs-list">
              {TOOL_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="tool-library-tab-trigger">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {TOOL_TABS.map((tab) => {
              const tools = getToolsByTab(tab.id);

              return (
                <TabsContent key={tab.id} value={tab.id} className="tool-library-tab-content">
                  <div className="tool-library-tab-heading">
                    <div>
                      <h4 className="tool-library-tab-title">{tab.label}</h4>
                      <p className="tool-library-tab-description">{tab.description}</p>
                    </div>
                    <span className="tool-library-count">{tools.length} 个工具</span>
                  </div>

                  <ScrollArea className="tool-library-scroll">
                    {tools.length > 0 ? (
                      <div className="tool-library-grid">
                        {tools.map((tool) => (
                          <ToolCard key={tool.id} tool={tool} />
                        ))}
                      </div>
                    ) : (
                      <div className="tool-empty-state">暂无该类型工具</div>
                    )}
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>

        <footer className="tool-library-modal-footer">
          <Button type="button" variant="outline" onClick={closeToolLibraryModal}>
            关闭
          </Button>
        </footer>
      </div>
    </div>
  );
}
