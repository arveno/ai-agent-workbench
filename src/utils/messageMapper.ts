import type { MessageCreateInput, MessageKind, MessageRecord, MessageRole } from '@/types/persistence';
import type { WorkbenchMessage, WorkbenchMessageKind } from '@/types/workbench';

interface MessageCreateOptions {
  persistedRunId?: string | null;
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function messageRoleToWorkbenchRole(role: MessageRole): WorkbenchMessage['role'] {
  return role === 'user' ? 'user' : 'assistant';
}

function messageKindToWorkbenchKind(kind: MessageKind): WorkbenchMessageKind {
  if (kind === 'report') {
    return 'report';
  }

  if (kind === 'error') {
    return 'error';
  }

  return 'normal';
}

function workbenchKindToMessageKind(kind: WorkbenchMessageKind): MessageKind {
  if (kind === 'report') {
    return 'report';
  }

  if (kind === 'error') {
    return 'error';
  }

  return 'text';
}

export function messageRecordToWorkbenchMessage(record: MessageRecord): WorkbenchMessage {
  const runId = record.run_id?.trim() || null;
  const clientMessageId = record.client_message_id ?? record.id;
  const message: WorkbenchMessage = {
    id: clientMessageId,
    clientMessageId,
    role: messageRoleToWorkbenchRole(record.role),
    kind: messageKindToWorkbenchKind(record.kind),
    content: record.content,
    createdAt: toTimestamp(record.created_at),
  };

  if (runId) {
    message.runId = runId;
  }

  return message;
}

export function workbenchMessageToMessageCreateInput(
  message: WorkbenchMessage,
  options: MessageCreateOptions = {},
): MessageCreateInput {
  const runId = options.persistedRunId?.trim() || null;
  const clientMessageId = message.clientMessageId ?? message.id;

  return {
    role: message.role,
    kind: workbenchKindToMessageKind(message.kind),
    content: message.content,
    runId,
    clientMessageId,
    status: message.kind === 'partial' ? 'streaming' : 'completed',
    metadata: {},
  };
}
