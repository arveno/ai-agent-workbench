import type { ConversationMode, ConversationStatus } from '@/types/persistence';
import type { WorkbenchSession } from '@/types/workbench';

export interface ConversationListItemView {
  id: string;
  title: string;
  summary: string;
  mode: ConversationMode;
  status: ConversationStatus;
  messageCount: number;
  updatedAt: string;
  isActive: boolean;
}

export interface ConversationListView {
  items: ConversationListItemView[];
  title: string;
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  canRetry: boolean;
  emptyTitle: string;
  emptyDescription: string;
  loadingMessage: string;
  retryLabel: string;
}

interface CreateConversationListViewParams {
  sessions: WorkbenchSession[];
  currentSessionId: string;
  isPersistentMode: boolean;
  isLoading: boolean;
  errorMessage: string | null;
}

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function getTitle(session: WorkbenchSession): string {
  const title = session.title.trim();
  return title || '新会话';
}

function getSummary(session: WorkbenchSession): string {
  const summary = session.summary?.trim();

  if (summary) {
    return summary;
  }

  const latestMessage = [...session.messages].reverse().find((message) => message.content.trim());
  return latestMessage?.content.trim() ?? '暂无消息';
}

function getMessageCount(session: WorkbenchSession): number {
  return session.messageCount ?? session.messages.length;
}

export function createConversationListView(params: CreateConversationListViewParams): ConversationListView {
  const sortedSessions = params.sessions
    .filter((session) => session.id.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const items = sortedSessions.map((session) => ({
    id: session.id,
    title: getTitle(session),
    summary: getSummary(session),
    mode: session.mode ?? 'mock',
    status: session.status ?? 'active',
    messageCount: getMessageCount(session),
    updatedAt: formatUpdatedAt(session.updatedAt),
    isActive: session.id === params.currentSessionId,
  }));
  const isEmpty = !params.isLoading && !params.errorMessage && items.length === 0;

  return {
    items,
    title: params.isPersistentMode ? '我的会话' : '公开演示会话',
    isLoading: params.isLoading,
    isEmpty,
    errorMessage: params.errorMessage,
    canRetry: Boolean(params.errorMessage),
    emptyTitle: params.isPersistentMode ? '暂无会话' : '暂无演示会话',
    emptyDescription: params.isPersistentMode ? '开始一条新聊天。' : '公开演示会话暂不可用。',
    loadingMessage: params.isPersistentMode ? '正在加载我的会话...' : '正在加载公开演示会话...',
    retryLabel: '重试',
  };
}
