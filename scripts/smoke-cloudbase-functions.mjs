const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MODEL = 'mock-agent';
const SMOKE_SOURCE = 'cloudbase-smoke-test';

function printUsage() {
  console.log(`Usage:
  pnpm cloudbase:smoke -- --base-url <url> [--token <token>] [--model <selectedModelId>] [--include-sse] [--skip-real-model] [--timeout <ms>] [--json]

Examples:
  pnpm cloudbase:smoke -- --base-url https://example.com
  pnpm cloudbase:smoke -- --base-url https://example.com --token <token>
  pnpm cloudbase:smoke -- --base-url https://example.com --token <token> --include-sse --model mock-agent`);
}

function parseArgs(argv) {
  const options = {
    baseUrl: '',
    token: '',
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
    skipRealModel: false,
    includeSse: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--base-url') {
      options.baseUrl = normalizeBaseUrl(readOptionValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--token') {
      options.token = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--model') {
      options.model = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--timeout') {
      options.timeoutMs = parseTimeout(readOptionValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--skip-real-model') {
      options.skipRealModel = true;
      continue;
    }

    if (arg === '--include-sse') {
      options.includeSse = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.baseUrl) {
    throw new Error('Missing required argument: --base-url <url>');
  }

  validateBaseUrl(options.baseUrl);
  return options;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

function parseTimeout(value) {
  const timeoutMs = Number(value);

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('--timeout must be a positive integer in milliseconds.');
  }

  return timeoutMs;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function validateBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('--base-url must start with http:// or https://');
  }
}

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';

    for (const key of parsed.searchParams.keys()) {
      if (/token|authorization|auth/i.test(key)) {
        parsed.searchParams.set(key, '<redacted>');
      }
    }

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return value;
  }
}

function buildUrl(baseUrl, requestPath) {
  return `${baseUrl}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`;
}

function createSmokeContext() {
  const timestamp = new Date().toISOString();
  const compactTimestamp = timestamp.replace(/[-:.TZ]/g, '');

  return {
    timestamp,
    runId: `smoke-${compactTimestamp}`,
    conversationTitle: `[smoke] CloudBase deployment check ${timestamp}`,
    reportTitle: `[smoke] Report check ${timestamp}`,
    messageContent: `Smoke test message ${timestamp}`,
    clientMessageId: `smoke-msg-${compactTimestamp}`,
    clientRunId: `smoke-run-${compactTimestamp}`,
  };
}

async function requestJson(options, requestOptions) {
  const response = await requestText(options, {
    ...requestOptions,
    accept: 'application/json',
  });

  let payload = null;
  let parseError = '';

  if (response.text) {
    try {
      payload = JSON.parse(response.text);
    } catch (error) {
      parseError = error.message;
    }
  }

  return {
    ...response,
    payload,
    parseError,
  };
}

async function requestText(options, requestOptions) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  const headers = {
    Accept: requestOptions.accept || '*/*',
  };

  if (requestOptions.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (requestOptions.token) {
    headers.Authorization = `Bearer ${requestOptions.token}`;
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(buildUrl(options.baseUrl, requestOptions.path), {
      method: requestOptions.method || 'GET',
      headers,
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
      signal: controller.signal,
    });
    const text = await response.text();

    return {
      networkError: false,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') || '',
      text,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const isTimeout = error.name === 'AbortError';

    return {
      networkError: true,
      ok: false,
      status: 0,
      statusText: isTimeout ? 'Timeout' : 'Network Error',
      contentType: '',
      text: '',
      errorMessage: isTimeout ? `Timeout after ${options.timeoutMs}ms` : error.message,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function httpDetail(response) {
  if (response.networkError) {
    return response.errorMessage || 'Network request failed.';
  }

  const status = `${response.status} ${response.statusText}`.trim();

  if (response.parseError) {
    return `${status}; invalid JSON: ${response.parseError}`;
  }

  return status;
}

function assertPayloadOk(response) {
  return response.payload && response.payload.ok === true;
}

function extractConversationId(payload) {
  return payload?.data?.id || payload?.data?.conversation?.id || payload?.conversation?.id || payload?.id || '';
}

function extractReportId(payload) {
  return payload?.data?.id || payload?.data?.report?.id || payload?.report?.id || payload?.id || '';
}

function getCurrentUser(payload) {
  return payload?.data?.currentUser || payload?.currentUser || null;
}

function getQuota(payload) {
  return payload?.data?.quota || payload?.quota || null;
}

function getMessages(payload) {
  return payload?.data?.messages || payload?.messages || [];
}

function getReports(payload) {
  return payload?.data?.reports || payload?.reports || [];
}

function isAuthRejection(response) {
  if (response.status === 401 || response.status === 403) {
    return true;
  }

  const text = [
    response.payload?.code,
    response.payload?.error,
    response.payload?.message,
    response.text,
  ].filter(Boolean).join(' ');

  return /auth|unauthori[sz]ed|forbidden|token|login/i.test(text);
}

function isRealModel(model) {
  return model !== DEFAULT_MODEL;
}

class ResultCollector {
  constructor() {
    this.results = [];
  }

  async run(name, task) {
    const startedAt = Date.now();

    try {
      const result = await task();
      this.push({
        name,
        status: result.status,
        detail: result.detail,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      this.push({
        name,
        status: 'ERROR',
        detail: error.message,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  skip(name, detail) {
    this.push({
      name,
      status: 'SKIP',
      detail,
      durationMs: 0,
    });
  }

  push(result) {
    this.results.push(result);
    printResult(result);
  }

  summary() {
    const counts = {
      total: this.results.length,
      OK: 0,
      WARN: 0,
      ERROR: 0,
      SKIP: 0,
    };

    for (const result of this.results) {
      counts[result.status] += 1;
    }

    return counts;
  }
}

function printResult(result) {
  const duration = result.durationMs > 0 ? ` (${result.durationMs}ms)` : '';
  console.log(`${result.status} ${result.name}${duration} - ${result.detail}`);
}

async function checkDemoTasks(options) {
  const response = await requestJson(options, {
    method: 'GET',
    path: '/api/workbench/demo-tasks',
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}` };
  }

  const tasks = response.payload?.data?.tasks;

  if (!Array.isArray(tasks)) {
    return { status: 'ERROR', detail: 'data.tasks is not an array.' };
  }

  if (tasks.length === 0) {
    return { status: 'WARN', detail: 'data.tasks is an empty array.' };
  }

  return { status: 'OK', detail: `tasks=${tasks.length}` };
}

async function checkDemoConversations(options) {
  const response = await requestJson(options, {
    method: 'GET',
    path: '/api/workbench/demo-conversations',
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}` };
  }

  const conversations = response.payload?.data?.conversations;

  if (!Array.isArray(conversations)) {
    return { status: 'ERROR', detail: 'data.conversations is not an array.' };
  }

  if (conversations.length === 0) {
    return { status: 'WARN', detail: 'data.conversations is an empty array.' };
  }

  return { status: 'OK', detail: `conversations=${conversations.length}` };
}

async function checkAuthMeWithoutToken(options) {
  const response = await requestJson(options, {
    method: 'GET',
    path: '/api/auth/me',
  });

  if (response.networkError) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (response.ok) {
    return { status: 'ERROR', detail: 'GET /api/auth/me returned 2xx without token.' };
  }

  if (!isAuthRejection(response)) {
    return { status: 'ERROR', detail: `Expected auth rejection; got ${httpDetail(response)}` };
  }

  return { status: 'OK', detail: `auth rejected without token; ${httpDetail(response)}` };
}

async function checkAuthMeWithToken(options) {
  const response = await requestJson(options, {
    method: 'GET',
    path: '/api/auth/me',
    token: options.token,
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}` };
  }

  if (!getCurrentUser(response.payload)) {
    return { status: 'ERROR', detail: 'data.currentUser is missing.' };
  }

  return { status: 'OK', detail: 'currentUser present.' };
}

async function checkQuota(options) {
  const response = await requestJson(options, {
    method: 'GET',
    path: '/api/workbench/quota',
    token: options.token,
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}` };
  }

  if (!getQuota(response.payload)) {
    return { status: 'ERROR', detail: 'data.quota is missing.' };
  }

  return { status: 'OK', detail: 'quota present.' };
}

async function createSmokeConversation(options, context) {
  const response = await requestJson(options, {
    method: 'POST',
    path: '/api/workbench/conversations',
    token: options.token,
    body: {
      title: context.conversationTitle,
      mode: 'mock',
      summary: 'Smoke test conversation',
      metadata: {
        source: SMOKE_SOURCE,
        createdBy: 'scripts/smoke-cloudbase-functions.mjs',
        timestamp: context.timestamp,
        smokeRunId: context.runId,
      },
    },
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response), conversationId: '' };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}`, conversationId: '' };
  }

  const conversationId = extractConversationId(response.payload);

  if (!conversationId) {
    return { status: 'ERROR', detail: 'conversation id is missing.', conversationId: '' };
  }

  return { status: 'OK', detail: `conversationId=${conversationId}`, conversationId };
}

async function createSmokeMessage(options, context, conversationId) {
  const response = await requestJson(options, {
    method: 'POST',
    path: '/api/workbench/messages',
    token: options.token,
    body: {
      conversationId,
      role: 'user',
      content: context.messageContent,
      clientMessageId: context.clientMessageId,
      metadata: {
        source: SMOKE_SOURCE,
        smokeRunId: context.runId,
      },
    },
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}` };
  }

  return { status: 'OK', detail: `clientMessageId=${context.clientMessageId}` };
}

async function readSmokeMessages(options, context, conversationId) {
  const query = new URLSearchParams({ conversationId }).toString();
  const response = await requestJson(options, {
    method: 'GET',
    path: `/api/workbench/messages?${query}`,
    token: options.token,
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}` };
  }

  const messages = getMessages(response.payload);

  if (!Array.isArray(messages)) {
    return { status: 'ERROR', detail: 'data.messages is not an array.' };
  }

  const found = messages.some((message) => (
    message.clientMessageId === context.clientMessageId ||
    message.content === context.messageContent
  ));

  if (!found) {
    return { status: 'ERROR', detail: 'smoke message was not found in message list.' };
  }

  return { status: 'OK', detail: `messages=${messages.length}; smoke message found.` };
}

async function createSmokeReport(options, context, conversationId) {
  const response = await requestJson(options, {
    method: 'POST',
    path: '/api/workbench/reports',
    token: options.token,
    body: {
      conversationId,
      title: context.reportTitle,
      contentMarkdown: 'Smoke test report content.',
      status: 'generated',
      metadata: {
        source: SMOKE_SOURCE,
        smokeRunId: context.runId,
      },
    },
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response), reportId: '' };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}`, reportId: '' };
  }

  const reportId = extractReportId(response.payload);

  if (!reportId) {
    return { status: 'WARN', detail: 'report id is missing; report create returned ok=true.', reportId: '' };
  }

  return { status: 'OK', detail: `reportId=${reportId}`, reportId };
}

async function readSmokeReports(options, context, conversationId, reportId) {
  const query = new URLSearchParams({ conversationId }).toString();
  const response = await requestJson(options, {
    method: 'GET',
    path: `/api/workbench/reports?${query}`,
    token: options.token,
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  if (!assertPayloadOk(response)) {
    return { status: 'ERROR', detail: `payload ok=true missing; ${httpDetail(response)}` };
  }

  const reports = getReports(response.payload);

  if (!Array.isArray(reports)) {
    return { status: 'ERROR', detail: 'data.reports is not an array.' };
  }

  const found = reports.some((report) => (
    (reportId && report.id === reportId) ||
    report.title === context.reportTitle
  ));

  if (!found) {
    return { status: 'ERROR', detail: 'smoke report was not found in report list.' };
  }

  return { status: 'OK', detail: `reports=${reports.length}; smoke report found.` };
}

async function checkAgentSse(options, context, conversationId) {
  const response = await requestText(options, {
    method: 'POST',
    path: '/api/agent/run/stream',
    token: options.token,
    accept: 'text/event-stream',
    body: {
      prompt: '请用一句话回复 smoke test。',
      conversationId,
      selectedModelId: options.model,
      clientRunId: context.clientRunId,
    },
  });

  if (!response.ok) {
    return { status: 'ERROR', detail: httpDetail(response) };
  }

  const isEventStream = /text\/event-stream/i.test(response.contentType);
  const hasCompletion = /run_completed/.test(response.text);

  if (!hasCompletion) {
    return {
      status: 'ERROR',
      detail: `SSE response did not include run_completed; content-type=${response.contentType || 'unknown'}`,
    };
  }

  if (isRealModel(options.model)) {
    const hasModelTrace = /provider|tokenUsage|latencyMs|fallbackReason|modelErrorType/i.test(response.text);

    if (!hasModelTrace) {
      return {
        status: 'WARN',
        detail: 'run_completed found, but provider/tokenUsage/latency/fallback evidence was not found in SSE text.',
      };
    }
  }

  const contentTypeDetail = isEventStream ? 'event-stream' : `readable text; content-type=${response.contentType || 'unknown'}`;
  return { status: 'OK', detail: `run_completed found; ${contentTypeDetail}` };
}

async function runSmoke(options) {
  const collector = new ResultCollector();
  const context = createSmokeContext();
  let conversationId = '';
  let reportId = '';

  console.log('CloudBase smoke test');
  console.log(`Base URL: ${redactUrl(options.baseUrl)}`);
  console.log(`Token: ${options.token ? 'provided' : 'not provided'}`);
  console.log(`Model: ${options.model}`);
  console.log(`Timeout: ${options.timeoutMs}ms`);

  if (options.token) {
    console.log('Data note: token mode creates a smoke conversation, message, and report. No automatic cleanup is performed.');
  }

  if (options.includeSse) {
    console.log('SSE note: Agent SSE writes run data and may consume model quota/tokens.');
  }

  console.log('');

  await collector.run('GET /api/workbench/demo-tasks', () => checkDemoTasks(options));
  await collector.run('GET /api/workbench/demo-conversations', () => checkDemoConversations(options));
  await collector.run('GET /api/auth/me without token', () => checkAuthMeWithoutToken(options));

  if (!options.token) {
    collector.skip('GET /api/auth/me with token', 'No token provided.');
    collector.skip('GET /api/workbench/quota', 'No token provided.');
    collector.skip('POST /api/workbench/conversations', 'No token provided.');
    collector.skip('POST /api/workbench/messages', 'No token provided.');
    collector.skip('GET /api/workbench/messages', 'No token provided.');
    collector.skip('POST /api/workbench/reports', 'No token provided.');
    collector.skip('GET /api/workbench/reports', 'No token provided.');
  } else {
    await collector.run('GET /api/auth/me with token', () => checkAuthMeWithToken(options));
    await collector.run('GET /api/workbench/quota', () => checkQuota(options));
    await collector.run('POST /api/workbench/conversations', async () => {
      const result = await createSmokeConversation(options, context);
      conversationId = result.conversationId || '';
      return result;
    });

    if (!conversationId) {
      collector.skip('POST /api/workbench/messages', 'Missing smoke conversation id.');
      collector.skip('GET /api/workbench/messages', 'Missing smoke conversation id.');
      collector.skip('POST /api/workbench/reports', 'Missing smoke conversation id.');
      collector.skip('GET /api/workbench/reports', 'Missing smoke conversation id.');
    } else {
      await collector.run('POST /api/workbench/messages', () => createSmokeMessage(options, context, conversationId));
      await collector.run('GET /api/workbench/messages', () => readSmokeMessages(options, context, conversationId));
      await collector.run('POST /api/workbench/reports', async () => {
        const result = await createSmokeReport(options, context, conversationId);
        reportId = result.reportId || '';
        return result;
      });
      await collector.run('GET /api/workbench/reports', () => readSmokeReports(options, context, conversationId, reportId));
    }
  }

  if (!options.includeSse) {
    collector.skip('POST /api/agent/run/stream', 'SSE check disabled. Pass --include-sse to run it.');
  } else if (!options.token) {
    collector.skip('POST /api/agent/run/stream', 'No token provided.');
  } else if (!conversationId) {
    collector.skip('POST /api/agent/run/stream', 'Missing smoke conversation id.');
  } else if (options.skipRealModel && isRealModel(options.model)) {
    collector.skip('POST /api/agent/run/stream', `Real model skipped by --skip-real-model: ${options.model}`);
  } else {
    await collector.run('POST /api/agent/run/stream', () => checkAgentSse(options, context, conversationId));
  }

  const summary = collector.summary();

  console.log('');
  console.log(`Summary: total=${summary.total} OK=${summary.OK} WARN=${summary.WARN} ERROR=${summary.ERROR} SKIP=${summary.SKIP}`);

  if (options.json) {
    console.log('');
    console.log(JSON.stringify({
      baseUrl: redactUrl(options.baseUrl),
      hasToken: Boolean(options.token),
      model: options.model,
      includeSse: options.includeSse,
      skipRealModel: options.skipRealModel,
      summary,
      results: collector.results,
    }, null, 2));
  }

  if (summary.ERROR > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  if (typeof fetch !== 'function') {
    throw new Error('This script requires a Node.js runtime with global fetch support. Please use Node 18 or newer.');
  }

  const options = parseArgs(process.argv.slice(2));
  await runSmoke(options);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
