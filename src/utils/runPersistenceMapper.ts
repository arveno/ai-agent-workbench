import type {
  AgentRunRecord,
  RunEventRecord,
  ToolInvocationRecord,
} from '@/types/persistence';
import type {
  AgentConclusion,
  RunChartData,
  RunConclusionSource,
  RunDataSourceSnapshot,
  RunEvent,
  RunIntent,
  RunModelTokenUsage,
  RunModelTrace,
  RunPlanSnapshot,
  RunReportState,
  RunSnapshot,
  RunStatus,
} from '@/types/run';
import { applyRunEventToSnapshot, normalizeAgentConclusion } from './runReducer';
import { toolInvocationRecordToRunTool } from './toolInvocationMapper';

const RUN_EVENT_TYPES = new Set<RunEvent['type']>([
  'run_started',
  'step_started',
  'step_completed',
  'step_failed',
  'tool_started',
  'tool_completed',
  'tool_failed',
  'chart_ready',
  'conclusion_delta',
  'conclusion_completed',
  'rag_sources_ready',
  'report_pending',
  'run_completed',
  'run_failed',
  'run_stopped',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunEvent(value: unknown): value is RunEvent {
  return isRecord(value) && typeof value.type === 'string' && RUN_EVENT_TYPES.has(value.type as RunEvent['type']);
}

function mapRunStatus(status: AgentRunRecord['status']): RunStatus {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'stopped') return 'stopped';
  if (status === 'pending') return 'pending';
  return 'running';
}

function mapIntent(value: string | null): RunIntent {
  if (
    value === 'capability_intro' ||
    value === 'data_analysis' ||
    value === 'knowledge_qa' ||
    value === 'unsupported' ||
    value === 'unknown'
  ) {
    return value;
  }

  return 'unknown';
}

function mapConclusionSource(value: string | null): RunConclusionSource {
  if (value === 'model' || value === 'fallback' || value === 'mock' || value === 'none') {
    return value;
  }

  return 'none';
}

function mapReportState(value: string | null): RunReportState {
  if (value === 'not_applicable') {
    return 'hidden';
  }

  if (value === 'available') {
    return 'pending';
  }

  if (
    value === 'hidden' ||
    value === 'pending' ||
    value === 'generating' ||
    value === 'generated' ||
    value === 'skipped' ||
    value === 'failed'
  ) {
    return value;
  }

  return 'hidden';
}

function shouldPreferPersistedReportState(reportState: RunReportState): boolean {
  return reportState !== 'hidden';
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function getMetadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapTraceConclusionSource(value: unknown): RunConclusionSource {
  return mapConclusionSource(getNullableString(value));
}

function asTokenUsage(value: unknown): RunModelTokenUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    promptTokens: getNullableNumber(value.promptTokens),
    completionTokens: getNullableNumber(value.completionTokens),
    totalTokens: getNullableNumber(value.totalTokens),
  };
}

function asModelTrace(value: unknown, fallbackConclusionSource: RunConclusionSource): RunModelTrace | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    selectedModelId: getNullableString(value.selectedModelId),
    provider: getNullableString(value.provider),
    model: getNullableString(value.model),
    latencyMs: getNullableNumber(value.latencyMs),
    tokenUsage: asTokenUsage(value.tokenUsage),
    fallbackReason: getNullableString(value.fallbackReason),
    modelErrorType: getNullableString(value.modelErrorType),
    conclusionSource: mapTraceConclusionSource(value.conclusionSource) || fallbackConclusionSource,
  };
}

function getRunModelTrace(record: AgentRunRecord, conclusionSource: RunConclusionSource): RunModelTrace | undefined {
  const trace = asModelTrace(record.metadata.modelTrace, conclusionSource);

  if (trace) {
    return trace;
  }

  const selectedModelId = getMetadataString(record.metadata, 'selectedModelId');
  const provider = getMetadataString(record.metadata, 'provider');
  const model = getMetadataString(record.metadata, 'model');
  const fallbackReason = getMetadataString(record.metadata, 'fallbackReason');
  const modelErrorType = getMetadataString(record.metadata, 'modelErrorType');
  const latencyMs = getMetadataNumber(record.metadata, 'latencyMs');

  if (!selectedModelId && !provider && !model && !fallbackReason && !modelErrorType && latencyMs === null) {
    return undefined;
  }

  return {
    selectedModelId: selectedModelId || null,
    provider: provider || null,
    model: model || null,
    latencyMs,
    tokenUsage: asTokenUsage(record.metadata.tokenUsage),
    fallbackReason: fallbackReason || null,
    modelErrorType: modelErrorType || null,
    conclusionSource,
  };
}

function asPlan(value: Record<string, unknown>): RunPlanSnapshot | undefined {
  return Object.keys(value).length > 0 ? (value as unknown as RunPlanSnapshot) : undefined;
}

function asDataSource(value: Record<string, unknown>): RunDataSourceSnapshot | undefined {
  return Object.keys(value).length > 0 ? (value as unknown as RunDataSourceSnapshot) : undefined;
}

function asChartData(value: Record<string, unknown>): RunChartData | undefined {
  return Object.keys(value).length > 0 ? (value as unknown as RunChartData) : undefined;
}

function eventRecordToRunEvent(record: RunEventRecord): RunEvent | null {
  return isRunEvent(record.payload) ? record.payload : null;
}

export function agentRunRecordToBaseSnapshot(record: AgentRunRecord): RunSnapshot {
  const runtimeRunId = record.runtime_run_id ?? record.id;
  const conclusionNotice = getMetadataString(record.metadata, 'conclusionNotice');
  const conclusionSource = mapConclusionSource(record.conclusion_source);
  const agentConclusion = normalizeAgentConclusion(
    conclusionSource,
    record.conclusion ?? '',
    record.metadata.agentConclusion as AgentConclusion | undefined,
  );

  return {
    id: runtimeRunId,
    sessionId: record.conversation_id,
    mode: record.mode,
    status: mapRunStatus(record.status),
    intent: mapIntent(record.intent),
    prompt: record.prompt ?? '',
    plan: asPlan(record.plan),
    dataSource: asDataSource(record.data_source_snapshot),
    steps: [],
    toolInvocations: [],
    chartData: asChartData(record.chart_data),
    conclusion: agentConclusion.plainText,
    conclusionSource,
    agentConclusion: agentConclusion.plainText ? agentConclusion : undefined,
    conclusionNotice: conclusionNotice || undefined,
    modelTrace: getRunModelTrace(record, conclusionSource),
    reportState: mapReportState(record.report_state),
    createdAt: record.started_at,
    updatedAt: record.completed_at ?? record.started_at,
    startedAt: record.started_at,
    completedAt: record.completed_at ?? undefined,
    elapsedMs: record.elapsed_ms ?? undefined,
    errorMessage: record.error_message ?? undefined,
  };
}

export function runEventsRecordToRunEvents(records: RunEventRecord[]): RunEvent[] {
  return records
    .slice()
    .sort((left, right) => left.seq - right.seq)
    .map((record) => eventRecordToRunEvent(record))
    .filter((event): event is RunEvent => event !== null);
}

export function runPersistenceRecordsToSnapshot(params: {
  run: AgentRunRecord;
  events: RunEventRecord[];
  tools: ToolInvocationRecord[];
}): RunSnapshot {
  const runEvents = runEventsRecordToRunEvents(params.events);
  const eventSnapshot = runEvents.reduce<RunSnapshot | null>(
    (snapshot, event) => applyRunEventToSnapshot(snapshot, event),
    null,
  );
  const baseSnapshot = agentRunRecordToBaseSnapshot(params.run);
  const snapshot = eventSnapshot ? { ...baseSnapshot, ...eventSnapshot } : baseSnapshot;
  const agentConclusion = normalizeAgentConclusion(
    snapshot.conclusionSource,
    snapshot.conclusion,
    snapshot.agentConclusion,
  );
  const persistedTools = params.tools.map((tool) => toolInvocationRecordToRunTool(tool));
  const persistedReportState = mapReportState(params.run.report_state);

  return {
    ...snapshot,
    conclusion: agentConclusion.plainText,
    agentConclusion: agentConclusion.plainText ? agentConclusion : undefined,
    id: params.run.runtime_run_id ?? snapshot.id,
    sessionId: params.run.conversation_id,
    toolInvocations: persistedTools.length > 0 ? persistedTools : snapshot.toolInvocations,
    reportState: shouldPreferPersistedReportState(persistedReportState) ? persistedReportState : snapshot.reportState,
  };
}
