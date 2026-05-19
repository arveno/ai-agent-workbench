const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_QWEN_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
const DEFAULT_SILICONFLOW_GLM_MODEL = 'THUDM/GLM-4-9B-0414';
const DEFAULT_ZHIPU_GLM_FLASH_MODEL = 'glm-4-flash-250414';
const DEFAULT_REAL_MODEL_ID = 'siliconflow-qwen-free';
const CHAT_COMPLETIONS_PATH = '/chat/completions';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 600;
const MAX_ERROR_MESSAGE_LENGTH = 300;

class ModelGatewayError extends Error {
  constructor(errorType, message, options = {}) {
    super(message || errorType);
    this.name = 'ModelGatewayError';
    this.errorType = errorType;
    this.httpStatus = Number.isInteger(options.httpStatus) ? options.httpStatus : null;
    this.selectedModelId = options.selectedModelId || null;
    this.provider = options.provider || null;
    this.model = options.model || null;
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
      enabled: true,
      billingType: 'free',
    },
  };
}

function getModelCatalog() {
  return Object.values(createModelCatalog()).map((item) => ({ ...item }));
}

function normalizeSelectedModelId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_REAL_MODEL_ID;
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
    enabled: base.enabled !== false,
    billingType: base.billingType || 'free',
    hasApiKey: false,
    apiKeyLength: 0,
    isConfigured: false,
    configErrorType: errorType,
    configErrorMessage: message,
  };
}

function getModelGatewayConfig(selectedModelId) {
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
      configErrorMessage: `Model gateway env is not configured for ${catalogItem.id}.`,
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

function createModelGatewayError(errorType, message, config, options = {}) {
  return new ModelGatewayError(errorType, sanitizeMessage(message || errorType), {
    httpStatus: options.httpStatus,
    selectedModelId: config?.selectedModelId || config?.id || null,
    provider: config?.provider || null,
    model: config?.model || null,
    hasApiKey: Boolean(config?.hasApiKey),
    apiKeyLength: Number(config?.apiKeyLength) || 0,
    latencyMs: options.latencyMs,
  });
}

function classifyProviderError(params = {}) {
  const status = Number(params.httpStatus);
  const message = String(params.message || '').toLowerCase();
  const errorName = String(params.errorName || '').toLowerCase();

  if (params.errorType) {
    return params.errorType;
  }

  if (errorName === 'aborterror') {
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

async function readErrorResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json();
      const rawError = data?.error;
      const message =
        rawError?.message ||
        rawError?.type ||
        (rawError && typeof rawError === 'object' ? JSON.stringify(rawError) : rawError) ||
        data?.message ||
        JSON.stringify(data);
      return String(message || response.statusText || 'Model gateway request failed.');
    }

    const text = await response.text();
    return text.trim() || response.statusText || 'Model gateway request failed.';
  } catch {
    return response.statusText || 'Model gateway request failed.';
  }
}

function buildChatCompletionsUrl(baseUrl) {
  return `${stripTrailingSlash(baseUrl)}${CHAT_COMPLETIONS_PATH}`;
}

function normalizeTemperature(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0.2;
}

function normalizeMaxTokens(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : DEFAULT_MAX_TOKENS;
}

function createRequestBody(params) {
  return JSON.stringify({
    model: params.config.model,
    messages: params.messages,
    temperature: normalizeTemperature(params.temperature),
    max_tokens: normalizeMaxTokens(params.maxTokens),
    stream: true,
  });
}

function normalizeUsageNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.trunc(numberValue) : null;
}

function normalizeTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const promptTokens = normalizeUsageNumber(usage.prompt_tokens ?? usage.promptTokens);
  const completionTokens = normalizeUsageNumber(usage.completion_tokens ?? usage.completionTokens);
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

async function streamChatCompletion(params) {
  const config = getModelGatewayConfig(params.selectedModelId);

  if (!config.isConfigured) {
    throw createModelGatewayError(
      config.configErrorType || 'model_not_configured',
      config.configErrorMessage || 'Model gateway is not configured.',
      config,
    );
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;

  try {
    response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: createRequestBody({
        config,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      }),
    });
  } catch (error) {
    clearTimeout(timeout);
    throw createModelGatewayError(classifyProviderError({
      errorName: error && error.name,
      message: error && error.message,
    }), error && error.message ? error.message : 'Model gateway fetch failed.', config, {
      latencyMs: Math.max(Date.now() - startedAt, 1),
    });
  }

  if (!response.ok) {
    const errorMessage = await readErrorResponse(response);
    clearTimeout(timeout);
    throw createModelGatewayError(classifyProviderError({
      httpStatus: response.status,
      message: errorMessage,
    }), errorMessage || response.statusText || 'Model gateway stream request failed.', config, {
      httpStatus: response.status,
      latencyMs: Math.max(Date.now() - startedAt, 1),
    });
  }

  if (!response.body) {
    clearTimeout(timeout);
    throw createModelGatewayError('provider_bad_response', 'Model gateway stream response did not include a body.', config, {
      httpStatus: response.status,
      latencyMs: Math.max(Date.now() - startedAt, 1),
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let tokenUsage = null;
  let parseFailedCount = 0;

  function flushLines(isFinal = false) {
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    if (isFinal && buffer) {
      lines.push(buffer);
      buffer = '';
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line.startsWith('data:')) {
        continue;
      }

      const dataText = line.slice('data:'.length).trim();

      if (!dataText || dataText === '[DONE]') {
        continue;
      }

      try {
        const event = JSON.parse(dataText);
        const usage = normalizeTokenUsage(event?.usage);
        const delta = event?.choices?.[0]?.delta?.content || event?.choices?.[0]?.text || '';

        if (usage) {
          tokenUsage = usage;
        }

        if (delta) {
          text += delta;
          if (typeof params.onDelta === 'function') {
            params.onDelta(delta);
          }
        }
      } catch {
        parseFailedCount += 1;
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      flushLines();
    }

    buffer += decoder.decode();
    flushLines(true);
  } catch (error) {
    throw createModelGatewayError(classifyProviderError({
      errorName: error && error.name,
      message: error && error.message,
    }), error && error.message ? error.message : 'Model gateway stream read failed.', config, {
      httpStatus: response.status,
      latencyMs: Math.max(Date.now() - startedAt, 1),
    });
  } finally {
    clearTimeout(timeout);
  }

  const latencyMs = Math.max(Date.now() - startedAt, 1);

  if (!text.trim()) {
    throw createModelGatewayError(
      'provider_bad_response',
      parseFailedCount > 0
        ? `Model gateway stream response parse failed ${parseFailedCount} time(s).`
        : 'Model gateway stream returned empty text.',
      config,
      { httpStatus: response.status, latencyMs },
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
    tokenUsage,
  };
}

function normalizeModelError(error) {
  if (error instanceof ModelGatewayError) {
    return {
      selectedModelId: error.selectedModelId,
      errorType: error.errorType,
      httpStatus: error.httpStatus,
      message: sanitizeMessage(error.message),
      provider: error.provider || null,
      model: error.model || null,
      hasApiKey: error.hasApiKey,
      apiKeyLength: error.apiKeyLength,
      latencyMs: error.latencyMs,
    };
  }

  const message = error && error.message ? error.message : String(error || 'Unknown model gateway error.');

  return {
    selectedModelId: null,
    errorType: classifyProviderError({
      errorName: error && error.name,
      message,
    }),
    httpStatus: null,
    message: sanitizeMessage(message),
    provider: null,
    model: null,
    hasApiKey: false,
    apiKeyLength: 0,
    latencyMs: null,
  };
}

module.exports = {
  DEFAULT_REAL_MODEL_ID,
  getModelCatalog,
  getModelGatewayConfig,
  normalizeModelError,
  streamChatCompletion,
};
