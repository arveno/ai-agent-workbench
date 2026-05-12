import type { WorkbenchSession } from '@/types/workbench';

export interface MessageTimelineView {
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  canRetry: boolean;
  loadingMessage: string;
  emptyTitle: string;
  emptyDescription: string;
  retryLabel: string;
}

interface CreateMessageTimelineViewParams {
  session: WorkbenchSession | null;
  isPersistentMode: boolean;
  isMessagesLoading: boolean;
  messagesError: string | null;
}

export function createMessageTimelineView(params: CreateMessageTimelineViewParams): MessageTimelineView {
  const hasMessages = Boolean(params.session && params.session.messages.length > 0);
  const isEmpty = !params.isMessagesLoading && !params.messagesError && params.isPersistentMode && !hasMessages;

  return {
    isLoading: params.isMessagesLoading,
    isEmpty,
    errorMessage: params.messagesError,
    canRetry: Boolean(params.messagesError && params.session),
    loadingMessage: '正在恢复会话...',
    emptyTitle: params.session ? '空会话' : '暂无会话',
    emptyDescription: params.session ? '发送一条消息开始分析。' : '开始一个新会话。',
    retryLabel: '重试',
  };
}
