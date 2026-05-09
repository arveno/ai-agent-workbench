export type SessionId = string;
export type TaskId = string;
export type ToolCallId = string;
export type KnowledgeSourceId = string;

export type AgentStepStatus = 'pending' | 'running' | 'success' | 'error';

export interface WorkbenchMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface WorkbenchSession {
  id: SessionId;
  title: string;
  updatedAt: number;
  messages: WorkbenchMessage[];
  taskId?: string;
}

export type Session = WorkbenchSession;

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

export type ChatMessage = WorkbenchMessage;

export type MessageStatus = 'idle' | 'streaming' | 'done' | 'stopped';
export type GenerationStatus = 'idle' | 'streaming' | 'done' | 'stopped' | 'error';
export type ConfirmStatus = 'waiting' | 'confirmed' | 'cancelled';
export type ModelProviderId =
  | 'mock'
  | 'groq'
  | 'gemini'
  | 'openrouter'
  | 'openai-api-key'
  | 'codex-oauth'
  | 'ollama';
export type ModelProvider = ModelProviderId;
export type ModelTestStatus = 'idle' | 'testing' | 'success' | 'error';

export interface ModelProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
}

export type ModelProviderConfigMap = Partial<Record<ModelProviderId, ModelProviderConfig>>;
export type ModelProviderTestStatusMap = Partial<Record<ModelProviderId, ModelTestStatus>>;

export interface ModelProviderOption {
  id: ModelProviderId;
  name: string;
  description: string;
  status: 'active' | 'available' | 'reserved';
}

export interface AssistantStreamState {
  content: string;
  status: MessageStatus;
}

export interface FinalMessage {
  content: string;
  status: 'hidden' | 'visible';
}
