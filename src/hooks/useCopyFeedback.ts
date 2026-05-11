import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyFeedback(timeoutMs = 1800): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current === null) {
      return;
    }

    window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text.trim()) {
        return false;
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clearResetTimer();
        resetTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          resetTimerRef.current = null;
        }, timeoutMs);
        return true;
      } catch {
        return false;
      }
    },
    [clearResetTimer, timeoutMs],
  );

  useEffect(
    () => () => {
      clearResetTimer();
    },
    [clearResetTimer],
  );

  return {
    copied,
    copy,
  };
}
