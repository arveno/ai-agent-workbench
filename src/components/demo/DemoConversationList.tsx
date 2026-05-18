import type { DemoConversationTemplateListView } from '../../utils/demoTemplateViewModel';
import { DemoConversationCard } from './DemoConversationCard';
import { DemoTemplateState } from './DemoTemplateState';

interface DemoConversationListProps {
  view: DemoConversationTemplateListView;
  activeTemplateId?: string | null;
  isCopying: boolean;
  copyErrorMessage: string | null;
  onOpenConversation: (id: string) => void;
  onCopyConversation: (id: string) => void;
  onRetryConversations: () => void;
}

export function DemoConversationList({
  view,
  activeTemplateId,
  isCopying,
  copyErrorMessage,
  onOpenConversation,
  onCopyConversation,
  onRetryConversations,
}: DemoConversationListProps) {
  return (
    <div className="demo-template-panel">
      {copyErrorMessage ? <DemoTemplateState title="示例会话操作提示" description={copyErrorMessage} /> : null}

      {view.isLoading ? <DemoTemplateState title={view.loadingMessage} /> : null}

      {!view.isLoading && view.errorMessage ? (
        <DemoTemplateState
          title="示例会话加载失败"
          description={view.errorMessage}
          actionLabel={view.canRetry ? view.retryLabel : undefined}
          onAction={view.canRetry ? onRetryConversations : undefined}
        />
      ) : null}

      {!view.isLoading && view.isEmpty ? <DemoTemplateState title={view.emptyTitle} description={view.emptyDescription} /> : null}

      {!view.isLoading && !view.errorMessage && !view.isEmpty ? (
        <div className="demo-conversation-list">
          {view.items.map((template) => (
            <DemoConversationCard
              key={template.id}
              item={template}
              isActive={template.id === activeTemplateId}
              disabled={isCopying}
              onOpen={onOpenConversation}
              onCopy={onCopyConversation}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
