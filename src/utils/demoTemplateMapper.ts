import type {
  DemoConversationCopyResult,
  DemoConversationTemplateRecord,
  DemoTaskTemplateRecord,
} from '@/types/persistence';
import type { WorkbenchMessage, WorkbenchSession } from '@/types/workbench';
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

export function demoTaskTemplateToSeedMessage(task: DemoTaskTemplateRecord): WorkbenchMessage {
  return {
    id: `demo_task_${task.id}`,
    role: 'user',
    kind: 'normal',
    content: task.prompt,
    createdAt: Date.now(),
  };
}

export function findConversationTemplateForTask(
  task: DemoTaskTemplateRecord,
  templates: DemoConversationTemplateRecord[],
): DemoConversationTemplateRecord | null {
  const templateKey = getDemoTemplateStringMetadata(task.metadata, 'templateKey');

  if (templateKey) {
    const matchedTemplate = templates.find(
      (template) => getDemoTemplateStringMetadata(template.metadata, 'templateKey') === templateKey,
    );

    if (matchedTemplate) {
      return matchedTemplate;
    }
  }

  if (task.category === 'long_context' || task.category === 'rag' || task.category === 'fallback') {
    return templates.find((template) => template.category === task.category) ?? null;
  }

  return null;
}
