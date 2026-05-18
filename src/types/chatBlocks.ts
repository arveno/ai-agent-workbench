import type { RunSnapshot } from './run';
import type { WorkbenchMessage } from './workbench';

export type ChatBlockType =
  | 'message'
  | 'streaming_assistant'
  | 'report_confirm'
  | 'run_error'
  | 'run_stopped';

export interface MessageChatBlock {
  type: 'message';
  id: string;
  message: WorkbenchMessage;
}

export interface StreamingAssistantChatBlock {
  type: 'streaming_assistant';
  id: string;
  run: RunSnapshot;
}

export interface ReportConfirmChatBlock {
  type: 'report_confirm';
  id: string;
  run: RunSnapshot;
}

export interface RunErrorChatBlock {
  type: 'run_error';
  id: string;
  run: RunSnapshot;
}

export interface RunStoppedChatBlock {
  type: 'run_stopped';
  id: string;
  run: RunSnapshot;
}

export type ChatBlock =
  | MessageChatBlock
  | StreamingAssistantChatBlock
  | ReportConfirmChatBlock
  | RunErrorChatBlock
  | RunStoppedChatBlock;
