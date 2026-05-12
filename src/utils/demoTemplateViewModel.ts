import type {
  DemoConversationTemplateRecord,
  DemoRecommendedMode,
  DemoTaskTemplateRecord,
  DemoTemplateCategory,
} from '@/types/persistence';
import {
  getDemoTemplateStringArrayMetadata,
  getDemoTemplateStringMetadata,
} from './demoTemplateMapper';

export interface DemoTaskView {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: DemoTemplateCategory;
  recommendedMode: DemoRecommendedMode;
  tagLabels: string[];
  showcaseValue: string;
  isConversationTemplateBacked: boolean;
}

export interface DemoConversationTemplateView {
  id: string;
  title: string;
  description: string;
  category: DemoTemplateCategory;
  tagLabels: string[];
  showcaseValue: string;
}

export interface DemoTaskListView {
  items: DemoTaskView[];
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  canRetry: boolean;
  loadingMessage: string;
  emptyTitle: string;
  emptyDescription: string;
  retryLabel: string;
}

export interface DemoConversationTemplateListView {
  items: DemoConversationTemplateView[];
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  canRetry: boolean;
  loadingMessage: string;
  emptyTitle: string;
  emptyDescription: string;
  retryLabel: string;
}

function getCategoryLabel(category: DemoTemplateCategory): string {
  if (category === 'intro') return '能力介绍';
  if (category === 'analysis') return '数据分析';
  if (category === 'report') return '报告';
  if (category === 'rag') return 'RAG';
  if (category === 'long_context') return '长上下文';
  return '兜底';
}

function getShowcaseValue(metadata: Record<string, unknown>, fallback: string): string {
  return getDemoTemplateStringMetadata(metadata, 'showcaseValue') || getDemoTemplateStringMetadata(metadata, 'showcase') || fallback;
}

function getTags(metadata: Record<string, unknown>, category: DemoTemplateCategory): string[] {
  const tags = getDemoTemplateStringArrayMetadata(metadata, 'tags');
  return tags.length > 0 ? tags : [getCategoryLabel(category)];
}

function isConversationTemplateCategory(category: DemoTemplateCategory): boolean {
  return category === 'long_context' || category === 'rag' || category === 'fallback';
}

export function createDemoTaskView(task: DemoTaskTemplateRecord): DemoTaskView {
  return {
    id: task.id,
    title: task.title.trim() || '示例任务',
    description: task.description.trim() || '公开演示任务',
    prompt: task.prompt,
    category: task.category,
    recommendedMode: task.recommended_mode,
    tagLabels: getTags(task.metadata, task.category),
    showcaseValue: getShowcaseValue(task.metadata, getCategoryLabel(task.category)),
    isConversationTemplateBacked: isConversationTemplateCategory(task.category),
  };
}

export function createDemoConversationTemplateView(
  template: DemoConversationTemplateRecord,
): DemoConversationTemplateView {
  return {
    id: template.id,
    title: template.title.trim() || '示例会话',
    description: template.description.trim() || '公开示例会话模板',
    category: template.category,
    tagLabels: getTags(template.metadata, template.category),
    showcaseValue: getShowcaseValue(template.metadata, getCategoryLabel(template.category)),
  };
}

export function createDemoTaskListView(params: {
  tasks: DemoTaskTemplateRecord[];
  isLoading: boolean;
  errorMessage: string | null;
}): DemoTaskListView {
  const items = params.tasks.map((task) => createDemoTaskView(task));
  const isEmpty = !params.isLoading && !params.errorMessage && items.length === 0;

  return {
    items,
    isLoading: params.isLoading,
    isEmpty,
    errorMessage: params.errorMessage,
    canRetry: Boolean(params.errorMessage),
    loadingMessage: '正在加载示例任务...',
    emptyTitle: '暂无示例任务',
    emptyDescription: '示例模板暂不可用，请稍后再试。',
    retryLabel: '重试',
  };
}

export function createDemoConversationTemplateListView(params: {
  templates: DemoConversationTemplateRecord[];
  isLoading: boolean;
  errorMessage: string | null;
}): DemoConversationTemplateListView {
  const items = params.templates.map((template) => createDemoConversationTemplateView(template));
  const isEmpty = !params.isLoading && !params.errorMessage && items.length === 0;

  return {
    items,
    isLoading: params.isLoading,
    isEmpty,
    errorMessage: params.errorMessage,
    canRetry: Boolean(params.errorMessage),
    loadingMessage: '正在加载公开示例会话...',
    emptyTitle: '暂无示例会话',
    emptyDescription: '公开示例会话模板暂不可用。',
    retryLabel: '重试',
  };
}
