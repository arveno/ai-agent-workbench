import { useMemo, useState } from 'react';
import { Button } from '../../ui/button';

interface JsonPreviewProps {
  title: string;
  value: string;
}

const SENSITIVE_KEY_PATTERN = /(authorization|access_token|refresh_token|api[_-]?key|apikey|secret|password|connection|string|groq)/i;
const DETAIL_PREVIEW_LENGTH = 220;
const DETAIL_MAX_LENGTH = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, itemValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeValue(itemValue),
      ]),
    );
  }

  return value;
}

function createDisplayText(value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return '无详情';
  }

  try {
    const parsed = JSON.parse(normalizedValue) as unknown;
    return JSON.stringify(sanitizeValue(parsed), null, 2);
  } catch {
    return normalizedValue;
  }
}

function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, Math.max(0, length - 1))}…`;
}

export function JsonPreview({ title, value }: JsonPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayText = useMemo(() => createDisplayText(value), [value]);
  const isLarge = displayText.length > DETAIL_PREVIEW_LENGTH;
  const visibleText = isExpanded ? truncate(displayText, DETAIL_MAX_LENGTH) : truncate(displayText, DETAIL_PREVIEW_LENGTH);

  return (
    <div className="json-preview">
      <div className="json-preview-header">
        <span>{title}</span>
        {isLarge ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="json-preview-toggle"
            onClick={() => {
              setIsExpanded((currentValue) => !currentValue);
            }}
          >
            {isExpanded ? '收起详情' : '查看详情'}
          </Button>
        ) : null}
      </div>
      <pre className={isExpanded ? 'json-preview-body expanded' : 'json-preview-body'}>{visibleText}</pre>
      {!isExpanded && isLarge ? <div className="json-preview-hint">内容较大，已折叠。</div> : null}
      {isExpanded && displayText.length > DETAIL_MAX_LENGTH ? (
        <div className="json-preview-hint">详情内容较大，已截断展示。</div>
      ) : null}
    </div>
  );
}
