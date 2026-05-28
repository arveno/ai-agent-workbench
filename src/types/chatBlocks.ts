import type { RunViewModel } from '../domain/run/view-model';
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
  run: RunViewModel;
}

export interface ReportConfirmChatBlock {
  type: 'report_confirm';
  id: string;
  run: RunViewModel;
}

export interface RunErrorChatBlock {
  type: 'run_error';
  id: string;
  run: RunViewModel;
}

export interface RunStoppedChatBlock {
  type: 'run_stopped';
  id: string;
  run: RunViewModel;
}

export type ChatBlock =
  | MessageChatBlock
  | StreamingAssistantChatBlock
  | ReportConfirmChatBlock
  | RunErrorChatBlock
  | RunStoppedChatBlock;
