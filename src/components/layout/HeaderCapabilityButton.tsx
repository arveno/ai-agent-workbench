import type { LucideIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AppIcon } from '../common/AppIcon';

export type HeaderCapabilityTone = 'success' | 'neutral' | 'warning' | 'danger';
export type HeaderCapabilityTooltipItemVariant = HeaderCapabilityTone | 'info';

interface HeaderCapabilityTooltipItem {
  label: string;
  status: string;
  variant: HeaderCapabilityTooltipItemVariant;
}

interface HeaderCapabilityTooltip {
  title: string;
  description?: string;
  items?: HeaderCapabilityTooltipItem[];
}

interface HeaderCapabilityButtonProps {
  icon: LucideIcon;
  label: string;
  tone: HeaderCapabilityTone;
  title?: string;
  ariaLabel?: string;
  tooltip?: HeaderCapabilityTooltip;
  onClick?: () => void;
}

export function HeaderCapabilityButton({
  icon,
  label,
  tone,
  title,
  ariaLabel,
  tooltip,
  onClick,
}: HeaderCapabilityButtonProps) {
  const hasRichTooltip = tone === 'success' && Boolean(tooltip);
  const button = (
    <Button
      className={[
        'header-capability-button',
        `header-capability-button-${tone}`,
        onClick ? '' : 'header-capability-button-static',
      ]
        .filter(Boolean)
        .join(' ')}
      type="button"
      onClick={onClick}
      variant="outline"
      size="sm"
      title={hasRichTooltip ? undefined : title}
      aria-label={ariaLabel ?? label}
    >
      <AppIcon icon={icon} size={15} />
      <span className="header-capability-dot" aria-hidden="true"></span>
      <span className="header-capability-label">{label}</span>
    </Button>
  );

  if (!hasRichTooltip || !tooltip) {
    return button;
  }

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" align="end" sideOffset={8} className="header-capability-tooltip">
          <div className="header-capability-tooltip-title">{tooltip.title}</div>
          {tooltip.description ? (
            <div className="header-capability-tooltip-description">{tooltip.description}</div>
          ) : null}
          {tooltip.items && tooltip.items.length > 0 ? (
            <div className="header-capability-tooltip-list" role="list">
              {tooltip.items.map((item) => (
                <div className="header-capability-tooltip-item" role="listitem" key={`${item.label}-${item.status}`}>
                  <span className="header-capability-tooltip-item-label">{item.label}</span>
                  <span className={`header-capability-tooltip-status header-capability-tooltip-status-${item.variant}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
