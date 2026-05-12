import type {
  ConversationCreateInput,
  ConversationRecord,
  ConversationMode,
} from '@/types/persistence';
import type { WorkbenchMessage, WorkbenchSession } from '@/types/workbench';

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export function conversationRecordToSession(
  record: ConversationRecord,
  messages: WorkbenchMessage[] = [],
): WorkbenchSession {
  return {
    id: record.id,
    title: record.title,
    updatedAt: toTimestamp(record.updated_at),
    messages,
    runsById: {},
    latestRunId: record.latest_run_id ?? undefined,
    mode: record.mode,
    status: record.status,
    summary: record.summary,
    messageCount: record.message_count,
  };
}

export function workbenchSessionToConversationCreateInput(
  session: WorkbenchSession,
  mode: ConversationMode = 'mock',
): ConversationCreateInput {
  return {
    title: session.title,
    mode,
    metadata: {
      runtimeSessionId: session.id,
      taskId: session.taskId ?? null,
    },
  };
}
