import type { RecentToolView } from '../../utils/recentToolsViewModel';

interface RecentToolItemProps {
  item: RecentToolView;
}

export function RecentToolItem({ item }: RecentToolItemProps) {
  return (
    <li className="recent-tool-item">
      <div className="recent-tool-main">
        <span className="recent-tool-name" title={item.displayName}>
          {item.displayName}
        </span>
        <span className={`recent-tool-status recent-tool-status-${item.statusTone}`}>{item.statusLabel}</span>
      </div>
      <div className="recent-tool-meta">
        <span>{item.usageText}</span>
        <span aria-hidden="true">·</span>
        <span>{item.lastUsedText}</span>
      </div>
    </li>
  );
}
