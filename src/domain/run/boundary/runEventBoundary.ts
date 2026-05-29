import type { RunSource } from '../../../types/rag';
import type {
  RunViewModelConclusionSource,
  RunViewModelIntent,
  RunViewModelMode,
  RunViewModelReportState,
  RunViewModelStatus,
  RunViewModelToolInvocation,
} from '../view-model';
import type {
  NormalizedRunEvent,
  RunCompletedEvent,
  RunEventBoundaryContext,
  RunEventIdentity,
  RunEventType,
  RunFailedEvent,
  RunStartedEvent,
  RunStartedPayload,
  RunStoppedEvent,
} from './types';

const RUN_EVENT_TYPES: RunEventType[] = [
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
];

const RUN_EVENT_TYPE_SET = new Set<string>(RUN_EVENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRunEventType(value: unknown): RunEventType | null {
  return typeof value === 'string' && RUN_EVENT_TYPE_SET.has(value) ? value as RunEventType : null;
}

function readRunMode(value: unknown): RunViewModelMode | null {
  return value === 'mock' || value === 'agent' ? value : null;
}

function readRunIntent(value: unknown): RunViewModelIntent | undefined {
  if (
    value === 'capability_intro' ||
    value === 'data_analysis' ||
    value === 'knowledge_qa' ||
    value === 'unsupported' ||
    value === 'unknown'
  ) {
    return value;
  }

  return undefined;
}

function mapRunStatus(value: unknown): RunViewModelStatus | undefined {
  if (value === 'completed' || value === 'success') {
    return 'success';
  }

  if (value === 'failed' || value === 'error') {
    return 'error';
  }

  if (value === 'idle' || value === 'pending' || value === 'running' || value === 'stopped') {
    return value;
  }

  return undefined;
}

function readReportState(value: unknown): RunViewModelReportState | undefined {
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

  return undefined;
}

function readConclusionSource(value: unknown): RunViewModelConclusionSource | undefined {
  if (value === 'model' || value === 'fallback' || value === 'mock' || value === 'none') {
    return value;
  }

  return undefined;
}

function readToolStatus(value: unknown): RunViewModelToolInvocation['status'] | null {
  if (
    value === 'pending' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error' ||
    value === 'skipped' ||
    value === 'stopped'
  ) {
    return value;
  }

  if (value === 'completed') {
    return 'success';
  }

  if (value === 'failed') {
    return 'error';
  }

  return null;
}

function readToolInvocation(record: Record<string, unknown>): RunViewModelToolInvocation | null {
  const id = readString(record.id);
  const toolId = readString(record.toolId);
  const toolName = readString(record.toolName);
  const displayName = readString(record.displayName);
  const status = readToolStatus(record.status);
  const inputSummary = typeof record.inputSummary === 'string' ? record.inputSummary : null;
  const outputSummary = typeof record.outputSummary === 'string' ? record.outputSummary : null;
  const startedAt = readString(record.startedAt);
  const completedAt = readString(record.completedAt);
  const elapsedMs = readNumber(record.elapsedMs);

  if (!id || !toolId || !toolName || !displayName || !status || inputSummary === null || outputSummary === null) {
    return null;
  }

  return {
    id,
    toolId,
    toolName,
    displayName,
    status,
    inputSummary,
    outputSummary,
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
  };
}

function readContextString(context: RunEventBoundaryContext, key: 'runId' | 'conversationId' | 'timestamp' | 'clientRunId'): string | null {
  return readString(context[key]);
}

function readEventString(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
  key: 'runId' | 'conversationId' | 'timestamp',
): string | null {
  const eventValue = readString(record[key]);

  if (eventValue) {
    return eventValue;
  }

  return readContextString(context, key);
}

function readClientRunId(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
  runRecord?: Record<string, unknown> | null,
): string | undefined {
  const eventClientRunId = readString(record.clientRunId);

  if (eventClientRunId) {
    return eventClientRunId;
  }

  const runClientRunId = runRecord ? readString(runRecord.clientRunId) : null;

  if (runClientRunId) {
    return runClientRunId;
  }

  return readContextString(context, 'clientRunId') ?? undefined;
}

function resolveRunStartedRunId(params: {
  eventRunId: string | null;
  payloadRunId: string | null;
  clientRunId: string | undefined;
  source?: RunEventBoundaryContext['source'];
}): string | null {
  if (params.eventRunId) {
    return params.eventRunId;
  }

  if (!params.payloadRunId) {
    return null;
  }

  if (params.source === 'local') {
    return params.payloadRunId;
  }

  if (params.payloadRunId !== params.clientRunId) {
    return params.payloadRunId;
  }

  return null;
}

function createIdentity(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): RunEventIdentity | null {
  const runId = readEventString(record, context, 'runId');

  if (!runId) {
    return null;
  }

  const conversationId = readEventString(record, context, 'conversationId');
  const timestamp = readEventString(record, context, 'timestamp');
  const clientRunId = readClientRunId(record, context);

  return {
    runId,
    ...(conversationId ? { conversationId } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(clientRunId ? { clientRunId } : {}),
  };
}

function readPayload(record: Record<string, unknown>): Record<string, unknown> | null {
  return readRecord(record.payload);
}

function readPayloadRecord(
  record: Record<string, unknown>,
  payloadKey: string,
): Record<string, unknown> | null {
  const payload = readPayload(record);
  return payload ? readRecord(payload[payloadKey]) : null;
}

function readStartedPayload(
  sourceRecord: Record<string, unknown>,
  runId: string,
  clientRunId: string | undefined,
): RunStartedPayload | null {
  const mode = readRunMode(sourceRecord.mode);

  if (!mode) {
    return null;
  }

  const displayRunId = readString(sourceRecord.displayRunId) ?? runId;
  const status = mapRunStatus(sourceRecord.status);
  const intent = readRunIntent(sourceRecord.intent);
  const prompt = readString(sourceRecord.prompt);
  const conclusion = readString(sourceRecord.conclusion);
  const conclusionSource = readConclusionSource(sourceRecord.conclusionSource);
  const reportState = readReportState(sourceRecord.reportState);

  return {
    id: runId,
    ...(clientRunId ? { clientRunId } : {}),
    displayRunId,
    mode,
    ...(status ? { status } : {}),
    ...(intent ? { intent } : {}),
    ...(prompt ? { prompt } : {}),
    ...(sourceRecord.plan ? { plan: sourceRecord.plan as RunStartedPayload['plan'] } : {}),
    ...(sourceRecord.dataSource ? { dataSource: sourceRecord.dataSource as RunStartedPayload['dataSource'] } : {}),
    ...(Array.isArray(sourceRecord.steps) ? { steps: sourceRecord.steps as RunStartedPayload['steps'] } : {}),
    ...(Array.isArray(sourceRecord.toolInvocations) ? { toolInvocations: sourceRecord.toolInvocations as RunStartedPayload['toolInvocations'] } : {}),
    ...(Array.isArray(sourceRecord.sources) ? { sources: sourceRecord.sources as RunSource[] } : {}),
    ...(sourceRecord.chartData ? { chartData: sourceRecord.chartData as NonNullable<RunStartedPayload['chartData']> } : {}),
    ...(conclusion ? { conclusion } : {}),
    ...(conclusionSource ? { conclusionSource } : {}),
    ...(sourceRecord.agentConclusion ? { agentConclusion: sourceRecord.agentConclusion as RunStartedPayload['agentConclusion'] } : {}),
    ...(sourceRecord.modelTrace ? { modelTrace: sourceRecord.modelTrace as RunStartedPayload['modelTrace'] } : {}),
    ...(reportState ? { reportState } : {}),
    ...(readString(sourceRecord.createdAt) ? { createdAt: readString(sourceRecord.createdAt) as string } : {}),
    ...(readString(sourceRecord.updatedAt) ? { updatedAt: readString(sourceRecord.updatedAt) as string } : {}),
    ...(readString(sourceRecord.startedAt) ? { startedAt: readString(sourceRecord.startedAt) as string } : {}),
    ...(readString(sourceRecord.completedAt) ? { completedAt: readString(sourceRecord.completedAt) as string } : {}),
    ...(readNumber(sourceRecord.elapsedMs) !== undefined ? { elapsedMs: readNumber(sourceRecord.elapsedMs) } : {}),
    ...(readString(sourceRecord.errorMessage) ? { errorMessage: readString(sourceRecord.errorMessage) as string } : {}),
  };
}

function normalizeRunStarted(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): RunStartedEvent | null {
  const payloadRunRecord = readPayloadRecord(record, 'run');
  const flatRunRecord = readRecord(record.run);
  const runRecord = payloadRunRecord ?? flatRunRecord;

  if (!runRecord) {
    return null;
  }

  const clientRunId = readClientRunId(record, context, runRecord);
  const eventRunId = readEventString(record, context, 'runId');
  const payloadRunId = readString(runRecord.id);
  const runId = resolveRunStartedRunId({
    eventRunId,
    payloadRunId,
    clientRunId,
    source: context.source,
  });
  const conversationId = readEventString(record, context, 'conversationId') ?? readString(runRecord.conversationId);

  if (!runId || !conversationId) {
    return null;
  }

  const run = readStartedPayload(runRecord, runId, clientRunId);
  const timestamp = readEventString(record, context, 'timestamp');

  if (!run) {
    return null;
  }

  return {
    type: 'run_started',
    runId,
    conversationId,
    ...(timestamp ? { timestamp } : {}),
    ...(clientRunId ? { clientRunId } : {}),
    run,
  };
}

function normalizeRunReused(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const payload = readPayload(record);
  const sourceRecord = payload ?? record;
  const reusedRecord = readRecord(sourceRecord.reusedRun) ?? readRecord(sourceRecord.existingRun);

  if (!identity) {
    return null;
  }

  const status = mapRunStatus(sourceRecord.status);
  const existingStatus = reusedRecord ? mapRunStatus(reusedRecord.status) : undefined;
  const conclusionSource = reusedRecord ? readConclusionSource(reusedRecord.conclusionSource) : undefined;
  const reportState = reusedRecord ? readReportState(reusedRecord.reportState) : undefined;
  const completedAt = reusedRecord ? readString(reusedRecord.completedAt) : null;

  return {
    type: 'run_reused',
    ...identity,
    ...(sourceRecord.duplicate === true ? { duplicate: true } : {}),
    ...(sourceRecord.reused === true ? { reused: true } : {}),
    ...(readString(sourceRecord.reason) ? { reason: readString(sourceRecord.reason) as string } : {}),
    ...(status ? { status } : {}),
    ...(reusedRecord
      ? {
          existingRun: {
            ...(readString(reusedRecord.id) ? { id: readString(reusedRecord.id) as string } : {}),
            ...(existingStatus ? { status: existingStatus } : {}),
            ...(conclusionSource ? { conclusionSource } : {}),
            ...(reportState ? { reportState } : {}),
            ...(completedAt ? { completedAt } : {}),
          },
        }
      : {}),
  };
}

function normalizeStepStarted(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const step = readPayloadRecord(record, 'step') ?? record;
  const stepId = readString(step.stepId);
  const title = readString(step.title);
  const startedAt = readString(step.startedAt);

  if (!identity || !stepId || !title || !startedAt) {
    return null;
  }

  return {
    type: 'step_started',
    ...identity,
    stepId,
    title,
    ...(readString(step.description) ? { description: readString(step.description) as string } : {}),
    startedAt,
  };
}

function normalizeStepCompleted(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const step = readPayloadRecord(record, 'stepDelta') ?? record;
  const stepId = readString(step.stepId);
  const completedAt = readString(step.completedAt);
  const elapsedMs = readNumber(step.elapsedMs);

  if (!identity || !stepId || !completedAt) {
    return null;
  }

  return {
    type: 'step_completed',
    ...identity,
    stepId,
    completedAt,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
  };
}

function normalizeStepFailed(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const step = readPayloadRecord(record, 'stepDelta') ?? record;
  const stepId = readString(step.stepId);
  const errorMessage = readString(step.errorMessage);
  const completedAt = readString(step.completedAt);
  const elapsedMs = readNumber(step.elapsedMs);

  if (!identity || !stepId || !errorMessage || !completedAt) {
    return null;
  }

  return {
    type: 'step_failed',
    ...identity,
    stepId,
    errorMessage,
    completedAt,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
  };
}

function normalizeToolStarted(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const tool = readPayloadRecord(record, 'toolInvocation') ?? readRecord(record.tool);

  if (!identity || !tool) {
    return null;
  }

  const toolInvocation = readToolInvocation(tool);

  if (!toolInvocation) {
    return null;
  }

  return {
    type: 'tool_started',
    ...identity,
    tool: toolInvocation,
  };
}

function normalizeToolCompleted(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const tool = readPayloadRecord(record, 'toolDelta') ?? record;
  const toolId = readString(tool.toolId);
  const outputSummary = readString(tool.outputSummary);
  const completedAt = readString(tool.completedAt);
  const elapsedMs = readNumber(tool.elapsedMs);

  if (!identity || !toolId || !outputSummary || !completedAt) {
    return null;
  }

  return {
    type: 'tool_completed',
    ...identity,
    toolId,
    outputSummary,
    completedAt,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
  };
}

function normalizeToolFailed(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const tool = readPayloadRecord(record, 'toolDelta') ?? record;
  const toolId = readString(tool.toolId);
  const errorMessage = readString(tool.errorMessage);
  const completedAt = readString(tool.completedAt);
  const elapsedMs = readNumber(tool.elapsedMs);

  if (!identity || !toolId || !errorMessage || !completedAt) {
    return null;
  }

  return {
    type: 'tool_failed',
    ...identity,
    toolId,
    errorMessage,
    completedAt,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
  };
}

function normalizeChartReady(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const payload = readPayload(record);
  const chartData = payload ? payload.chartData : record.chartData;

  if (!identity || !chartData) {
    return null;
  }

  return {
    type: 'chart_ready',
    ...identity,
    chartData: chartData as NonNullable<RunStartedPayload['chartData']>,
  };
}

function normalizeConclusionDelta(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const payload = readPayload(record);
  const delta = readString(payload ? payload.delta : record.delta);

  if (!identity || delta === null) {
    return null;
  }

  return {
    type: 'conclusion_delta',
    ...identity,
    delta,
  };
}

function normalizeConclusionCompleted(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const payload = readPayload(record);
  const sourceRecord = payload ?? record;
  const conclusion = readString(sourceRecord.conclusion);

  if (!identity || conclusion === null) {
    return null;
  }

  return {
    type: 'conclusion_completed',
    ...identity,
    conclusion,
    ...(sourceRecord.agentConclusion ? { agentConclusion: sourceRecord.agentConclusion as RunStartedPayload['agentConclusion'] } : {}),
    ...(sourceRecord.modelTrace ? { modelTrace: sourceRecord.modelTrace as RunStartedPayload['modelTrace'] } : {}),
  };
}

function normalizeRagSourcesReady(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);
  const payload = readPayload(record);
  const sources = payload ? payload.sources : record.sources;

  if (!identity || !Array.isArray(sources)) {
    return null;
  }

  return {
    type: 'rag_sources_ready',
    ...identity,
    sources: sources as RunSource[],
  };
}

function normalizeReportPending(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): NormalizedRunEvent | null {
  const identity = createIdentity(record, context);

  if (!identity) {
    return null;
  }

  return {
    type: 'report_pending',
    ...identity,
  };
}

function normalizeRunCompleted(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): RunCompletedEvent | null {
  const identity = createIdentity(record, context);
  const payload = readPayload(record);
  const sourceRecord = payload ?? record;
  const completedAt = readString(sourceRecord.completedAt);
  const elapsedMs = readNumber(sourceRecord.elapsedMs);

  if (!identity || !completedAt) {
    return null;
  }

  return {
    type: 'run_completed',
    ...identity,
    completedAt,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(sourceRecord.modelTrace ? { modelTrace: sourceRecord.modelTrace as RunStartedPayload['modelTrace'] } : {}),
  };
}

function normalizeRunFailed(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): RunFailedEvent | null {
  const identity = createIdentity(record, context);
  const payload = readPayload(record);
  const sourceRecord = payload ?? record;
  const errorMessage = readString(sourceRecord.errorMessage);

  if (!identity || !errorMessage) {
    return null;
  }

  return {
    type: 'run_failed',
    ...identity,
    errorMessage,
    ...(sourceRecord.modelTrace ? { modelTrace: sourceRecord.modelTrace as RunStartedPayload['modelTrace'] } : {}),
  };
}

function normalizeRunStopped(
  record: Record<string, unknown>,
  context: RunEventBoundaryContext,
): RunStoppedEvent | null {
  if (context.source !== 'local') {
    return null;
  }

  const identity = createIdentity(record, context);

  if (!identity) {
    return null;
  }

  return {
    type: 'run_stopped',
    ...identity,
    source: 'local',
  };
}

export function normalizeRunEvent(
  input: unknown,
  context: RunEventBoundaryContext = {},
): NormalizedRunEvent | null {
  const record = readRecord(input);

  if (!record) {
    return null;
  }

  const type = readRunEventType(record.type);

  if (!type) {
    return null;
  }

  if (type === 'run_started') return normalizeRunStarted(record, context);
  if (type === 'run_reused') return normalizeRunReused(record, context);
  if (type === 'step_started') return normalizeStepStarted(record, context);
  if (type === 'step_completed') return normalizeStepCompleted(record, context);
  if (type === 'step_failed') return normalizeStepFailed(record, context);
  if (type === 'tool_started') return normalizeToolStarted(record, context);
  if (type === 'tool_completed') return normalizeToolCompleted(record, context);
  if (type === 'tool_failed') return normalizeToolFailed(record, context);
  if (type === 'chart_ready') return normalizeChartReady(record, context);
  if (type === 'conclusion_delta') return normalizeConclusionDelta(record, context);
  if (type === 'conclusion_completed') return normalizeConclusionCompleted(record, context);
  if (type === 'rag_sources_ready') return normalizeRagSourcesReady(record, context);
  if (type === 'report_pending') return normalizeReportPending(record, context);
  if (type === 'run_completed') return normalizeRunCompleted(record, context);
  if (type === 'run_failed') return normalizeRunFailed(record, context);

  return normalizeRunStopped(record, context);
}

export function createLocalRunStoppedEvent(runId: string): RunStoppedEvent {
  const normalizedRunId = readString(runId);

  if (!normalizedRunId) {
    throw new Error('RunEventBoundary requires runId for local run_stopped.');
  }

  return {
    type: 'run_stopped',
    runId: normalizedRunId,
    source: 'local',
  };
}

export function createLocalRunFailedEvent(params: {
  runId: string;
  errorMessage: string;
}): RunFailedEvent {
  const runId = readString(params.runId);
  const errorMessage = readString(params.errorMessage);

  if (!runId || !errorMessage) {
    throw new Error('RunEventBoundary requires runId and errorMessage for local run_failed.');
  }

  return {
    type: 'run_failed',
    runId,
    errorMessage,
  };
}

export const RunEventBoundary = {
  normalize: normalizeRunEvent,
  createLocalRunStoppedEvent,
  createLocalRunFailedEvent,
};
