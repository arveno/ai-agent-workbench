import type { DemoConversationCopyResult } from '@/types/persistence';
import type { WorkbenchSession } from '@/types/workbench';
import { conversationRecordToSession } from './conversationMapper';
import { messageRecordToWorkbenchMessage } from './messageMapper';

export function demoConversationCopyToSession(result: DemoConversationCopyResult): WorkbenchSession {
  const messages = result.messages.map((message) => messageRecordToWorkbenchMessage(message));
  return {
    ...conversationRecordToSession(result.conversation, messages),
    messageCount: messages.length,
  };
}

export function getDemoTemplateStringMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

export function getDemoTemplateStringArrayMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string[] {
  const value = metadata[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
