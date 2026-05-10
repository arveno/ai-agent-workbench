import { useEffect } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { WorkbenchToolCategory } from '../../types/workbench';
import { WORKBENCH_TOOL_DEFINITIONS } from '../../utils/toolRegistryView';
import { ToolCard } from './ToolCard';

const TOOL_GROUPS: Array<{ title: string; categories: WorkbenchToolCategory[] }> = [
  {
    title: 'Schema 工具',
    categories: ['schema'],
  },
  {
    title: '查询与分析工具',
    categories: ['query', 'analysis', 'render'],
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
            const tools = WORKBENCH_TOOL_DEFINITIONS.filter((tool) => group.categories.includes(tool.category));

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
