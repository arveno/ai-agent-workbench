const { existsSync, readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

function requireCommonJsFile(filePath) {
  const loadedModule = new Module(filePath, module);
  loadedModule.filename = filePath;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  loadedModule._compile(readFileSync(filePath, 'utf8'), filePath);
  return loadedModule.exports;
}

function loadSharedModule(name) {
  const bundledSharedPath = path.join(__dirname, '_shared', `${name}.js`);

  if (existsSync(bundledSharedPath)) {
    return require(`./_shared/${name}`);
  }

  return requireCommonJsFile(path.join(__dirname, '..', '_shared', `${name}.js`));
}

const { createEvaluationRequestMetadata } = loadSharedModule('agentRunModelMetadata');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDateTime(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return '';
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value);
  return stringValue ? stringValue : null;
}

function createPayloadMetadata(payloadMetadata) {
  return createEvaluationRequestMetadata(payloadMetadata);
}

function createEvaluationMetadata(payloadMetadata, runModelMetadata, langSmithEvaluation, options = {}) {
  const metadata = createPayloadMetadata(payloadMetadata);
  const runId = toNullableString(options.runId);

  if (!runId) {
    throw new Error('Evaluation metadata requires canonical runId.');
  }

  if (
    isRecord(langSmithEvaluation) &&
    typeof langSmithEvaluation.langSmithTraceId === 'string' &&
    langSmithEvaluation.langSmithTraceId.trim()
  ) {
    metadata.langSmithTraceId = langSmithEvaluation.langSmithTraceId.trim();
  }

  return {
    ...metadata,
    ...(isRecord(runModelMetadata) ? runModelMetadata : {}),
    runId,
    source: 'workbench-evaluation',
    resultVersion: 1,
    langSmithEvaluation,
  };
}

function readPersistedResultVersion(value) {
  const resultVersion = Number(value);
  return Number.isFinite(resultVersion) && resultVersion > 0 ? resultVersion : 1;
}

function readPersistedEvaluationMetadata(row) {
  const runId = toNullableString(row.run_id);

  if (!runId || !UUID_PATTERN.test(runId)) {
    throw new Error('Persisted evaluation result is missing canonical runId.');
  }

  const storedMetadata = parseJsonObject(row.metadata);
  const requestMetadata = createPayloadMetadata(storedMetadata);
  const metadata = {
    ...requestMetadata,
    runId,
    source: 'workbench-evaluation',
    resultVersion: readPersistedResultVersion(storedMetadata.resultVersion),
  };
  const modelTrace = parseJsonObject(row.model_trace);

  if (Object.keys(modelTrace).length > 0) {
    metadata.modelTrace = modelTrace;
  }

  if (typeof storedMetadata.langSmithTraceId === 'string' && storedMetadata.langSmithTraceId.trim()) {
    metadata.langSmithTraceId = storedMetadata.langSmithTraceId.trim();
  } else if (storedMetadata.langSmithTraceId === null) {
    metadata.langSmithTraceId = null;
  }

  if (isRecord(storedMetadata.langSmithEvaluation)) {
    metadata.langSmithEvaluation = storedMetadata.langSmithEvaluation;
  }

  return metadata;
}

function mapResult(row) {
  return {
    id: String(row.id ?? ''),
    caseId: String(row.case_id ?? ''),
    conversationId: toNullableString(row.conversation_id),
    runId: toNullableString(row.run_id),
    verdict: String(row.verdict ?? 'unknown'),
    badCaseReason: toNullableString(row.bad_case_reason),
    humanNote: toNullableString(row.human_note),
    actualSummary: parseJsonObject(row.actual_summary),
    modelTrace: parseJsonObject(row.model_trace),
    toolSummary: parseJsonArray(row.tool_summary),
    ragSummary: parseJsonObject(row.rag_summary),
    reportSummary: parseJsonObject(row.report_summary),
    metadata: readPersistedEvaluationMetadata(row),
    createdAt: normalizeDateTime(row.created_at),
    updatedAt: normalizeDateTime(row.updated_at),
  };
}

module.exports = {
  createEvaluationMetadata,
  createEvaluationRequestMetadata,
  mapResult,
  readPersistedEvaluationMetadata,
};
