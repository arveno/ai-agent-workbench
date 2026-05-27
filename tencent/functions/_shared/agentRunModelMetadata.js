function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTraceString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTraceNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeConclusionSource(value) {
  const source = normalizeTraceString(value);
  return source === 'model' || source === 'fallback' || source === 'mock' || source === 'none' ? source : null;
}

function readTraceObject(value) {
  return isRecord(value) ? { ...value } : null;
}

const REPORT_METADATA_ALLOWLIST = {
  source: readMetadataString,
  runId: readMetadataString,
  reportState: readMetadataString,
  toolNames: readMetadataStringArray,
};

const EVALUATION_METADATA_ALLOWLIST = {
  evaluatorVersion: readMetadataString,
};

function readMetadataString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readMetadataStringArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());

  return values.length > 0 ? values : undefined;
}

function createAllowlistedMetadata(metadata, allowlist) {
  const source = isRecord(metadata) ? metadata : {};
  const nextMetadata = {};

  for (const [field, readValue] of Object.entries(allowlist)) {
    const value = readValue(source[field]);

    if (value !== undefined) {
      nextMetadata[field] = value;
    }
  }

  return nextMetadata;
}

function createReportRequestMetadata(metadata) {
  return createAllowlistedMetadata(metadata, REPORT_METADATA_ALLOWLIST);
}

function createEvaluationRequestMetadata(metadata) {
  return createAllowlistedMetadata(metadata, EVALUATION_METADATA_ALLOWLIST);
}

function createAgentRunModelMetadata(runMetadata) {
  const metadata = isRecord(runMetadata) ? runMetadata : {};
  const trace = isRecord(metadata.modelTrace) ? metadata.modelTrace : null;

  if (!trace) {
    return {};
  }

  const conclusionSource = normalizeConclusionSource(trace.conclusionSource) || 'none';
  const modelTrace = {
    selectedModelId: normalizeTraceString(trace.selectedModelId),
    provider: normalizeTraceString(trace.provider),
    model: normalizeTraceString(trace.model),
    latencyMs: normalizeTraceNumber(trace.latencyMs),
    usage: readTraceObject(trace.usage),
    costEstimate: readTraceObject(trace.costEstimate),
    fallbackReason: normalizeTraceString(trace.fallbackReason),
    modelErrorType: normalizeTraceString(trace.modelErrorType),
    modelHttpStatus: normalizeTraceNumber(trace.modelHttpStatus),
    modelErrorMessage: normalizeTraceString(trace.modelErrorMessage),
    conclusionSource,
  };
  const hasModelMetadata = Boolean(
    modelTrace.selectedModelId ||
    modelTrace.provider ||
    modelTrace.model ||
    modelTrace.latencyMs !== null ||
    modelTrace.usage ||
    modelTrace.costEstimate ||
    modelTrace.fallbackReason ||
    modelTrace.modelErrorType ||
    modelTrace.modelHttpStatus !== null ||
    modelTrace.modelErrorMessage ||
    modelTrace.conclusionSource !== 'none',
  );

  if (!hasModelMetadata) {
    return {};
  }

  return {
    modelTrace,
  };
}

module.exports = {
  createAgentRunModelMetadata,
  createEvaluationRequestMetadata,
  createReportRequestMetadata,
  EVALUATION_METADATA_ALLOWLIST,
  REPORT_METADATA_ALLOWLIST,
};
