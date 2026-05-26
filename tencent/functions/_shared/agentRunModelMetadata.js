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

const MODEL_METADATA_FIELDS = [
  'selectedModelId',
  'provider',
  'model',
  'latencyMs',
  'tokenUsage',
  'usage',
  'costEstimate',
  'fallbackReason',
  'modelErrorType',
  'conclusionSource',
  'modelTrace',
];

function createAgentRunModelMetadata(runMetadata, fallbackConclusionSource) {
  const metadata = isRecord(runMetadata) ? runMetadata : {};
  const trace = isRecord(metadata.modelTrace) ? metadata.modelTrace : null;

  if (!trace) {
    return {};
  }

  const modelTrace = {
    selectedModelId: normalizeTraceString(trace.selectedModelId),
    provider: normalizeTraceString(trace.provider),
    model: normalizeTraceString(trace.model),
    latencyMs: normalizeTraceNumber(trace.latencyMs),
    tokenUsage: readTraceObject(trace.tokenUsage),
    usage: readTraceObject(trace.usage),
    costEstimate: readTraceObject(trace.costEstimate),
    fallbackReason: normalizeTraceString(trace.fallbackReason),
    modelErrorType: normalizeTraceString(trace.modelErrorType),
    conclusionSource: normalizeConclusionSource(trace.conclusionSource) ||
      normalizeConclusionSource(fallbackConclusionSource) ||
      'none',
  };
  const hasModelMetadata = Boolean(
    modelTrace.selectedModelId ||
    modelTrace.provider ||
    modelTrace.model ||
    modelTrace.latencyMs !== null ||
    modelTrace.tokenUsage ||
    modelTrace.usage ||
    modelTrace.costEstimate ||
    modelTrace.fallbackReason ||
    modelTrace.modelErrorType,
  );

  if (!hasModelMetadata) {
    return {};
  }

  return {
    selectedModelId: modelTrace.selectedModelId,
    provider: modelTrace.provider,
    model: modelTrace.model,
    latencyMs: modelTrace.latencyMs,
    tokenUsage: modelTrace.tokenUsage,
    usage: modelTrace.usage,
    costEstimate: modelTrace.costEstimate,
    fallbackReason: modelTrace.fallbackReason,
    modelErrorType: modelTrace.modelErrorType,
    conclusionSource: modelTrace.conclusionSource,
    modelTrace,
  };
}

function removeAgentRunModelMetadataFields(metadata) {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {};

  for (const field of MODEL_METADATA_FIELDS) {
    delete nextMetadata[field];
  }

  return nextMetadata;
}

module.exports = {
  createAgentRunModelMetadata,
  removeAgentRunModelMetadataFields,
};
