import type { ConversationListView } from '../../utils/conversationListViewModel';
import { ConversationListItem } from './ConversationListItem';
import { ConversationListState } from './ConversationListState';

interface ConversationListProps {
  view: ConversationListView;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRetry: () => void;
}

export function ConversationList({ view, onSelect, onCreate, onRetry }: ConversationListProps) {
  if (view.isLoading) {
    return <ConversationListState title={view.loadingMessage} />;
  }

  if (view.errorMessage) {
    return (
      <ConversationListState
        title="会话加载失败"
        description={view.errorMessage}
        actionLabel={view.canRetry ? view.retryLabel : undefined}
        onAction={view.canRetry ? onRetry : undefined}
      />
    );
  }

  if (view.isEmpty) {
    return (
      <ConversationListState
        title={view.emptyTitle}
        description={view.emptyDescription}
        actionLabel="新建会话"
        onAction={onCreate}
      />
    );
  }

  return (
    <ul className="session-list">
      {view.items.map((item) => (
        <ConversationListItem key={item.id} item={item} onSelect={onSelect} />
      ))}
    </ul>
  );
}
