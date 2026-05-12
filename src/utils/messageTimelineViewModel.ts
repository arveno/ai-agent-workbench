import type { WorkbenchMessage, WorkbenchSession } from '@/types/workbench';

export const LONG_MESSAGE_CHARACTER_THRESHOLD = 1200;
export const LONG_MESSAGE_LINE_THRESHOLD = 8;
export const LONG_MESSAGE_PREVIEW_LENGTH = 900;

export type MessageRenderMode = 'plain' | 'markdown' | 'report' | 'error';

export interface MessageView {
  id: string;
  isLong: boolean;
  shouldCollapseByDefault: boolean;
  previewText: string;
  renderMode: MessageRenderMode;
}

export interface MessageTimelineView {
  messages: MessageView[];
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  canRetry: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  loadingMessage: string;
  emptyTitle: string;
  emptyDescription: string;
  retryLabel: string;
  loadMoreLabel: string;
  loadingMoreMessage: string;
}

interface CreateMessageTimelineViewParams {
  session: WorkbenchSession | null;
  isPersistentMode: boolean;
  isMessagesLoading: boolean;
  messagesError: string | null;
  hasMoreMessages: boolean;
  isOlderMessagesLoading: boolean;
  olderMessagesError: string | null;
}

function getRenderMode(message: WorkbenchMessage): MessageRenderMode {
  if (message.kind === 'report') {
    return 'report';
  }

  if (message.kind === 'error') {
    return 'error';
  }

  return message.role === 'assistant' ? 'markdown' : 'plain';
}

function createPreviewText(content: string): string {
  const normalizedContent = content.trim();

  if (normalizedContent.length <= LONG_MESSAGE_PREVIEW_LENGTH) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, LONG_MESSAGE_PREVIEW_LENGTH).trimEnd()}...`;
}

export function createMessageView(message: WorkbenchMessage): MessageView {
  const lineCount = message.content.split(/\r?\n/).length;
  const isLong =
    message.content.length > LONG_MESSAGE_CHARACTER_THRESHOLD ||
    lineCount > LONG_MESSAGE_LINE_THRESHOLD;
  const renderMode = getRenderMode(message);
  const shouldCollapseByDefault = message.role === 'assistant' && isLong;

  return {
    id: message.id,
    isLong,
    shouldCollapseByDefault,
    previewText: shouldCollapseByDefault ? createPreviewText(message.content) : message.content,
    renderMode,
  };
}

export function createMessageTimelineView(params: CreateMessageTimelineViewParams): MessageTimelineView {
  const hasMessages = Boolean(params.session && params.session.messages.length > 0);
  const isEmpty = !params.isMessagesLoading && !params.messagesError && params.isPersistentMode && !hasMessages;
  const messages = params.session?.messages.map((message) => createMessageView(message)) ?? [];

  return {
    messages,
    isLoading: params.isMessagesLoading,
    isEmpty,
    errorMessage: params.messagesError,
    canRetry: Boolean(params.messagesError && params.session),
    hasMore: params.isPersistentMode && params.hasMoreMessages,
    isLoadingMore: params.isOlderMessagesLoading,
    loadMoreError: params.olderMessagesError,
    loadingMessage: '正在恢复会话...',
    emptyTitle: params.session ? '空会话' : '暂无会话',
    emptyDescription: params.session ? '发送一条消息开始分析。' : '开始一个新会话。',
    retryLabel: '重试',
    loadMoreLabel: '加载更早消息',
    loadingMoreMessage: '正在加载更早消息...',
  };
}
