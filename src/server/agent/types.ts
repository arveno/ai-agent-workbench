/// <reference types="node" />

import type { DataSourceTestableProviderId } from '../../types/workbench';

export type AgentRunStatus = 'running' | 'success' | 'error';

export type AgentRunStepStatus = 'pending' | 'running' | 'success' | 'error';
export type AgentPlanIntent = 'capability_intro' | 'data_analysis' | 'unsupported';
export type AgentPlanMetric =
  | 'avg_score'
  | 'attendance_rate'
  | 'homework_completion_rate'
  | 'abnormal_count';
export type AgentPlanGroupBy = 'subject' | 'metric_month';

export interface AgentPlan {
  intent: AgentPlanIntent;
  shouldUseDataAnalysis: boolean;
  reason: string;
  metric?: AgentPlanMetric;
  groupBy?: AgentPlanGroupBy;
}

export interface AgentRunStep {
  id: string;
  title: string;
  status: AgentRunStepStatus;
  description?: string;
  elapsedMs?: number;
}

export interface AgentToolInvocationResult {
  id: string;
  toolId: string;
  toolName: string;
  status: 'success' | 'error';
  inputSummary: string;
  outputSummary: string;
  elapsedMs: number;
}

export interface AgentRunChartData {
  title: string;
  chartType: 'bar' | 'line';
  labels: string[];
  values: number[];
  summary: string;
}

export type AgentConclusionSource = 'model' | 'fallback';

export interface AgentRunResult {
  id: string;
  status: AgentRunStatus;
  prompt: string;
  provider: DataSourceTestableProviderId;
  plan?: AgentPlan;
  steps: AgentRunStep[];
  toolInvocations: AgentToolInvocationResult[];
  chartData?: AgentRunChartData;
  conclusion: string;
  conclusionSource: AgentConclusionSource;
  conclusionNotice?: string;
  createdAt: string;
  elapsedMs: number;
}

export interface AgentRunRequest {
  prompt: string;
  provider: DataSourceTestableProviderId;
  modelProvider?: 'groq';
  apiKey?: string;
}

export interface AgentRunSuccessResponse {
  ok: true;
  run: AgentRunResult;
}

export interface AgentRunErrorResponse {
  ok: false;
  errorMessage: string;
}
