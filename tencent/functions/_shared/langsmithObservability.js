const { randomUUID } = require('node:crypto');

const DEFAULT_PROJECT_NAME = 'ai-agent-workbench';
const TRACE_RUN_NAME = 'workbench_agent_run';
const EVALUATION_DATASET_NAME = 'ai-agent-workbench-eval-cases';
const EVALUATION_EXPERIMENT_NAME = 'workbench-evaluation';
const EVALUATION_FEEDBACK_KEY = 'workbench_evaluation_verdict';
const DEFAULT_LANGSMITH_TIMEOUT_MS = 3000;
const MAX_LANGSMITH_TIMEOUT_MS = 30000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnv(keys) {
  for (const key of keys) {
    const value = process.env[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function isExplicitFalse(value) {
  return ['0', 'false', 'off', 'no'].includes(String(value || '').trim().toLowerCase());
}

function truncate(value, maxLength = 500) {
  const stringValue = typeof value === 'string' ? value : String(value || '');
  return stringValue.length > maxLength ? stringValue.slice(0, maxLength) : stringValue;
}

function readLangSmithTimeoutMs() {
  const parsed = Number(process.env.LANGSMITH_TIMEOUT_MS);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LANGSMITH_TIMEOUT_MS;
  }

  return Math.min(parsed, MAX_LANGSMITH_TIMEOUT_MS);
}

function createTimeoutError(reason, timeoutMs) {
  const error = new Error(`LangSmith request timed out after ${timeoutMs}ms.`);
  error.name = 'LangSmithTimeoutError';
  error.code = reason;
  error.timeoutMs = timeoutMs;
  return error;
}

async function withLangSmithTimeout(operation, timeoutReason) {
  const timeoutMs = readLangSmithTimeoutMs();
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createTimeoutError(timeoutReason, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getFailureReason(error, fallbackReason) {
  return typeof error?.code === 'string' && error.code.endsWith('_timeout') ? error.code : fallbackReason;
}

function normalizeError(error, fallbackType = 'langsmith_request_failed') {
  return {
    errorType: String(error?.code || error?.name || fallbackType),
    errorMessage: truncate(error?.message || error || fallbackType),
    timeoutMs: Number.isInteger(error?.timeoutMs) ? error.timeoutMs : null,
  };
}

function getLangSmithConfig() {
  const apiKey = readEnv(['LANGSMITH_API_KEY', 'LANGCHAIN_API_KEY']);
  const disabledByFlag =
    isExplicitFalse(process.env.LANGSMITH_TRACING) ||
    isExplicitFalse(process.env.LANGCHAIN_TRACING_V2) ||
    isExplicitFalse(process.env.LANGCHAIN_TRACING);

  if (disabledByFlag) {
    return {
      isConfigured: false,
      status: 'not_configured',
      reason: 'tracing_disabled',
      projectName: readEnv(['LANGSMITH_PROJECT', 'LANGCHAIN_PROJECT']) || DEFAULT_PROJECT_NAME,
    };
  }

  if (!apiKey) {
    return {
      isConfigured: false,
      status: 'not_configured',
      reason: 'missing_api_key',
      projectName: readEnv(['LANGSMITH_PROJECT', 'LANGCHAIN_PROJECT']) || DEFAULT_PROJECT_NAME,
    };
  }

  return {
    isConfigured: true,
    status: 'configured',
    projectName: readEnv(['LANGSMITH_PROJECT', 'LANGCHAIN_PROJECT']) || DEFAULT_PROJECT_NAME,
  };
}

function loadLangChainTracer() {
  try {
    const { LangChainTracer } = require('@langchain/core/tracers/tracer_langchain');
    return LangChainTracer;
  } catch (error) {
    throw Object.assign(new Error('LangSmith SDK is not available in this function package.'), {
      cause: error,
      code: 'langsmith_sdk_unavailable',
    });
  }
}

function createLangSmithClient(projectName) {
  const LangChainTracer = loadLangChainTracer();
  const tracer = new LangChainTracer({ projectName });
  return tracer.client;
}

function createExternalReference(params) {
  return {
    workbenchRunId: params.runId || null,
    conversationId: params.conversationId || null,
    clientRunId: params.clientRunId || null,
    selectedModelId: params.selectedModelId || null,
    langGraphThreadId: params.langGraphThreadId || null,
  };
}

function createLangSmithTraceState(params) {
  const config = getLangSmithConfig();

  return {
    provider: 'langsmith',
    status: config.status,
    reason: config.reason || null,
    projectName: config.projectName,
    traceId: null,
    runId: null,
    runName: TRACE_RUN_NAME,
    startedAt: null,
    completedAt: null,
    errorType: null,
    errorMessage: null,
    externalReference: createExternalReference(params || {}),
  };
}

function toPublicLangSmithTrace(traceState) {
  const state = isRecord(traceState) ? traceState : createLangSmithTraceState({});

  return {
    provider: 'langsmith',
    status: state.status || 'not_configured',
    reason: state.reason || null,
    projectName: state.projectName || DEFAULT_PROJECT_NAME,
    traceId: state.traceId || null,
    runId: state.runId || null,
    runName: state.runName || TRACE_RUN_NAME,
    startedAt: state.startedAt || null,
    completedAt: state.completedAt || null,
    errorType: state.errorType || null,
    errorMessage: state.errorMessage || null,
    timeoutMs: Number.isInteger(state.timeoutMs) ? state.timeoutMs : null,
    externalReference: isRecord(state.externalReference) ? state.externalReference : {},
  };
}

function createTraceMetadata(traceState, metadata = {}) {
  return {
    source: 'ai-agent-workbench',
    observabilityProvider: 'langsmith',
    workbenchRunId: traceState.externalReference?.workbenchRunId || null,
    conversationId: traceState.externalReference?.conversationId || null,
    clientRunId: traceState.externalReference?.clientRunId || null,
    selectedModelId: traceState.externalReference?.selectedModelId || null,
    langGraphThreadId: traceState.externalReference?.langGraphThreadId || null,
    ...metadata,
  };
}

async function startLangSmithTrace(traceState, params = {}) {
  const config = getLangSmithConfig();
  const baseState = isRecord(traceState) ? traceState : createLangSmithTraceState(params.externalReference || {});

  if (!config.isConfigured) {
    return {
      ...baseState,
      status: config.status,
      reason: config.reason || 'not_configured',
      projectName: config.projectName,
    };
  }

  const runId = randomUUID();
  const startedAt = params.startedAt || new Date().toISOString();

  try {
    const client = createLangSmithClient(config.projectName);
    await withLangSmithTimeout(() => client.createRun({
      id: runId,
      name: params.runName || TRACE_RUN_NAME,
      run_type: 'chain',
      project_name: config.projectName,
      inputs: {
        prompt: params.prompt || '',
      },
      start_time: new Date(startedAt),
      extra: {
        metadata: createTraceMetadata(baseState, params.metadata),
      },
      tags: Array.isArray(params.tags) ? params.tags : ['agent-run', 'langgraph'],
    }), 'trace_start_timeout');

    return {
      ...baseState,
      status: 'started',
      reason: null,
      projectName: config.projectName,
      traceId: runId,
      runId,
      startedAt,
      errorType: null,
      errorMessage: null,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      ...baseState,
      status: 'failed',
      reason: getFailureReason(error, 'trace_start_failed'),
      projectName: config.projectName,
      traceId: null,
      runId: null,
      startedAt,
      ...normalized,
    };
  }
}

async function completeLangSmithTrace(traceState, params = {}) {
  const baseState = isRecord(traceState) ? traceState : createLangSmithTraceState({});

  if (baseState.status !== 'started' || !baseState.runId) {
    return baseState;
  }

  const completedAt = params.completedAt || new Date().toISOString();

  try {
    const client = createLangSmithClient(baseState.projectName || DEFAULT_PROJECT_NAME);
    await withLangSmithTimeout(() => client.updateRun(baseState.runId, {
      outputs: params.outputs || {},
      end_time: new Date(completedAt),
      extra: {
        metadata: createTraceMetadata(baseState, params.metadata),
      },
    }), 'trace_update_timeout');

    return {
      ...baseState,
      status: 'completed',
      completedAt,
      errorType: null,
      errorMessage: null,
    };
  } catch (error) {
    const normalized = normalizeError(error, 'langsmith_trace_update_failed');
    return {
      ...baseState,
      status: 'failed',
      reason: getFailureReason(error, 'trace_update_failed'),
      completedAt,
      ...normalized,
    };
  }
}

async function failLangSmithTrace(traceState, params = {}) {
  const baseState = isRecord(traceState) ? traceState : createLangSmithTraceState({});

  if (baseState.status !== 'started' || !baseState.runId) {
    return baseState;
  }

  const completedAt = params.completedAt || new Date().toISOString();
  const failure = normalizeError(params.error, 'agent_run_failed');

  try {
    const client = createLangSmithClient(baseState.projectName || DEFAULT_PROJECT_NAME);
    await withLangSmithTimeout(() => client.updateRun(baseState.runId, {
      error: failure.errorMessage,
      end_time: new Date(completedAt),
      outputs: params.outputs || {},
      extra: {
        metadata: createTraceMetadata(baseState, {
          ...params.metadata,
          errorType: failure.errorType,
          errorMessage: failure.errorMessage,
        }),
      },
    }), 'trace_update_timeout');

    return {
      ...baseState,
      status: 'failed',
      reason: 'agent_run_failed',
      completedAt,
      ...failure,
    };
  } catch (error) {
    const normalized = normalizeError(error, 'langsmith_trace_error_update_failed');
    return {
      ...baseState,
      status: 'failed',
      reason: getFailureReason(error, 'trace_error_update_failed'),
      completedAt,
      ...normalized,
    };
  }
}

function extractLangSmithTraceFromMetadata(metadata) {
  const source = isRecord(metadata) ? metadata : {};
  const nested = isRecord(source.langSmithTrace) ? source.langSmithTrace : {};

  return {
    traceId: source.langSmithTraceId || nested.traceId || null,
    runId: source.langSmithRunId || nested.runId || null,
    status: source.langSmithTraceStatus || nested.status || null,
    projectName: source.langSmithProjectName || nested.projectName || DEFAULT_PROJECT_NAME,
  };
}

function scoreVerdict(verdict) {
  if (verdict === 'pass') return 1;
  if (verdict === 'fail') return 0;
  return undefined;
}

function createEvaluationMetadata(params = {}) {
  return {
    provider: 'langsmith',
    status: params.status || 'not_configured',
    reason: params.reason || null,
    datasetName: params.datasetName || EVALUATION_DATASET_NAME,
    experimentName: params.experimentName || EVALUATION_EXPERIMENT_NAME,
    feedbackKey: params.feedbackKey || EVALUATION_FEEDBACK_KEY,
    feedbackId: params.feedbackId || null,
    langSmithTraceId: params.langSmithTraceId || null,
    langSmithRunId: params.langSmithRunId || null,
    projectName: params.projectName || DEFAULT_PROJECT_NAME,
    errorType: params.errorType || null,
    errorMessage: params.errorMessage || null,
    timeoutMs: Number.isInteger(params.timeoutMs) ? params.timeoutMs : null,
    externalReference: {
      workbenchEvaluationId: params.evaluationId || null,
      workbenchRunId: params.runId || null,
      conversationId: params.conversationId || null,
      evalCaseId: params.caseId || null,
    },
  };
}

async function submitLangSmithEvaluationFeedback(params = {}) {
  const config = getLangSmithConfig();
  const trace = isRecord(params.langSmithTrace) ? params.langSmithTrace : {};

  if (!config.isConfigured) {
    return createEvaluationMetadata({
      ...params,
      status: 'not_configured',
      reason: config.reason || 'missing_api_key',
      projectName: config.projectName,
      langSmithTraceId: trace.traceId || null,
      langSmithRunId: trace.runId || null,
    });
  }

  if (!trace.runId) {
    return createEvaluationMetadata({
      ...params,
      status: 'not_linked',
      reason: 'missing_langsmith_run_id',
      projectName: config.projectName,
      langSmithTraceId: trace.traceId || null,
      langSmithRunId: null,
    });
  }

  try {
    const client = createLangSmithClient(config.projectName);
    const feedback = await withLangSmithTimeout(() => client.createFeedback(trace.runId, EVALUATION_FEEDBACK_KEY, {
      score: scoreVerdict(params.verdict),
      value: params.verdict || 'unknown',
      comment: [params.badCaseReason, params.humanNote].filter(Boolean).join('\n\n') || undefined,
      sourceInfo: {
        provider: 'ai-agent-workbench',
        datasetName: EVALUATION_DATASET_NAME,
        experimentName: EVALUATION_EXPERIMENT_NAME,
        workbenchEvaluationId: params.evaluationId || null,
        workbenchRunId: params.runId || null,
        evalCaseId: params.caseId || null,
      },
    }), 'feedback_timeout');

    return createEvaluationMetadata({
      ...params,
      status: 'submitted',
      projectName: config.projectName,
      feedbackId: feedback.id || null,
      langSmithTraceId: trace.traceId || null,
      langSmithRunId: trace.runId || null,
    });
  } catch (error) {
    const normalized = normalizeError(error, 'langsmith_feedback_failed');
    return createEvaluationMetadata({
      ...params,
      status: 'failed',
      reason: getFailureReason(error, 'feedback_failed'),
      projectName: config.projectName,
      langSmithTraceId: trace.traceId || null,
      langSmithRunId: trace.runId || null,
      ...normalized,
    });
  }
}

module.exports = {
  createLangSmithTraceState,
  completeLangSmithTrace,
  extractLangSmithTraceFromMetadata,
  failLangSmithTrace,
  startLangSmithTrace,
  submitLangSmithEvaluationFeedback,
  toPublicLangSmithTrace,
};
