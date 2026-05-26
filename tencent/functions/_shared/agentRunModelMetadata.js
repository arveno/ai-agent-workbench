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
  'usage',
  'costEstimate',
  'fallbackReason',
  'modelErrorType',
  'modelHttpStatus',
  'modelErrorMessage',
  'conclusionSource',
  'modelTrace',
];

function createAgentRunModelMetadata(runMetadata, fallbackConclusionSource) {
  const metadata = isRecord(runMetadata) ? runMetadata : {};
  const trace = isRecord(metadata.modelTrace) ? metadata.modelTrace : null;
  const fallbackSource = normalizeConclusionSource(fallbackConclusionSource);

  if (!trace) {
    return fallbackSource ? { conclusionSource: fallbackSource } : {};
  }

  const conclusionSource = normalizeConclusionSource(trace.conclusionSource) || fallbackSource;
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
    modelTrace.modelErrorMessage,
  );

  if (!hasModelMetadata && !conclusionSource) {
    return {};
  }

  return {
    modelTrace,
  };
}

function removeAgentRunModelMetadataFields(metadata) {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {};

  for (const field of MODEL_METADATA_FIELDS) {
    delete nextMetadata[field];
  }

  for (const field of Object.keys(nextMetadata)) {
    if (field.toLowerCase() === 'tokenusage') {
      delete nextMetadata[field];
    }
  }

  return nextMetadata;
}

module.exports = {
  createAgentRunModelMetadata,
  removeAgentRunModelMetadataFields,
};
