import { useEffect } from 'react';
import type { AgentToolDefinition } from '../../types/workbench';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { ToolCard } from './ToolCard';

const TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    id: 'schema_inspect',
    name: 'schema_inspect',
    description: '读取允许访问的数据源 Schema、表、字段和类型。',
    status: 'enabled',
    riskLevel: 'low',
    category: 'schema',
    inputSummary: 'dataSourceId, allowedSchemas',
    outputSummary: 'tables, columns, columnTypes',
  },
  {
    id: 'query_table',
    name: 'query_table',
    description: '按受控条件查询白名单表数据，不允许任意 SQL。',
    status: 'enabled',
    riskLevel: 'medium',
    category: 'query',
    inputSummary: 'table, columns, filters, limit',
    outputSummary: 'rows, rowCount, elapsedMs',
  },
  {
    id: 'aggregate_table',
    name: 'aggregate_table',
    description: '对指定表进行受控聚合，例如 count、avg、sum、group by。',
    status: 'enabled',
    riskLevel: 'medium',
    category: 'query',
    inputSummary: 'table, metrics, dimensions, filters, limit',
    outputSummary: 'aggregates, chartData',
  },
  {
    id: 'chart_render',
    name: 'chart_render',
    description: '将查询或聚合结果转换为前端图表数据。',
    status: 'enabled',
    riskLevel: 'low',
    category: 'render',
    inputSummary: 'rows 或 aggregates, chartType',
    outputSummary: 'chartConfig, summary',
  },
  {
    id: 'knowledge_search',
    name: 'knowledge_search',
    description: '从知识库中检索业务规则、指标口径和说明文档。',
    status: 'comingSoon',
    riskLevel: 'medium',
    category: 'knowledge',
    inputSummary: 'query, topK',
    outputSummary: 'documents, citations',
  },
  {
    id: 'report_generate',
    name: 'report_generate',
    description: '根据工具结果和模型回复生成结构化报告。',
    status: 'comingSoon',
    riskLevel: 'low',
    category: 'report',
    inputSummary: 'runId, messages, toolResults',
    outputSummary: 'reportMarkdown',
  },
];

const TOOL_GROUPS: Array<{ title: string; categories: AgentToolDefinition['category'][] }> = [
  {
    title: 'Schema 工具',
    categories: ['schema'],
  },
  {
    title: '查询工具',
    categories: ['query'],
  },
  {
    title: '分析与渲染工具',
    categories: ['analysis', 'render'],
  },
  {
    title: '知识与报告工具',
    categories: ['knowledge', 'report'],
  },
];

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
      aria-label="工具库配置"
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
            <h3 className="tool-library-modal-title">工具库配置</h3>
            <p className="tool-library-modal-description">
              配置 Agent 可使用的受控工具。第一版工具由服务端注册和执行，模型不能直接执行任意 SQL。
            </p>
          </div>
          <button
            type="button"
            className="tool-library-modal-close"
            onClick={closeToolLibraryModal}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        <div className="tool-library-modal-body">
          {TOOL_GROUPS.map((group) => {
            const tools = TOOL_DEFINITIONS.filter((tool) => group.categories.includes(tool.category));

            return (
              <section key={group.title} className="tool-section">
                <h4 className="tool-section-title">{group.title}</h4>
                <div className="tool-grid">
                  {tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="tool-library-modal-footer">
          <button type="button" className="tool-library-modal-close-button" onClick={closeToolLibraryModal}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}

