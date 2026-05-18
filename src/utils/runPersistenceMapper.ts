import type {
  AgentRunRecord,
  RunEventRecord,
  ToolInvocationRecord,
} from '@/types/persistence';
import type {
  RunChartData,
  RunConclusionSource,
  RunDataSourceSnapshot,
  RunEvent,
  RunIntent,
  RunPlanSnapshot,
  RunReportState,
  RunSnapshot,
  RunStatus,
} from '@/types/run';
import { applyRunEventToSnapshot } from './runReducer';
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
    conclusion: record.conclusion ?? '',
    conclusionSource: mapConclusionSource(record.conclusion_source),
    conclusionNotice: conclusionNotice || undefined,
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
  const persistedTools = params.tools.map((tool) => toolInvocationRecordToRunTool(tool));
  const persistedReportState = mapReportState(params.run.report_state);

  return {
    ...snapshot,
    id: params.run.runtime_run_id ?? snapshot.id,
    sessionId: params.run.conversation_id,
    toolInvocations: persistedTools.length > 0 ? persistedTools : snapshot.toolInvocations,
    reportState: shouldPreferPersistedReportState(persistedReportState) ? persistedReportState : snapshot.reportState,
  };
}
