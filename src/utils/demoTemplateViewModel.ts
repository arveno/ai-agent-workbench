import type {
  DemoConversationTemplateRecord,
  DemoTemplateCategory,
} from '@/types/persistence';
import {
  getDemoTemplateStringArrayMetadata,
  getDemoTemplateStringMetadata,
} from './demoTemplateMapper';

export interface DemoConversationTemplateView {
  id: string;
  title: string;
  description: string;
  category: DemoTemplateCategory;
  tagLabels: string[];
  showcaseValue: string;
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
