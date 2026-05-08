export async function streamText(
  text: string,
  onUpdate: (content: string) => void,
  options?: {
    interval?: number;
    shouldStop?: () => boolean;
  }
): Promise<'done' | 'stopped'> {
  const interval = options?.interval ?? 24;
  let current = '';

  for (const char of text) {
    if (options?.shouldStop?.()) {
      return 'stopped';
    }

    current += char;
    onUpdate(current);

    await new Promise((resolve) => window.setTimeout(resolve, interval));
  }

  return 'done';
}
