const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
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
    this.provider = options.provider || null;
    this.model = options.model || null;
    this.hasApiKey = Boolean(options.hasApiKey);
    this.apiKeyLength = Number.isInteger(options.apiKeyLength) ? options.apiKeyLength : 0;
  }
}

function readEnv(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : '';
}

function hasModelGatewayEnv() {
  return Boolean(
    readEnv('MODEL_GATEWAY_PROVIDER') ||
    readEnv('MODEL_GATEWAY_BASE_URL') ||
    readEnv('MODEL_GATEWAY_API_KEY') ||
    readEnv('MODEL_GATEWAY_MODEL'),
  );
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function createOpenAiCompatibleConfig() {
  const provider = readEnv('MODEL_GATEWAY_PROVIDER') || 'openai-compatible';
  const baseUrl = stripTrailingSlash(readEnv('MODEL_GATEWAY_BASE_URL'));
  const apiKey = readEnv('MODEL_GATEWAY_API_KEY');
  const model = readEnv('MODEL_GATEWAY_MODEL');

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    source: 'model_gateway',
    compatibility: 'openai-compatible',
    hasApiKey: Boolean(apiKey),
    apiKeyLength: apiKey.length,
    isConfigured: provider === 'openai-compatible' && Boolean(baseUrl && apiKey && model),
  };
}

function createGroqCompatibleConfig() {
  const apiKey = readEnv('GROQ_API_KEY');
  const model = readEnv('GROQ_MODEL') || DEFAULT_GROQ_MODEL;

  return {
    provider: 'groq',
    baseUrl: DEFAULT_GROQ_BASE_URL,
    apiKey,
    model,
    source: 'groq_compat',
    compatibility: 'groq-openai-compatible',
    hasApiKey: Boolean(apiKey),
    apiKeyLength: apiKey.length,
    isConfigured: Boolean(apiKey && model),
  };
}

function getModelGatewayConfig() {
  return hasModelGatewayEnv() ? createOpenAiCompatibleConfig() : createGroqCompatibleConfig();
}

function sanitizeMessage(value) {
  let message = String(value || '');
  const sensitiveValues = [
    readEnv('MODEL_GATEWAY_API_KEY'),
    readEnv('GROQ_API_KEY'),
  ].filter(Boolean);

  for (const sensitiveValue of sensitiveValues) {
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
    provider: config?.provider || null,
    model: config?.model || null,
    hasApiKey: Boolean(config?.hasApiKey),
    apiKeyLength: Number(config?.apiKeyLength) || 0,
  });
}

function classifyModelError(params = {}) {
  const status = Number(params.httpStatus);
  const message = String(params.message || '').toLowerCase();
  const errorName = String(params.errorName || '').toLowerCase();

  if (params.errorType) {
    return params.errorType;
  }

  if (errorName === 'aborterror') {
    return 'model_timeout';
  }

  if (status === 401 || message.includes('invalid api key') || message.includes('unauthorized')) {
    return 'model_unauthorized';
  }

  if (
    status === 403 ||
    message.includes('forbidden') ||
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
    return 'model_not_found';
  }

  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'model_rate_limited';
  }

  if (params.parseFailed) {
    return 'model_response_parse_failed';
  }

  if (
    errorName === 'typeerror' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('etimedout')
  ) {
    return 'model_network_error';
  }

  return 'model_failed';
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

async function streamChatCompletion(params) {
  const config = getModelGatewayConfig();

  if (!config.isConfigured) {
    throw createModelGatewayError(
      'model_not_configured',
      config.source === 'model_gateway'
        ? 'MODEL_GATEWAY_BASE_URL, MODEL_GATEWAY_API_KEY, MODEL_GATEWAY_MODEL, and MODEL_GATEWAY_PROVIDER=openai-compatible are required.'
        : 'GROQ_API_KEY is not configured.',
      config,
    );
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.MODEL_GATEWAY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
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
    throw createModelGatewayError(classifyModelError({
      errorName: error && error.name,
      message: error && error.message,
    }), error && error.message ? error.message : 'Model gateway fetch failed.', config);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorMessage = await readErrorResponse(response);
    throw createModelGatewayError(classifyModelError({
      httpStatus: response.status,
      message: errorMessage,
    }), errorMessage || response.statusText || 'Model gateway stream request failed.', config, {
      httpStatus: response.status,
    });
  }

  if (!response.body) {
    throw createModelGatewayError('model_response_parse_failed', 'Model gateway stream response did not include a body.', config, {
      httpStatus: response.status,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
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
        const delta = event?.choices?.[0]?.delta?.content || event?.choices?.[0]?.text || '';

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

  if (!text.trim()) {
    throw createModelGatewayError(
      parseFailedCount > 0 ? 'model_response_parse_failed' : 'model_failed',
      parseFailedCount > 0
        ? `Model gateway stream response parse failed ${parseFailedCount} time(s).`
        : 'Model gateway stream returned empty text.',
      config,
      { httpStatus: response.status },
    );
  }

  return {
    text,
    provider: config.provider,
    model: config.model,
    source: config.source,
  };
}

function normalizeModelError(error) {
  const config = getModelGatewayConfig();

  if (error instanceof ModelGatewayError) {
    return {
      errorType: error.errorType,
      httpStatus: error.httpStatus,
      message: sanitizeMessage(error.message),
      provider: error.provider || config.provider,
      model: error.model || config.model || null,
      hasApiKey: error.hasApiKey,
      apiKeyLength: error.apiKeyLength,
    };
  }

  const message = error && error.message ? error.message : String(error || 'Unknown model gateway error.');

  return {
    errorType: classifyModelError({
      errorName: error && error.name,
      message,
    }),
    httpStatus: null,
    message: sanitizeMessage(message),
    provider: config.provider,
    model: config.model || null,
    hasApiKey: config.hasApiKey,
    apiKeyLength: config.apiKeyLength,
  };
}

module.exports = {
  getModelGatewayConfig,
  normalizeModelError,
  streamChatCompletion,
};
