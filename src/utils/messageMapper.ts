import type { MessageCreateInput, MessageKind, MessageRecord, MessageRole } from '@/types/persistence';
import type { WorkbenchMessage, WorkbenchMessageKind } from '@/types/workbench';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function toPersistableRunId(runId: string | undefined): string | null {
  if (!runId) {
    return null;
  }

  return UUID_PATTERN.test(runId) ? runId : null;
}

export function messageRecordToWorkbenchMessage(record: MessageRecord): WorkbenchMessage {
  const message: WorkbenchMessage = {
    id: record.client_message_id ?? record.id,
    role: messageRoleToWorkbenchRole(record.role),
    kind: messageKindToWorkbenchKind(record.kind),
    content: record.content,
    createdAt: toTimestamp(record.created_at),
  };

  if (record.run_id) {
    message.runId = record.run_id;
  }

  return message;
}

export function workbenchMessageToMessageCreateInput(message: WorkbenchMessage): MessageCreateInput {
  const runId = toPersistableRunId(message.runId);
  const metadata: Record<string, unknown> = {};

  if (message.runId && !runId) {
    metadata.runtimeRunId = message.runId;
  }

  return {
    role: message.role,
    kind: workbenchKindToMessageKind(message.kind),
    content: message.content,
    runId,
    clientMessageId: message.id,
    status: message.kind === 'partial' ? 'streaming' : 'completed',
    metadata,
  };
}
