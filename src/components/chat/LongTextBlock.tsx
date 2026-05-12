import { useState, type ReactNode } from 'react';

interface LongTextBlockProps {
  content: string;
  previewText: string;
  shouldCollapseByDefault: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  renderContent: (content: string) => ReactNode;
}

export function LongTextBlock({
  content,
  previewText,
  shouldCollapseByDefault,
  expandLabel = '展开全文',
  collapseLabel = '收起',
  renderContent,
}: LongTextBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(shouldCollapseByDefault);
  const canToggle = shouldCollapseByDefault;
  const visibleContent = canToggle && isCollapsed ? previewText : content;

  return (
    <div className="long-text-block">
      <div className={canToggle && isCollapsed ? 'long-text-preview' : undefined}>
        {renderContent(visibleContent)}
      </div>
      {canToggle ? (
        <button
          type="button"
          className="long-text-toggle"
          onClick={() => {
            setIsCollapsed((currentValue) => !currentValue);
          }}
        >
          {isCollapsed ? expandLabel : collapseLabel}
        </button>
      ) : null}
    </div>
  );
}
