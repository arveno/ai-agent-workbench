/// <reference types="node" />

import type { DataSourceTestableProviderId } from '../../types/workbench';

export type ServerToolId = 'schema_inspect' | 'query_table' | 'aggregate_table' | 'chart_render';

export type ServerToolRiskLevel = 'low' | 'medium' | 'high';

export type ToolCellValue = string | number | boolean | null;

export type ToolRow = Record<string, ToolCellValue>;

export interface ServerToolContext {
  provider: DataSourceTestableProviderId;
}

export interface ServerToolDefinition<TInput, TOutput> {
  id: ServerToolId;
  name: string;
  description: string;
  riskLevel: ServerToolRiskLevel;
  enabled: boolean;
  execute: (input: TInput, context: ServerToolContext) => Promise<TOutput>;
}
