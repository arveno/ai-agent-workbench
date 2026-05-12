export type WorkbenchToolId =
  | 'schema_inspect'
  | 'query_table'
  | 'aggregate_table'
  | 'chart_render'
  | 'rag_search'
  | 'knowledge_search'
  | 'report_generate';

export type WorkbenchToolCategory = 'schema' | 'query' | 'analysis' | 'render' | 'knowledge' | 'report';

export type WorkbenchToolStatus = 'connected' | 'mock' | 'planned';

export type WorkbenchToolRuntime = 'server' | 'mock' | 'planned';

export type WorkbenchToolRiskLevel = 'low' | 'medium' | 'high';

export interface WorkbenchToolDefinition {
  id: WorkbenchToolId;
  name: string;
  displayName: string;
  description: string;
  category: WorkbenchToolCategory;
  status: WorkbenchToolStatus;
  runtime: WorkbenchToolRuntime;
  riskLevel: WorkbenchToolRiskLevel;
  inputSummary: string;
  outputSummary: string;
  usedInRunTrace: boolean;
  enabled: boolean;
}
