import type { RecentToolsView } from '../../utils/recentToolsViewModel';
import { RecentToolItem } from './RecentToolItem';
import { RecentToolsState } from './RecentToolsState';

interface RecentToolsCardProps {
  view: RecentToolsView;
  onRetry: () => void;
}

export function RecentToolsCard({ view, onRetry }: RecentToolsCardProps) {
  if (view.isLoading) {
    return <RecentToolsState title={view.loadingMessage} />;
  }

  if (view.errorMessage) {
    return (
      <RecentToolsState
        title="最近工具加载失败"
        description={view.errorMessage}
        actionLabel={view.canRetry ? view.retryLabel : undefined}
        onAction={view.canRetry ? onRetry : undefined}
      />
    );
  }

  if (view.isEmpty) {
    return <RecentToolsState title={view.emptyTitle} description={view.emptyDescription} />;
  }

  return (
    <ul className="recent-tools-list">
      {view.items.map((item) => (
        <RecentToolItem key={item.toolName} item={item} />
      ))}
    </ul>
  );
}
