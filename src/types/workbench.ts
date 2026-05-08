export type SessionId = string;
export type TaskId = string;
export type ToolCallId = string;
export type KnowledgeSourceId = string;

export type AgentStepStatus = 'pending' | 'running' | 'success' | 'error';

export interface Session {
  id: SessionId;
  title: string;
  updatedAt: string;
}

export interface ExampleTask {
  id: TaskId;
  title: string;
  description: string;
  prompt: string;
}

export interface AgentStep {
  id: string;
  title: string;
  status: AgentStepStatus;
}

export interface ToolCall {
  id: ToolCallId;
  title: string;
  toolName: string;
  params: string;
  result: string;
  status: 'success' | 'running' | 'error';
}

export interface KnowledgeSource {
  id: KnowledgeSourceId;
  title: string;
  summary: string;
  matchRate: number;
}

export interface AnalyticsResult {
  kpis: {
    averageScore: number;
    attendanceRate: number;
    abnormalCount: number;
  };
  gradeScores: Array<{
    grade: string;
    value: number;
  }>;
}