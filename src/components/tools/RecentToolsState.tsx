import { Button } from '../ui/button';

interface RecentToolsStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function RecentToolsState({ title, description, actionLabel, onAction }: RecentToolsStateProps) {
  return (
    <div className="recent-tools-state">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {actionLabel && onAction ? (
        <Button type="button" size="sm" variant="outline" className="recent-tools-state-action" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
