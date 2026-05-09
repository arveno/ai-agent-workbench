/// <reference types="node" />

import { aggregateTableTool } from './aggregateTableTool';
import { chartRenderTool } from './chartRenderTool';
import { queryTableTool } from './queryTableTool';
import { schemaInspectTool } from './schemaInspectTool';

export const serverToolRegistry = {
  schema_inspect: schemaInspectTool,
  query_table: queryTableTool,
  aggregate_table: aggregateTableTool,
  chart_render: chartRenderTool,
} as const;

export type RegisteredServerToolId = keyof typeof serverToolRegistry;

export function getServerTool(toolId: RegisteredServerToolId) {
  return serverToolRegistry[toolId];
}
