import type {
  AgentRunRecord,
  RunEventRecord,
  RunSourceRecord,
  ToolInvocationRecord,
} from '@/types/persistence';
import type { RunSource, RunSourceType } from '@/types/rag';
import type {
  AgentConclusion,
  RunChartData,
  RunConclusionSource,
  RunDataSourceSnapshot,
  RunEvent,
  RunIntent,
  RunModelCostEstimate,
  RunModelTrace,
  RunModelUsage,
  RunPlanSnapshot,
  RunReportState,
  RunSnapshot,
  RunSnapshotStatus,
  RunViewModel,
} from '@/types/run';
import { applyRunEventToViewModel, normalizeAgentConclusion, runSnapshotToViewModel } from './runReducer';
import { toolInvocationRecordToRunTool } from './toolInvocationMapper';

const RUN_EVENT_TYPES = new Set<RunEvent['type']>([
  'run_started',
  'run_reused',
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

function mapRunSnapshotStatus(status: AgentRunRecord['status']): RunSnapshotStatus {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
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

function mapSourceType(value: string): RunSourceType {
  if (value === 'knowledge' || value === 'tool' || value === 'report' || value === 'manual') {
    return value;
  }

  return 'knowledge';
}

function shouldPreferPersistedReportState(reportState: RunReportState): boolean {
  return reportState !== 'hidden';
}

function getNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function createUnavailableModelUsage(reason = 'model_not_invoked'): RunModelUsage {
  return {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    usageAvailable: false,
    usageSource: 'none',
    usageUnavailableReason: reason,
  };
}

function createUnavailableCostEstimate(reason = 'model_not_invoked'): RunModelCostEstimate {
  return {
    estimatedCost: null,
    currency: null,
    pricingUnit: null,
    isEstimated: false,
    pricingSource: 'none',
    costUnavailableReason: reason,
  };
}

function mapTraceConclusionSource(value: unknown): RunConclusionSource {
  return mapConclusionSource(getNullableString(value));
}

function asModelUsage(value: unknown): RunModelUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    promptTokens: getNullableNumber(value.promptTokens),
    completionTokens: getNullableNumber(value.completionTokens),
    totalTokens: getNullableNumber(value.totalTokens),
    usageAvailable: value.usageAvailable === true,
    usageSource: getNullableString(value.usageSource),
    usageUnavailableReason: getNullableString(value.usageUnavailableReason),
  };
}

function asCostEstimate(value: unknown): RunModelCostEstimate | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    estimatedCost: getNullableNumber(value.estimatedCost),
    currency: getNullableString(value.currency),
    pricingUnit: getNullableString(value.pricingUnit),
    isEstimated: value.isEstimated === true,
    pricingSource: getNullableString(value.pricingSource),
    costUnavailableReason: getNullableString(value.costUnavailableReason),
  };
}

function asModelTrace(value: unknown): RunModelTrace | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    selectedModelId: getNullableString(value.selectedModelId) ?? 'unknown',
    provider: getNullableString(value.provider),
    model: getNullableString(value.model),
    latencyMs: getNullableNumber(value.latencyMs),
    usage: asModelUsage(value.usage) ?? createUnavailableModelUsage(),
    costEstimate: asCostEstimate(value.costEstimate) ?? createUnavailableCostEstimate(),
    fallbackReason: getNullableString(value.fallbackReason),
    modelErrorType: getNullableString(value.modelErrorType),
    modelHttpStatus: getNullableNumber(value.modelHttpStatus),
    modelErrorMessage: getNullableString(value.modelErrorMessage),
    conclusionSource: mapTraceConclusionSource(value.conclusionSource),
  };
}

function getRunModelTrace(record: AgentRunRecord): RunModelTrace | undefined {
  return asModelTrace(record.metadata.modelTrace);
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

function toOptionalString(value: string | null): string | undefined {
  return value ?? undefined;
}

function runSourceRecordToRunSource(record: RunSourceRecord): RunSource {
  return {
    id: record.id,
    runId: record.run_id,
    conversationId: record.conversation_id,
    toolInvocationId: toOptionalString(record.tool_invocation_id),
    retrievalLogId: toOptionalString(record.retrieval_log_id),
    documentId: toOptionalString(record.document_id),
    chunkId: toOptionalString(record.chunk_id),
    citationLabel: toOptionalString(record.citation_label),
    sourceOrder: record.source_order,
    title: record.title,
    preview: record.preview,
    score: record.score ?? undefined,
    sourceType: mapSourceType(record.source_type),
    usedInAnswer: record.used_in_answer,
    noSourceReason: toOptionalString(record.no_source_reason),
    createdAt: record.created_at,
    metadata: record.metadata,
  };
}

function getAgentRunRecordIdentity(record: AgentRunRecord): Pick<RunSnapshot, 'id' | 'clientRunId'> {
  const runId = record.id;

  return {
    id: runId,
    clientRunId: record.client_run_id,
  };
}

export function agentRunRecordToSnapshot(record: AgentRunRecord): RunSnapshot {
  const runIdentity = getAgentRunRecordIdentity(record);
  const modelTrace = getRunModelTrace(record);
  const agentConclusion = normalizeAgentConclusion(
    record.conclusion ?? '',
    record.metadata.agentConclusion as AgentConclusion | undefined,
  );

  return {
    ...runIdentity,
    conversationId: record.conversation_id,
    mode: record.mode,
    status: mapRunSnapshotStatus(record.status),
    intent: mapIntent(record.intent),
    prompt: record.prompt ?? '',
    plan: asPlan(record.plan),
    dataSource: asDataSource(record.data_source_snapshot),
    chartData: asChartData(record.chart_data),
    agentConclusion: agentConclusion.plainText ? agentConclusion : undefined,
    modelTrace: modelTrace ?? null,
    reportState: mapReportState(record.report_state),
    createdAt: record.started_at,
    updatedAt: record.completed_at ?? record.started_at,
    startedAt: record.started_at,
    completedAt: record.completed_at ?? undefined,
    elapsedMs: record.elapsed_ms ?? undefined,
    errorMessage: record.error_message ?? undefined,
  };
}

export function agentRunRecordToBaseViewModel(record: AgentRunRecord): RunViewModel {
  return runSnapshotToViewModel(agentRunRecordToSnapshot(record), {
    sessionId: record.conversation_id,
    displayRunId: record.id,
  });
}

export function runEventsRecordToRunEvents(records: RunEventRecord[]): RunEvent[] {
  return records
    .slice()
    .sort((left, right) => left.seq - right.seq)
    .map((record) => eventRecordToRunEvent(record))
    .filter((event): event is RunEvent => event !== null);
}

export function runPersistenceRecordsToViewModel(params: {
  run: AgentRunRecord;
  events: RunEventRecord[];
  tools: ToolInvocationRecord[];
  sources: RunSourceRecord[];
}): RunViewModel {
  const runEvents = runEventsRecordToRunEvents(params.events);
  const eventViewModel = runEvents.reduce<RunViewModel | null>(
    (snapshot, event) => applyRunEventToViewModel(snapshot, event),
    null,
  );
  const baseViewModel = agentRunRecordToBaseViewModel(params.run);
  const viewModel = eventViewModel ? { ...baseViewModel, ...eventViewModel } : baseViewModel;
  const agentConclusion = normalizeAgentConclusion(
    viewModel.conclusion,
    viewModel.agentConclusion,
  );
  const persistedTools = params.tools.map((tool) => toolInvocationRecordToRunTool(tool));
  const persistedSources = params.sources.map((source) => runSourceRecordToRunSource(source));
  const persistedReportState = mapReportState(params.run.report_state);
  const runIdentity = getAgentRunRecordIdentity(params.run);
  const modelTrace = viewModel.modelTrace ?? getRunModelTrace(params.run);

  return {
    ...viewModel,
    id: runIdentity.id,
    clientRunId: runIdentity.clientRunId ?? undefined,
    displayRunId: params.run.id,
    conclusion: agentConclusion.plainText,
    conclusionSource: modelTrace?.conclusionSource ?? 'none',
    agentConclusion: agentConclusion.plainText ? agentConclusion : undefined,
    modelTrace,
    toolInvocations: persistedTools.length > 0 ? persistedTools : viewModel.toolInvocations,
    sources: persistedSources,
    reportState: shouldPreferPersistedReportState(persistedReportState) ? persistedReportState : viewModel.reportState,
    sessionId: params.run.conversation_id,
  };
}
