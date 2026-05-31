import type {
  RunErrorBlockModel,
  RunReportPanelModel,
  RunStoppedBlockModel,
  RunStreamingAssistantModel,
} from '../utils/runPresentationModel';
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
  model: RunStreamingAssistantModel;
}

export interface ReportConfirmChatBlock {
  type: 'report_confirm';
  id: string;
  model: RunReportPanelModel;
}

export interface RunErrorChatBlock {
  type: 'run_error';
  id: string;
  model: RunErrorBlockModel;
}

export interface RunStoppedChatBlock {
  type: 'run_stopped';
  id: string;
  model: RunStoppedBlockModel;
}

export type ChatBlock =
  | MessageChatBlock
  | StreamingAssistantChatBlock
  | ReportConfirmChatBlock
  | RunErrorChatBlock
  | RunStoppedChatBlock;
