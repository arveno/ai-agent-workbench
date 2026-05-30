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

type RunEventInputShape = 'envelope' | 'flat';

interface RunEventPayloadSource {
  shape: RunEventInputShape;
  type: RunEventType;
  event: Record<string, unknown>;
  payload: Record<string, unknown>;
  context: RunEventBoundaryContext;
}

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

function hasOwnField(record: Record<string, unknown>, fieldName: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, fieldName);
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
  source: RunEventPayloadSource,
  key: 'runId' | 'conversationId' | 'timestamp',
): string | null {
  const eventValue = readString(source.event[key]);

  if (eventValue) {
    return eventValue;
  }

  return readContextString(source.context, key);
}

function readClientRunId(
  source: RunEventPayloadSource,
  runRecord?: Record<string, unknown> | null,
): string | undefined {
  const eventClientRunId = readString(source.event.clientRunId);

  if (eventClientRunId) {
    return eventClientRunId;
  }

  const runClientRunId = runRecord ? readString(runRecord.clientRunId) : null;

  if (runClientRunId) {
    return runClientRunId;
  }

  return readContextString(source.context, 'clientRunId') ?? undefined;
}

function resolveRunStartedRunId(params: {
  eventRunId: string | null;
  payloadRunId: string | null;
  clientRunId: string | undefined;
  source: RunEventPayloadSource;
}): string | null {
  if (params.eventRunId) {
    return params.eventRunId;
  }

  if (!params.payloadRunId) {
    return null;
  }

  if (params.source.context.source === 'local') {
    return params.payloadRunId;
  }

  if (params.payloadRunId !== params.clientRunId) {
    return params.payloadRunId;
  }

  return null;
}

function createIdentity(source: RunEventPayloadSource): RunEventIdentity | null {
  const runId = readEventString(source, 'runId');

  if (!runId) {
    return null;
  }

  const conversationId = readEventString(source, 'conversationId');
  const timestamp = readEventString(source, 'timestamp');
  const clientRunId = readClientRunId(source);

  return {
    runId,
    ...(conversationId ? { conversationId } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(clientRunId ? { clientRunId } : {}),
  };
}

function readPayloadRecord(source: RunEventPayloadSource, payloadKey: string): Record<string, unknown> | null {
  return readRecord(source.payload[payloadKey]);
}

function createRunEventSource(
  record: Record<string, unknown>,
  type: RunEventType,
  context: RunEventBoundaryContext,
): RunEventPayloadSource | null {
  if (hasOwnField(record, 'payload')) {
    const payload = readRecord(record.payload);

    if (!payload) {
      return null;
    }

    return {
      shape: 'envelope',
      type,
      event: record,
      payload,
      context,
    };
  }

  const payload = createFlatPayload(type, record);

  if (!payload) {
    return null;
  }

  return {
    shape: 'flat',
    type,
    event: record,
    payload,
    context,
  };
}

function createFlatPayload(type: RunEventType, record: Record<string, unknown>): Record<string, unknown> | null {
  // #103 deletion condition:
  // Current flat runtime event support is a centralized compatibility adapter until runtime output
  // moves to the unified SSE envelope. Flat compatibility must stay inside RunEventBoundary and
  // must not leak into service, store, reducer, or component code. After #103 switches runtime
  // output to unified envelope, this adapter should be narrowed or removed.
  if (type === 'run_started') {
    const run = readRecord(record.run);
    return run ? { run } : null;
  }

  if (type === 'run_reused') {
    return {
      duplicate: record.duplicate,
      reused: record.reused,
      reason: record.reason,
      status: record.status,
      reusedRun: record.reusedRun,
      existingRun: record.existingRun,
    };
  }

  if (type === 'step_started') {
    return {
      step: {
        stepId: record.stepId,
        title: record.title,
        description: record.description,
        startedAt: record.startedAt,
      },
    };
  }

  if (type === 'step_completed') {
    return {
      stepDelta: {
        stepId: record.stepId,
        completedAt: record.completedAt,
        elapsedMs: record.elapsedMs,
      },
    };
  }

  if (type === 'step_failed') {
    return {
      stepDelta: {
        stepId: record.stepId,
        errorMessage: record.errorMessage,
        completedAt: record.completedAt,
        elapsedMs: record.elapsedMs,
      },
    };
  }

  if (type === 'tool_started') {
    const toolInvocation = readRecord(record.tool);
    return toolInvocation ? { toolInvocation } : null;
  }

  if (type === 'tool_completed') {
    return {
      toolDelta: {
        toolId: record.toolId,
        outputSummary: record.outputSummary,
        completedAt: record.completedAt,
        elapsedMs: record.elapsedMs,
      },
    };
  }

  if (type === 'tool_failed') {
    return {
      toolDelta: {
        toolId: record.toolId,
        errorMessage: record.errorMessage,
        completedAt: record.completedAt,
        elapsedMs: record.elapsedMs,
      },
    };
  }

  if (type === 'chart_ready') {
    return { chartData: record.chartData };
  }

  if (type === 'conclusion_delta') {
    return { delta: record.delta };
  }

  if (type === 'conclusion_completed') {
    return {
      conclusion: record.conclusion,
      agentConclusion: record.agentConclusion,
      modelTrace: record.modelTrace,
    };
  }

  if (type === 'rag_sources_ready') {
    return { sources: record.sources };
  }

  if (type === 'report_pending') {
    return { metadata: readRecord(record.metadata) ?? {} };
  }

  if (type === 'run_completed') {
    return {
      completedAt: record.completedAt,
      elapsedMs: record.elapsedMs,
      modelTrace: record.modelTrace,
      metadata: record.metadata,
    };
  }

  if (type === 'run_failed') {
    return {
      errorMessage: record.errorMessage,
      modelTrace: record.modelTrace,
      metadata: record.metadata,
    };
  }

  return {};
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

function normalizeRunStarted(source: RunEventPayloadSource): RunStartedEvent | null {
  const runRecord = readPayloadRecord(source, 'run');

  if (!runRecord) {
    return null;
  }

  const clientRunId = readClientRunId(source, runRecord);
  const eventRunId = readEventString(source, 'runId');
  const payloadRunId = readString(runRecord.id);
  const runId = resolveRunStartedRunId({
    eventRunId,
    payloadRunId,
    clientRunId,
    source,
  });
  const conversationId = readEventString(source, 'conversationId') ?? readString(runRecord.conversationId);

  if (!runId || !conversationId) {
    return null;
  }

  const run = readStartedPayload(runRecord, runId, clientRunId);
  const timestamp = readEventString(source, 'timestamp');

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

function normalizeRunReused(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const reusedRecord = readRecord(source.payload.reusedRun) ?? readRecord(source.payload.existingRun);

  if (!identity) {
    return null;
  }

  const status = mapRunStatus(source.payload.status);
  const existingStatus = reusedRecord ? mapRunStatus(reusedRecord.status) : undefined;
  const conclusionSource = reusedRecord ? readConclusionSource(reusedRecord.conclusionSource) : undefined;
  const reportState = reusedRecord ? readReportState(reusedRecord.reportState) : undefined;
  const completedAt = reusedRecord ? readString(reusedRecord.completedAt) : null;

  return {
    type: 'run_reused',
    ...identity,
    ...(source.payload.duplicate === true ? { duplicate: true } : {}),
    ...(source.payload.reused === true ? { reused: true } : {}),
    ...(readString(source.payload.reason) ? { reason: readString(source.payload.reason) as string } : {}),
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

function normalizeStepStarted(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const step = readPayloadRecord(source, 'step');
  const stepId = step ? readString(step.stepId) : null;
  const title = step ? readString(step.title) : null;
  const startedAt = step ? readString(step.startedAt) : null;
  const description = step ? readString(step.description) : null;

  if (!identity || !stepId || !title || !startedAt) {
    return null;
  }

  return {
    type: 'step_started',
    ...identity,
    stepId,
    title,
    ...(description ? { description } : {}),
    startedAt,
  };
}

function normalizeStepCompleted(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const step = readPayloadRecord(source, 'stepDelta');
  const stepId = step ? readString(step.stepId) : null;
  const completedAt = step ? readString(step.completedAt) : null;
  const elapsedMs = step ? readNumber(step.elapsedMs) : undefined;

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

function normalizeStepFailed(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const step = readPayloadRecord(source, 'stepDelta');
  const stepId = step ? readString(step.stepId) : null;
  const errorMessage = step ? readString(step.errorMessage) : null;
  const completedAt = step ? readString(step.completedAt) : null;
  const elapsedMs = step ? readNumber(step.elapsedMs) : undefined;

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

function normalizeToolStarted(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const tool = readPayloadRecord(source, 'toolInvocation');

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

function normalizeToolCompleted(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const tool = readPayloadRecord(source, 'toolDelta');
  const toolId = tool ? readString(tool.toolId) : null;
  const outputSummary = tool ? readString(tool.outputSummary) : null;
  const completedAt = tool ? readString(tool.completedAt) : null;
  const elapsedMs = tool ? readNumber(tool.elapsedMs) : undefined;

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

function normalizeToolFailed(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const tool = readPayloadRecord(source, 'toolDelta');
  const toolId = tool ? readString(tool.toolId) : null;
  const errorMessage = tool ? readString(tool.errorMessage) : null;
  const completedAt = tool ? readString(tool.completedAt) : null;
  const elapsedMs = tool ? readNumber(tool.elapsedMs) : undefined;

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

function normalizeChartReady(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const chartData = source.payload.chartData;

  if (!identity || !chartData) {
    return null;
  }

  return {
    type: 'chart_ready',
    ...identity,
    chartData: chartData as NonNullable<RunStartedPayload['chartData']>,
  };
}

function normalizeConclusionDelta(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const delta = readString(source.payload.delta);

  if (!identity || delta === null) {
    return null;
  }

  return {
    type: 'conclusion_delta',
    ...identity,
    delta,
  };
}

function normalizeConclusionCompleted(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const conclusion = readString(source.payload.conclusion);

  if (!identity || conclusion === null) {
    return null;
  }

  return {
    type: 'conclusion_completed',
    ...identity,
    conclusion,
    ...(source.payload.agentConclusion ? { agentConclusion: source.payload.agentConclusion as RunStartedPayload['agentConclusion'] } : {}),
    ...(source.payload.modelTrace ? { modelTrace: source.payload.modelTrace as RunStartedPayload['modelTrace'] } : {}),
  };
}

function normalizeRagSourcesReady(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);
  const sources = source.payload.sources;

  if (!identity || !Array.isArray(sources)) {
    return null;
  }

  return {
    type: 'rag_sources_ready',
    ...identity,
    sources: sources as RunSource[],
  };
}

function normalizeReportPending(source: RunEventPayloadSource): NormalizedRunEvent | null {
  const identity = createIdentity(source);

  if (!identity) {
    return null;
  }

  return {
    type: 'report_pending',
    ...identity,
  };
}

function normalizeRunCompleted(source: RunEventPayloadSource): RunCompletedEvent | null {
  const identity = createIdentity(source);
  const completedAt = readString(source.payload.completedAt);
  const elapsedMs = readNumber(source.payload.elapsedMs);

  if (!identity || !completedAt) {
    return null;
  }

  return {
    type: 'run_completed',
    ...identity,
    completedAt,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(source.payload.modelTrace ? { modelTrace: source.payload.modelTrace as RunStartedPayload['modelTrace'] } : {}),
  };
}

function normalizeRunFailed(source: RunEventPayloadSource): RunFailedEvent | null {
  const identity = createIdentity(source);
  const errorMessage = readString(source.payload.errorMessage);

  if (!identity || !errorMessage) {
    return null;
  }

  return {
    type: 'run_failed',
    ...identity,
    errorMessage,
    ...(source.payload.modelTrace ? { modelTrace: source.payload.modelTrace as RunStartedPayload['modelTrace'] } : {}),
  };
}

function normalizeRunStopped(source: RunEventPayloadSource): RunStoppedEvent | null {
  if (source.context.source !== 'local') {
    return null;
  }

  const identity = createIdentity(source);

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

  const source = createRunEventSource(record, type, context);

  if (!source) {
    return null;
  }

  if (source.type === 'run_started') return normalizeRunStarted(source);
  if (source.type === 'run_reused') return normalizeRunReused(source);
  if (source.type === 'step_started') return normalizeStepStarted(source);
  if (source.type === 'step_completed') return normalizeStepCompleted(source);
  if (source.type === 'step_failed') return normalizeStepFailed(source);
  if (source.type === 'tool_started') return normalizeToolStarted(source);
  if (source.type === 'tool_completed') return normalizeToolCompleted(source);
  if (source.type === 'tool_failed') return normalizeToolFailed(source);
  if (source.type === 'chart_ready') return normalizeChartReady(source);
  if (source.type === 'conclusion_delta') return normalizeConclusionDelta(source);
  if (source.type === 'conclusion_completed') return normalizeConclusionCompleted(source);
  if (source.type === 'rag_sources_ready') return normalizeRagSourcesReady(source);
  if (source.type === 'report_pending') return normalizeReportPending(source);
  if (source.type === 'run_completed') return normalizeRunCompleted(source);
  if (source.type === 'run_failed') return normalizeRunFailed(source);

  return normalizeRunStopped(source);
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
