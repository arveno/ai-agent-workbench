import { Button } from '../ui/button';

interface ConversationListStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ConversationListState({
  title,
  description,
  actionLabel,
  onAction,
}: ConversationListStateProps) {
  return (
    <div className="conversation-list-state">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {actionLabel && onAction ? (
        <Button type="button" size="sm" variant="outline" className="conversation-list-state-action" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
