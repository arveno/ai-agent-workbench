export type PromptTemplateId = 'planner' | 'analysis' | 'report' | 'fallback';

export interface PromptTemplate {
  id: PromptTemplateId;
  name: string;
  description: string;
  defaultContent: string;
  currentContent: string;
  variables: string[];
  updatedAt?: string;
}
