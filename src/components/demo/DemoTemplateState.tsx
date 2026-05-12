import { Button } from '../ui/button';

interface DemoTemplateStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function DemoTemplateState({ title, description, actionLabel, onAction }: DemoTemplateStateProps) {
  return (
    <div className="demo-template-state">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {actionLabel && onAction ? (
        <Button type="button" size="sm" variant="outline" className="demo-template-state-action" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
