const { ChatOpenAI } = require('@langchain/openai');

const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_QWEN_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
const DEFAULT_SILICONFLOW_GLM_MODEL = 'THUDM/GLM-4-9B-0414';
const DEFAULT_ZHIPU_GLM_FLASH_MODEL = 'glm-4-flash-250414';
const DEFAULT_LANGCHAIN_MODEL_ID = 'siliconflow-qwen-free';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 600;
const MAX_ERROR_MESSAGE_LENGTH = 300;

class LangChainModelLayerError extends Error {
  constructor(errorType, message, options = {}) {
    super(message || errorType);
    this.name = 'LangChainModelLayerError';
    this.errorType = errorType;
    this.httpStatus = Number.isInteger(options.httpStatus) ? options.httpStatus : null;
    this.selectedModelId = options.selectedModelId || null;
    this.provider = options.provider || null;
    this.model = options.model || null;
    this.billingType = options.billingType || null;
    this.hasApiKey = Boolean(options.hasApiKey);
    this.apiKeyLength = Number.isInteger(options.apiKeyLength) ? options.apiKeyLength : 0;
    this.latencyMs = Number.isInteger(options.latencyMs) ? options.latencyMs : null;
  }
}

function readEnv(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : '';
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeTimeoutMs(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : fallback;
}

function getSharedTimeoutMs(fallback = DEFAULT_TIMEOUT_MS) {
  return normalizeTimeoutMs(readEnv('MODEL_GATEWAY_TIMEOUT_MS'), fallback);
}

function createModelCatalog() {
  const siliconflowBaseUrl = stripTrailingSlash(readEnv('SILICONFLOW_BASE_URL') || DEFAULT_SILICONFLOW_BASE_URL);
  const zhipuBaseUrl = stripTrailingSlash(readEnv('ZHIPU_BASE_URL') || DEFAULT_ZHIPU_BASE_URL);

  return {
    'siliconflow-qwen-free': {
      id: 'siliconflow-qwen-free',
      provider: 'siliconflow',
      displayName: 'SiliconFlow Qwen Free',
      apiKeyEnv: 'SILICONFLOW_API_KEY',
      baseUrl: siliconflowBaseUrl,
      model: readEnv('SILICONFLOW_MODEL_QWEN') || DEFAULT_QWEN_MODEL,
      timeoutMs: getSharedTimeoutMs(DEFAULT_TIMEOUT_MS),
      supportsStreamUsage: false,
      enabled: true,
      billingType: 'free',
    },
    'siliconflow-glm-free': {
      id: 'siliconflow-glm-free',
      provider: 'siliconflow',
      displayName: 'SiliconFlow GLM Free',
      apiKeyEnv: 'SILICONFLOW_API_KEY',
      baseUrl: siliconflowBaseUrl,
      model: readEnv('SILICONFLOW_MODEL_GLM') || DEFAULT_SILICONFLOW_GLM_MODEL,
      timeoutMs: getSharedTimeoutMs(DEFAULT_TIMEOUT_MS),
      supportsStreamUsage: false,
      enabled: true,
      billingType: 'free',
    },
    'zhipu-glm-flash-free': {
      id: 'zhipu-glm-flash-free',
      provider: 'zhipu',
      displayName: 'Zhipu GLM Flash Free',
      apiKeyEnv: 'ZHIPU_API_KEY',
      baseUrl: zhipuBaseUrl,
      model: readEnv('ZHIPU_MODEL_GLM_FLASH') || DEFAULT_ZHIPU_GLM_FLASH_MODEL,
      timeoutMs: getSharedTimeoutMs(DEFAULT_TIMEOUT_MS),
      supportsStreamUsage: false,
      enabled: true,
      billingType: 'free',
    },
  };
}

function getLangChainModelCatalog() {
  return Object.values(createModelCatalog()).map((item) => ({ ...item }));
}

function normalizeSelectedModelId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_LANGCHAIN_MODEL_ID;
}

function createUnconfiguredConfig(selectedModelId, errorType, message, base = {}) {
  return {
    id: selectedModelId || null,
    selectedModelId: selectedModelId || null,
    provider: base.provider || null,
    displayName: base.displayName || null,
    apiKeyEnv: base.apiKeyEnv || null,
    baseUrl: base.baseUrl || null,
    model: base.model || null,
    timeoutMs: base.timeoutMs || getSharedTimeoutMs(DEFAULT_TIMEOUT_MS),
    supportsStreamUsage: base.supportsStreamUsage === true,
    enabled: base.enabled !== false,
    billingType: base.billingType || 'free',
    hasApiKey: false,
    apiKeyLength: 0,
    isConfigured: false,
    configErrorType: errorType,
    configErrorMessage: message,
  };
}

function getLangChainModelLayerConfig(selectedModelId) {
  const normalizedModelId = normalizeSelectedModelId(selectedModelId);
  const catalog = createModelCatalog();
  const catalogItem = catalog[normalizedModelId];

  if (!catalogItem) {
    return createUnconfiguredConfig(
      normalizedModelId,
      'invalid_model',
      `selectedModelId is not allowed: ${normalizedModelId}`,
    );
  }

  const apiKey = readEnv(catalogItem.apiKeyEnv);
  const baseConfig = {
    ...catalogItem,
    selectedModelId: catalogItem.id,
    apiKey,
    hasApiKey: Boolean(apiKey),
    apiKeyLength: apiKey.length,
  };

  if (!catalogItem.enabled) {
    return {
      ...baseConfig,
      isConfigured: false,
      configErrorType: 'model_disabled',
      configErrorMessage: `Model is disabled: ${catalogItem.id}`,
    };
  }

  if (!apiKey || !catalogItem.baseUrl || !catalogItem.model) {
    return {
      ...baseConfig,
      isConfigured: false,
      configErrorType: 'model_not_configured',
      configErrorMessage: `LangChain model layer env is not configured for ${catalogItem.id}.`,
    };
  }

  return {
    ...baseConfig,
    isConfigured: true,
    configErrorType: null,
    configErrorMessage: null,
  };
}

function getSensitiveValues() {
  return [
    readEnv('SILICONFLOW_API_KEY'),
    readEnv('ZHIPU_API_KEY'),
  ].filter(Boolean);
}

function sanitizeMessage(value) {
  let message = String(value || '');

  for (const sensitiveValue of getSensitiveValues()) {
    message = message.split(sensitiveValue).join('[redacted]');
  }

  return message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password|connection|string)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function createModelLayerError(errorType, message, config, options = {}) {
  return new LangChainModelLayerError(errorType, sanitizeMessage(message || errorType), {
    httpStatus: options.httpStatus,
    selectedModelId: config?.selectedModelId || config?.id || null,
    provider: config?.provider || null,
    model: config?.model || null,
    billingType: config?.billingType || null,
    hasApiKey: Boolean(config?.hasApiKey),
    apiKeyLength: Number(config?.apiKeyLength) || 0,
    latencyMs: options.latencyMs,
  });
}

function readHttpStatus(error) {
  const status = Number(
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.cause?.status ||
    error?.cause?.statusCode,
  );
  return Number.isInteger(status) ? status : null;
}

function classifyModelError(params = {}) {
  const status = Number(params.httpStatus);
  const message = String(params.message || '').toLowerCase();
  const errorName = String(params.errorName || '').toLowerCase();

  if (params.errorType) {
    return params.errorType;
  }

  if (
    errorName === 'aborterror' ||
    errorName.includes('timeout') ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'model_timeout';
  }

  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limited';
  }

  if (
    status === 401 ||
    status === 403 ||
    message.includes('forbidden') ||
    message.includes('unauthorized') ||
    message.includes('permission') ||
    message.includes('not allowed') ||
    message.includes('country') ||
    message.includes('region') ||
    message.includes('territory')
  ) {
    return 'model_forbidden';
  }

  if (
    status === 404 ||
    (
      message.includes('model') &&
      (
        message.includes('not found') ||
        message.includes('does not exist') ||
        message.includes('not exist') ||
        message.includes('unsupported') ||
        message.includes('decommissioned')
      )
    )
  ) {
    return 'invalid_model';
  }

  if (params.parseFailed) {
    return 'provider_bad_response';
  }

  if (
    errorName === 'typeerror' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('etimedout')
  ) {
    return 'provider_error';
  }

  if (status >= 500) {
    return 'provider_error';
  }

  return 'provider_error';
}

function normalizeTemperature(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0.2;
}

function normalizeMaxTokens(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : DEFAULT_MAX_TOKENS;
}

function normalizeUsageNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.trunc(numberValue) : null;
}

function normalizeUsageShape(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const promptTokens = normalizeUsageNumber(
    usage.prompt_tokens ??
    usage.promptTokens ??
    usage.input_tokens ??
    usage.inputTokens,
  );
  const completionTokens = normalizeUsageNumber(
    usage.completion_tokens ??
    usage.completionTokens ??
    usage.output_tokens ??
    usage.outputTokens,
  );
  const totalTokens = normalizeUsageNumber(usage.total_tokens ?? usage.totalTokens);

  if (promptTokens === null && completionTokens === null && totalTokens === null) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

function normalizeUsageUnavailableReason(value, fallback = 'provider_no_usage') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeUsageSource(value, fallback = 'none') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePricingSource(value) {
  if (value === 'catalog' || value === 'model_catalog.billingType') {
    return 'catalog';
  }

  if (value === 'unavailable' || value === 'none') {
    return value;
  }

  return null;
}

function createCanonicalUsage(usageInput, options = {}) {
  const normalized = normalizeUsageShape(usageInput);

  if (!normalized) {
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      usageAvailable: false,
      usageSource: normalizeUsageSource(options.usageSource || usageInput?.usageSource, 'none'),
      usageUnavailableReason: normalizeUsageUnavailableReason(
        options.usageUnavailableReason || usageInput?.usageUnavailableReason,
        'provider_no_usage',
      ),
    };
  }

  const totalTokens = normalized.totalTokens ?? (
    normalized.promptTokens !== null && normalized.completionTokens !== null
      ? normalized.promptTokens + normalized.completionTokens
      : null
  );

  return {
    promptTokens: normalized.promptTokens,
    completionTokens: normalized.completionTokens,
    totalTokens,
    usageAvailable: true,
    usageSource: normalizeUsageSource(options.usageSource || usageInput?.usageSource, 'provider'),
    usageUnavailableReason: null,
  };
}

function normalizeCostEstimate(costEstimate) {
  if (!costEstimate || typeof costEstimate !== 'object') {
    return null;
  }

  const estimatedCost = costEstimate.estimatedCost === null || costEstimate.estimatedCost === undefined
    ? null
    : Number(costEstimate.estimatedCost);

  return {
    estimatedCost: estimatedCost !== null && Number.isFinite(estimatedCost) && estimatedCost >= 0 ? estimatedCost : null,
    currency: typeof costEstimate.currency === 'string' && costEstimate.currency.trim()
      ? costEstimate.currency.trim()
      : null,
    pricingUnit: typeof costEstimate.pricingUnit === 'string' && costEstimate.pricingUnit.trim()
      ? costEstimate.pricingUnit.trim()
      : null,
    isEstimated: costEstimate.isEstimated === true,
    pricingSource: normalizePricingSource(costEstimate.pricingSource),
    costUnavailableReason: typeof costEstimate.costUnavailableReason === 'string' && costEstimate.costUnavailableReason.trim()
      ? costEstimate.costUnavailableReason.trim()
      : null,
  };
}

function createCostEstimate(params = {}) {
  const usage = params.usage || createCanonicalUsage(null, {
    usageSource: params.usageSource,
    usageUnavailableReason: params.usageUnavailableReason,
  });
  const billingType = typeof params.billingType === 'string' ? params.billingType.trim() : '';
  const pricingSource = billingType ? 'catalog' : 'none';
  const usageUnavailableReason = usage?.usageAvailable === false ? usage.usageUnavailableReason : null;
  let costUnavailableReason = 'unknown_pricing';

  if (params.costUnavailableReason) {
    costUnavailableReason = normalizeUsageUnavailableReason(params.costUnavailableReason, 'unknown_pricing');
  } else if (
    usageUnavailableReason &&
    usageUnavailableReason !== 'provider_no_usage'
  ) {
    costUnavailableReason = usageUnavailableReason;
  } else if (billingType === 'free') {
    costUnavailableReason = 'free_pricing';
  } else if (usage?.usageAvailable === false) {
    costUnavailableReason = 'usage_unavailable';
  }

  return {
    estimatedCost: null,
    currency: null,
    pricingUnit: null,
    isEstimated: false,
    pricingSource,
    costUnavailableReason,
  };
}

function createUsageCostMetadata(params = {}) {
  const usage = createCanonicalUsage(params.usage, {
    usageSource: params.usageSource,
    usageUnavailableReason: params.usageUnavailableReason,
  });
  const normalizedCostEstimate = normalizeCostEstimate(params.costEstimate);

  return {
    usage,
    costEstimate: normalizedCostEstimate || createCostEstimate({
      ...params,
      usage,
    }),
  };
}

function getChunkText(chunk) {
  const content = chunk?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .join('');
  }

  return '';
}

function extractProviderRawUsage(chunk) {
  const responseMetadataTokenUsage = chunk?.response_metadata && chunk.response_metadata.tokenUsage;

  return (
    chunk?.usage_metadata ||
    chunk?.response_metadata?.token_usage ||
    responseMetadataTokenUsage ||
    chunk?.additional_kwargs?.usage ||
    null
  );
}

function normalizeProviderUsage(rawUsage) {
  return normalizeUsageShape(rawUsage);
}

function getChunkUsage(chunk) {
  return normalizeProviderUsage(extractProviderRawUsage(chunk));
}

function createChatModel(config, params = {}) {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: {
      baseURL: stripTrailingSlash(config.baseUrl),
    },
    model: config.model,
    temperature: normalizeTemperature(params.temperature),
    maxTokens: normalizeMaxTokens(params.maxTokens),
    timeout: config.timeoutMs,
    streamUsage: config.supportsStreamUsage === true,
  });
}

async function streamLangChainChatCompletion(params = {}) {
  const config = getLangChainModelLayerConfig(params.selectedModelId);

  if (!config.isConfigured) {
    throw createModelLayerError(
      config.configErrorType || 'model_not_configured',
      config.configErrorMessage || 'LangChain model layer is not configured.',
      config,
    );
  }

  const startedAt = Date.now();
  const model = createChatModel(config, params);
  let text = '';
  let providerUsage = null;

  try {
    const stream = await model.stream(params.messages || []);

    for await (const chunk of stream) {
      const delta = getChunkText(chunk);
      const usage = getChunkUsage(chunk);

      if (usage) {
        providerUsage = usage;
      }

      if (delta) {
        text += delta;
        if (typeof params.onDelta === 'function') {
          params.onDelta(delta);
        }
      }
    }
  } catch (error) {
    const httpStatus = readHttpStatus(error);
    throw createModelLayerError(classifyModelError({
      errorName: error && error.name,
      httpStatus,
      message: error && error.message,
    }), error && error.message ? error.message : 'LangChain model layer request failed.', config, {
      httpStatus,
      latencyMs: Math.max(Date.now() - startedAt, 1),
    });
  }

  const latencyMs = Math.max(Date.now() - startedAt, 1);
  const { usage, costEstimate } = createUsageCostMetadata({
    usage: providerUsage,
    billingType: config.billingType,
    usageSource: providerUsage ? 'provider' : 'none',
    usageUnavailableReason: providerUsage ? null : 'provider_no_usage',
  });

  if (!text.trim()) {
    throw createModelLayerError(
      'provider_bad_response',
      'LangChain model layer returned empty text.',
      config,
      { latencyMs },
    );
  }

  return {
    text,
    selectedModelId: config.selectedModelId,
    provider: config.provider,
    model: config.model,
    displayName: config.displayName,
    billingType: config.billingType,
    latencyMs,
    usage,
    costEstimate,
  };
}

function normalizeLangChainModelError(error) {
  if (error instanceof LangChainModelLayerError) {
    return {
      selectedModelId: error.selectedModelId,
      errorType: error.errorType,
      httpStatus: error.httpStatus,
      message: sanitizeMessage(error.message),
      provider: error.provider || null,
      model: error.model || null,
      billingType: error.billingType || null,
      hasApiKey: error.hasApiKey,
      apiKeyLength: error.apiKeyLength,
      latencyMs: error.latencyMs,
    };
  }

  const message = error && error.message ? error.message : String(error || 'Unknown LangChain model layer error.');
  const httpStatus = readHttpStatus(error);

  return {
    selectedModelId: null,
    errorType: classifyModelError({
      errorName: error && error.name,
      httpStatus,
      message,
    }),
    httpStatus,
    message: sanitizeMessage(message),
    provider: null,
    model: null,
    billingType: null,
    hasApiKey: false,
    apiKeyLength: 0,
    latencyMs: null,
  };
}

function describeLangChainModelLayerBoundary() {
  return {
    runtime: 'langchain-model-layer',
    keep: [
      'Frontend only submits selectedModelId.',
      'Server-side catalog resolves provider, model, apiKeyEnv, baseUrl and timeout.',
      'Provider keys stay in CloudBase function environment variables.',
      'Outputs keep modelTrace.usage, modelTrace.costEstimate, latencyMs, fallbackReason and modelErrorType contracts stable.',
      'LangChain raw messages, chunks and metadata stay inside the server boundary.',
    ],
    replaceLater: [],
  };
}

module.exports = {
  DEFAULT_LANGCHAIN_MODEL_ID,
  LangChainModelLayerError,
  createCanonicalUsage,
  createCostEstimate,
  createUsageCostMetadata,
  describeLangChainModelLayerBoundary,
  extractProviderRawUsage,
  getLangChainModelCatalog,
  getLangChainModelLayerConfig,
  normalizeProviderUsage,
  normalizeLangChainModelError,
  streamLangChainChatCompletion,
};
