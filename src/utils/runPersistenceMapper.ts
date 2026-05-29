import type {
  AgentRunRecord,
  RunEventRecord,
  RunSourceRecord,
  ToolInvocationRecord,
} from '@/types/persistence';
import type { RunSource, RunSourceType } from '@/types/rag';
import type {
  RunEvent,
} from '@/types/run';
import type {
  CostEstimate,
  ModelTrace,
  ModelUsage,
  RunSnapshot,
} from '../../contracts/generated/workbench-contract';
import type {
  RunViewModel,
  RunViewModelAgentConclusion,
  RunViewModelConclusionSource,
  RunViewModelIntent,
  RunViewModelReportState,
} from '@/domain/run/view-model';
import { RunViewModelFactory } from '@/domain/run/view-model';
import { applyRunEventToViewModel, normalizeAgentConclusion } from './runReducer';
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

function mapIntent(value: string | null): RunViewModelIntent {
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

function mapConclusionSource(value: string | null): RunViewModelConclusionSource {
  if (value === 'model' || value === 'fallback' || value === 'mock' || value === 'none') {
    return value;
  }

  return 'none';
}

function mapReportState(value: string | null): RunViewModelReportState {
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

function shouldPreferPersistedReportState(reportState: RunViewModelReportState): boolean {
  return reportState !== 'hidden';
}

function getNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapUsageSource(value: unknown): ModelUsage['usageSource'] {
  if (value === 'provider' || value === 'unavailable' || value === 'estimated') {
    return value;
  }

  return 'none';
}

function mapPricingSource(value: unknown): CostEstimate['pricingSource'] {
  if (value === 'catalog' || value === 'unavailable') {
    return value;
  }

  return 'none';
}

function createUnavailableModelUsage(reason = 'model_not_invoked'): ModelUsage {
  return {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    usageAvailable: false,
    usageSource: 'none',
    usageUnavailableReason: reason,
  };
}

function createUnavailableCostEstimate(reason = 'model_not_invoked'): CostEstimate {
  return {
    estimatedCost: null,
    currency: null,
    pricingUnit: null,
    isEstimated: false,
    pricingSource: 'none',
    costUnavailableReason: reason,
  };
}

function mapTraceConclusionSource(value: unknown): ModelTrace['conclusionSource'] {
  return mapConclusionSource(getNullableString(value));
}

function asModelUsage(value: unknown): ModelUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    promptTokens: getNullableNumber(value.promptTokens),
    completionTokens: getNullableNumber(value.completionTokens),
    totalTokens: getNullableNumber(value.totalTokens),
    usageAvailable: value.usageAvailable === true,
    usageSource: mapUsageSource(value.usageSource),
    usageUnavailableReason: getNullableString(value.usageUnavailableReason),
  };
}

function asCostEstimate(value: unknown): CostEstimate | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    estimatedCost: getNullableNumber(value.estimatedCost),
    currency: getNullableString(value.currency),
    pricingUnit: getNullableString(value.pricingUnit),
    isEstimated: value.isEstimated === true,
    pricingSource: mapPricingSource(value.pricingSource),
    costUnavailableReason: getNullableString(value.costUnavailableReason),
  };
}

function asModelTrace(value: unknown): ModelTrace | undefined {
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

function getRunModelTrace(record: AgentRunRecord): ModelTrace | undefined {
  return asModelTrace(record.metadata.modelTrace);
}

function asCanonicalObject(value: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
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

function getAgentRunRecordIdentity(record: AgentRunRecord): Pick<
  RunViewModel,
  'id' | 'clientRunId' | 'displayRunId'
> {
  const runId = record.id;
  const clientRunId = record.client_run_id === null ? undefined : record.client_run_id;

  return {
    id: runId,
    clientRunId,
    displayRunId: runId,
  };
}

function agentRunRecordToCanonicalRun(
  record: AgentRunRecord,
  agentConclusion: RunViewModelAgentConclusion | null,
  modelTrace: ModelTrace | undefined,
): RunSnapshot {
  return {
    id: record.id,
    conversationId: record.conversation_id,
    clientRunId: record.client_run_id,
    usageId: record.usage_id,
    mode: record.mode,
    status: record.status,
    intent: mapIntent(record.intent),
    prompt: record.prompt ?? '',
    plan: asCanonicalObject(record.plan),
    dataSource: asCanonicalObject(record.data_source_snapshot),
    chartData: asCanonicalObject(record.chart_data),
    modelTrace: modelTrace ?? null,
    agentConclusion,
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
  const modelTrace = getRunModelTrace(record);
  const agentConclusion = normalizeAgentConclusion(
    record.conclusion ?? '',
    record.metadata.agentConclusion,
  );
  const run = agentRunRecordToCanonicalRun(
    record,
    agentConclusion.plainText ? agentConclusion : null,
    modelTrace,
  );

  return RunViewModelFactory.fromCanonicalRun({
    run,
    conversationId: record.conversation_id,
    conclusion: agentConclusion.plainText,
    agentConclusion: agentConclusion.plainText ? agentConclusion : null,
    modelTrace,
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
    (viewModel, event) => applyRunEventToViewModel(viewModel, event),
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

  return RunViewModelFactory.fromRestoredRunAdapter({
    id: runIdentity.id,
    conversationId: params.run.conversation_id,
    clientRunId: runIdentity.clientRunId,
    displayRunId: runIdentity.displayRunId,
    mode: viewModel.mode,
    status: viewModel.status,
    intent: viewModel.intent,
    prompt: viewModel.prompt,
    plan: viewModel.plan,
    dataSource: viewModel.dataSource,
    steps: viewModel.steps,
    chartData: viewModel.chartData,
    createdAt: viewModel.createdAt,
    updatedAt: viewModel.updatedAt,
    startedAt: viewModel.startedAt,
    completedAt: viewModel.completedAt,
    elapsedMs: viewModel.elapsedMs,
    errorMessage: viewModel.errorMessage,
    conclusion: agentConclusion.plainText,
    conclusionSource: modelTrace?.conclusionSource ?? 'none',
    agentConclusion: agentConclusion.plainText ? agentConclusion : null,
    modelTrace,
    toolInvocations: persistedTools.length > 0 ? persistedTools : viewModel.toolInvocations,
    sources: persistedSources,
    reportState: shouldPreferPersistedReportState(persistedReportState) ? persistedReportState : viewModel.reportState,
  });
}
