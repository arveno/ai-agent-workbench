import type { RecentToolRecord, ToolInvocationRecordStatus } from '@/types/persistence';

export type RecentToolStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface RecentToolView {
  toolName: string;
  displayName: string;
  usageText: string;
  lastUsedText: string;
  statusLabel: string;
  statusTone: RecentToolStatusTone;
  lastConversationId: string;
  lastRunId: string;
}

export interface RecentToolsView {
  title: string;
  items: RecentToolView[];
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  canRetry: boolean;
  emptyTitle: string;
  emptyDescription: string;
  loadingMessage: string;
  retryLabel: string;
}

const DEMO_TOOL_VIEWS: RecentToolView[] = [
  {
    toolName: 'demo_data_analysis',
    displayName: '数据分析',
    usageText: '公开演示',
    lastUsedText: '不消耗额度',
    statusLabel: '演示',
    statusTone: 'neutral',
    lastConversationId: '',
    lastRunId: '',
  },
  {
    toolName: 'demo_chart_render',
    displayName: '图表生成',
    usageText: '公开演示',
    lastUsedText: '不消耗额度',
    statusLabel: '演示',
    statusTone: 'neutral',
    lastConversationId: '',
    lastRunId: '',
  },
  {
    toolName: 'demo_report_generate',
    displayName: '报告生成',
    usageText: '公开演示',
    lastUsedText: '不消耗额度',
    statusLabel: '演示',
    statusTone: 'neutral',
    lastConversationId: '',
    lastRunId: '',
  },
];

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return '最近';
  }

  const now = Date.now();
  const elapsedMs = Math.max(0, now - timestamp);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);

  if (elapsedMinutes < 1) {
    return '刚刚';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} 分钟前`;
  }

  const date = new Date(timestamp);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return '今天';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function getStatusLabel(status: ToolInvocationRecordStatus): string {
  if (status === 'completed') return '成功';
  if (status === 'failed') return '失败';
  if (status === 'running') return '运行中';
  if (status === 'skipped') return '跳过';
  return '等待';
}

function getStatusTone(status: ToolInvocationRecordStatus): RecentToolStatusTone {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'warning';
  return 'neutral';
}

function recentToolRecordToView(record: RecentToolRecord): RecentToolView {
  return {
    toolName: record.toolName,
    displayName: record.displayName.trim() || record.toolName,
    usageText: `调用 ${record.usageCount} 次`,
    lastUsedText: formatRelativeTime(record.lastUsedAt),
    statusLabel: getStatusLabel(record.lastStatus),
    statusTone: getStatusTone(record.lastStatus),
    lastConversationId: record.lastConversationId,
    lastRunId: record.lastRunId,
  };
}

export function createRecentToolsView(params: {
  tools: RecentToolRecord[];
  isLoading: boolean;
  errorMessage: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
}): RecentToolsView {
  if (!params.isAuthenticated && !params.isAuthLoading) {
    return {
      title: '公开演示工具',
      items: DEMO_TOOL_VIEWS,
      isLoading: false,
      isEmpty: false,
      errorMessage: null,
      canRetry: false,
      emptyTitle: '暂无公开演示工具',
      emptyDescription: '公开演示工具暂不可用。',
      loadingMessage: '正在读取公开演示工具...',
      retryLabel: '重试',
    };
  }

  const items = params.tools.map((tool) => recentToolRecordToView(tool));
  const isLoading = params.isAuthLoading || params.isLoading;
  const isEmpty = !isLoading && !params.errorMessage && items.length === 0;

  return {
    title: '最近使用工具',
    items,
    isLoading,
    isEmpty,
    errorMessage: params.errorMessage,
    canRetry: Boolean(params.errorMessage) && params.isAuthenticated,
    emptyTitle: '暂无最近工具',
    emptyDescription: '完成一次真实 Agent Run 后，这里会展示最近使用过的工具。',
    loadingMessage: params.isAuthLoading ? '正在检查登录状态...' : '正在读取最近工具...',
    retryLabel: '重试',
  };
}
