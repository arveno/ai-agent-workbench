import type { ChatBlock } from '@/types/chatBlocks';
import type { RunSnapshot } from '@/types/run';
import type { WorkbenchMessage, WorkbenchSession } from '@/types/workbench';
import { createConclusionViewModel } from './runConclusionViewModel';
import { shouldShowReportConfirm } from './run';

export interface BuildChatBlocksParams {
  session: WorkbenchSession | null;
  currentRun: RunSnapshot | null;
}

function getRunForMessage(
  message: WorkbenchMessage,
  session: WorkbenchSession,
  currentRun: RunSnapshot | null,
): RunSnapshot | null {
  if (!message.runId) {
    return null;
  }

  return session.runsById[message.runId] ?? (currentRun?.id === message.runId ? currentRun : null);
}

function hasAssistantFinalMessage(messages: WorkbenchMessage[], runId: string): boolean {
  return messages.some(
    (message) => message.role === 'assistant' && message.runId === runId && message.kind === 'normal',
  );
}

function hasPartialMessage(messages: WorkbenchMessage[], runId: string): boolean {
  return messages.some(
    (message) => message.role === 'assistant' && message.runId === runId && message.kind === 'partial',
  );
}

function hasErrorMessage(messages: WorkbenchMessage[], runId: string): boolean {
  return messages.some(
    (message) => message.role === 'assistant' && message.runId === runId && message.kind === 'error',
  );
}

function hasReportMessage(messages: WorkbenchMessage[], runId: string): boolean {
  return messages.some(
    (message) => message.role === 'assistant' && message.runId === runId && message.kind === 'report',
  );
}

function createRunFollowUpBlocks(params: {
  run: RunSnapshot;
  currentRun: RunSnapshot | null;
  messages: WorkbenchMessage[];
  insertedStreamingRunIds: Set<string>;
  insertedErrorRunIds: Set<string>;
  insertedStoppedRunIds: Set<string>;
}): ChatBlock[] {
  const { run, currentRun, messages, insertedStreamingRunIds, insertedErrorRunIds, insertedStoppedRunIds } = params;
  const blocks: ChatBlock[] = [];
  const hasFinalMessage = hasAssistantFinalMessage(messages, run.id);

  if (
    run.status === 'running' &&
    currentRun?.id === run.id &&
    !hasFinalMessage &&
    !insertedStreamingRunIds.has(run.id)
  ) {
    blocks.push({
      type: 'streaming_assistant',
      id: `streaming:${run.id}`,
      run,
    });
    insertedStreamingRunIds.add(run.id);
  }

  if (run.status === 'error' && !hasErrorMessage(messages, run.id) && !insertedErrorRunIds.has(run.id)) {
    blocks.push({
      type: 'run_error',
      id: `run_error:${run.id}`,
      run,
    });
    insertedErrorRunIds.add(run.id);
  }

  if (run.status === 'stopped' && !hasPartialMessage(messages, run.id) && !insertedStoppedRunIds.has(run.id)) {
    blocks.push({
      type: 'run_stopped',
      id: `run_stopped:${run.id}`,
      run,
    });
    insertedStoppedRunIds.add(run.id);
  }

  return blocks;
}

export function buildChatBlocks(params: BuildChatBlocksParams): ChatBlock[] {
  const { session, currentRun } = params;

  if (!session) {
    return [];
  }

  const blocks: ChatBlock[] = [];
  const insertedStreamingRunIds = new Set<string>();
  const insertedReportConfirmRunIds = new Set<string>();
  const insertedErrorRunIds = new Set<string>();
  const insertedStoppedRunIds = new Set<string>();

  for (const message of session.messages) {
    const run = getRunForMessage(message, session, currentRun);
    const canonicalConclusion = run ? createConclusionViewModel(run).fullMarkdownText : '';
    const displayMessage =
      message.role === 'assistant' && message.kind === 'normal' && canonicalConclusion.trim()
        ? {
            ...message,
            content: canonicalConclusion,
          }
        : message;

    blocks.push({
      type: 'message',
      id: `message:${message.id}`,
      message: displayMessage,
    });

    if (!run) {
      continue;
    }

    if (message.role === 'user') {
      blocks.push(
        ...createRunFollowUpBlocks({
          run,
          currentRun,
          messages: session.messages,
          insertedStreamingRunIds,
          insertedErrorRunIds,
          insertedStoppedRunIds,
        }),
      );
    }

    if (
      message.role === 'assistant' &&
      message.kind === 'normal' &&
      message.runId === run.id &&
      shouldShowReportConfirm(run) &&
      !hasReportMessage(session.messages, run.id) &&
      !insertedReportConfirmRunIds.has(run.id)
    ) {
      blocks.push({
        type: 'report_confirm',
        id: `report_confirm:${run.id}`,
        run,
      });
      insertedReportConfirmRunIds.add(run.id);
    }
  }

  return blocks;
}
