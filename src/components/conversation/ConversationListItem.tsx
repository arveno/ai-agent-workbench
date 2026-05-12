import type { ConversationListItemView } from '../../utils/conversationListViewModel';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';

interface ConversationListItemProps {
  item: ConversationListItemView;
  onSelect: (id: string) => void;
}

export function ConversationListItem({ item, onSelect }: ConversationListItemProps) {
  return (
    <li
      className={`session-item${item.isActive ? ' active' : ''}`}
      title={`${item.title}\n${item.summary}`}
      onClick={() => onSelect(item.id)}
    >
      <span className="session-name-wrap">
        <AppIcon icon={icons.document} size={14} />
        <span className="session-name">{item.title}</span>
      </span>
      <span className="session-time">{item.updatedAt}</span>
    </li>
  );
}
