export function createSessionTitle(prompt: string): string {
  const normalizedPrompt = prompt.trim().replace(/\s+/g, ' ');
  return normalizedPrompt.length > 16 ? `${normalizedPrompt.slice(0, 16)}...` : normalizedPrompt || '新会话';
}
