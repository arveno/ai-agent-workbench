import fs from 'node:fs';
import process from 'node:process';

const DEFAULT_PROFILE = 'poc';
const DEFAULT_PROMPT = 'warning_count 是什么？请给出知识库引用。';
const DEFAULT_TIMEOUT_MS = 120000;
const SMOKE_SOURCE = 'automated-report-source-smoke';
const SMOKE_TOOL = 'scripts/smoke-report-source.mjs';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function printUsage() {
  console.log(`Usage:
  pnpm smoke:report-source -- --token <cloudbase-token> [--base-url <url>] [--profile <name>] [--prompt <text>] [--timeout-ms <ms>]

Examples:
  pnpm smoke:report-source -- --token "<cloudbase-token>"
  pnpm smoke:report-source -- --base-url "https://example.com" --token "<cloudbase-token>" --timeout-ms 120000

Notes:
  - The token is required and will not be printed in full.
  - If --base-url is omitted, the script reads tencent/cloudbase-functions.config.json using --profile, defaulting to poc.
  - The script creates its own smoke conversation and does not accept historical conversationId/runId.`);
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

function parsePositiveInteger(value, optionName) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsedValue;
}

function parseArgs(argv) {
  const options = {
    baseUrl: '',
    token: '',
    profile: DEFAULT_PROFILE,
    prompt: DEFAULT_PROMPT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

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

    if (arg === '--profile') {
      options.profile = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--prompt') {
      options.prompt = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      options.timeoutMs = parsePositiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.token) {
    throw new Error('Missing required argument: --token <cloudbase-token>');
  }

  options.baseUrl = options.baseUrl || readBaseUrlFromConfig(options.profile);
  validateBaseUrl(options.baseUrl);

  return options;
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function validateBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('--base-url must start with http:// or https://');
  }
}

function readBaseUrlFromConfig(profile) {
  const configUrl = new URL('../tencent/cloudbase-functions.config.json', import.meta.url);
  const config = JSON.parse(fs.readFileSync(configUrl, 'utf8'));
  const profileConfig = config.profiles?.[profile] || config.environments?.[profile];
  const baseUrl = normalizeBaseUrl(profileConfig?.baseUrl || '');

  if (!baseUrl) {
    throw new Error(`Missing baseUrl for profile "${profile}" in tencent/cloudbase-functions.config.json`);
  }

  return baseUrl;
}

function buildUrl(baseUrl, requestPath) {
  return `${baseUrl}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`;
}

function summarizeText(value, maxLength = 1000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function createSmokeError(step, detail = {}) {
  const error = new Error(detail.message || `Smoke failed at ${step}`);
  error.name = 'SmokeError';
  error.step = step;
  Object.assign(error, detail);
  return error;
}

async function requestJson(options, request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${options.token}`,
    };

    if (request.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(buildUrl(options.baseUrl, request.path), {
      method: request.method || 'GET',
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    let parseError = '';

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        parseError = error.message;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      payload,
      parseError,
      text,
    };
  } catch (error) {
    const isTimeout = error.name === 'AbortError';

    return {
      ok: false,
      status: 0,
      statusText: isTimeout ? 'Timeout' : 'Network Error',
      payload: null,
      parseError: '',
      text: '',
      networkError: true,
      errorMessage: isTimeout ? `Timeout after ${options.timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function assertJsonOk(step, response) {
  if (!response.ok || response.parseError || response.payload?.ok !== true) {
    throw createSmokeError(step, {
      httpStatus: response.status,
      errorCode: response.payload?.errorCode || response.payload?.code || response.statusText || 'request_failed',
      responseSummary: response.parseError
        ? `Invalid JSON: ${response.parseError}; ${summarizeText(response.text)}`
        : summarizeText(response.text || response.errorMessage || response.statusText),
    });
  }

  return response.payload;
}

function extractConversationId(payload) {
  return payload?.data?.id || payload?.data?.conversation?.id || payload?.conversation?.id || payload?.id || '';
}

function extractReportFromPayload(payload) {
  return payload?.data?.report || payload?.data || payload?.report || null;
}

function getReportId(report) {
  return report?.id || report?.reportId || '';
}

function getReportRunId(report) {
  return report?.runId || report?.run_id || '';
}

function getReportMetadata(report) {
  return report && typeof report.metadata === 'object' && report.metadata !== null ? report.metadata : {};
}

function getReportSources(report) {
  const metadata = getReportMetadata(report);

  if (Array.isArray(report?.sources)) {
    return report.sources;
  }

  if (Array.isArray(metadata.sources)) {
    return metadata.sources;
  }

  return [];
}

function getReportSourceCount(report) {
  const metadata = getReportMetadata(report);
  const count = Number(report?.sourceCount ?? report?.source_count ?? metadata.sourceCount ?? metadata.source_count);

  return Number.isFinite(count) ? count : getReportSources(report).length;
}

function getReportSourceLineage(report) {
  const metadata = getReportMetadata(report);
  return report?.sourceLineage || report?.source_lineage || metadata.sourceLineage || metadata.source_lineage || '';
}

function extractReports(payload) {
  const data = payload?.data;

  if (Array.isArray(data?.reports)) {
    return data.reports;
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(payload?.reports)) {
    return payload.reports;
  }

  return [];
}

function extractRunIdFromEvent(event) {
  return event?.runId || event?.run?.id || event?.id || null;
}

function extractUsageIdFromEvent(event) {
  return event?.usageId || event?.run?.usageId || event?.usage?.id || null;
}

function extractAssistantMessageIdFromEvent(event) {
  return event?.assistantMessageId || event?.messageId || event?.message?.id || null;
}

function parseSseBlock(block) {
  const dataLines = [];

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const data = dataLines.join('\n').trim();

  if (!data || data === '[DONE]') {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    throw createSmokeError('agent_run_stream', {
      errorCode: 'invalid_sse_json',
      responseSummary: `${error.message}; ${summarizeText(data)}`,
    });
  }
}

function isErrorSseEvent(event) {
  const eventType = String(event?.type || '').toLowerCase();
  return eventType === 'error' || eventType === 'run_failed';
}

function recordSseEvent(state, event) {
  const eventType = String(event?.type || '');
  const eventRunId = extractRunIdFromEvent(event);
  const usageId = extractUsageIdFromEvent(event);
  const assistantMessageId = extractAssistantMessageIdFromEvent(event);

  if (eventRunId && UUID_PATTERN.test(eventRunId)) {
    state.runId = eventRunId;
  }

  if (usageId) {
    state.usageId = usageId;
  }

  if (assistantMessageId) {
    state.assistantMessageId = assistantMessageId;
  }

  if (eventType === 'run_started' || eventRunId) {
    state.hasRunStarted = true;
  }

  if (eventType === 'conclusion_delta' || eventType === 'conclusion_completed') {
    state.hasConclusion = true;
  }

  if (eventType === 'run_completed') {
    state.hasRunCompleted = true;
  }

  if (eventType === 'rag_sources_ready' && Array.isArray(event.sources)) {
    state.ragSourceCount = event.sources.length;
  }

  if (eventType === 'tool_completed' && event.toolId === 'knowledge_search') {
    state.hasKnowledgeSearch = true;
  }
}

async function runAgentStream(options, debug) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  const streamState = {
    runId: '',
    usageId: '',
    assistantMessageId: '',
    hasRunStarted: false,
    hasConclusion: false,
    hasRunCompleted: false,
    hasKnowledgeSearch: false,
    ragSourceCount: 0,
  };

  try {
    const response = await fetch(buildUrl(options.baseUrl, '/api/agent/run/stream'), {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: debug.conversationId,
        clientRunId: debug.clientRunId,
        prompt: options.prompt,
        mode: 'real',
        metadata: {
          source: SMOKE_SOURCE,
          tool: SMOKE_TOOL,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw createSmokeError('agent_run_stream', {
        httpStatus: response.status,
        errorCode: response.statusText || 'stream_request_failed',
        responseSummary: summarizeText(text),
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const event = parseSseBlock(block);

        if (!event) {
          continue;
        }

        if (isErrorSseEvent(event)) {
          throw createSmokeError('agent_run_stream', {
            errorCode: event.errorCode || event.type || 'stream_error',
            responseSummary: summarizeText(event.errorMessage || event.message || JSON.stringify(event)),
          });
        }

        recordSseEvent(streamState, event);
      }
    }

    const remaining = decoder.decode();

    if (remaining) {
      buffer += remaining;
    }

    if (buffer.trim()) {
      const event = parseSseBlock(buffer);

      if (event) {
        if (isErrorSseEvent(event)) {
          throw createSmokeError('agent_run_stream', {
            errorCode: event.errorCode || event.type || 'stream_error',
            responseSummary: summarizeText(event.errorMessage || event.message || JSON.stringify(event)),
          });
        }

        recordSseEvent(streamState, event);
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createSmokeError('agent_run_stream', {
        errorCode: 'timeout',
        responseSummary: `Timeout after ${options.timeoutMs}ms`,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!streamState.hasRunStarted || !streamState.runId) {
    throw createSmokeError('agent_run_stream', {
      errorCode: 'missing_run_started',
      responseSummary: 'SSE did not provide run_started with a DB UUID runId.',
    });
  }

  if (!UUID_PATTERN.test(streamState.runId)) {
    throw createSmokeError('agent_run_stream', {
      errorCode: 'non_uuid_run_id',
      responseSummary: `SSE runId is not a DB UUID: ${streamState.runId}`,
    });
  }

  if (!streamState.hasConclusion) {
    throw createSmokeError('agent_run_stream', {
      errorCode: 'missing_conclusion',
      responseSummary: 'SSE did not include conclusion_delta or conclusion_completed.',
    });
  }

  if (!streamState.hasRunCompleted) {
    throw createSmokeError('agent_run_stream', {
      errorCode: 'missing_run_completed',
      responseSummary: 'SSE ended before run_completed.',
    });
  }

  return streamState;
}

function validateReport(step, report, expectedRunId) {
  const reportId = getReportId(report);
  const reportRunId = getReportRunId(report);
  const sources = getReportSources(report);
  const sourceCount = getReportSourceCount(report);
  const sourceLineage = getReportSourceLineage(report);

  if (!reportId) {
    throw createSmokeError(step, {
      errorCode: 'missing_report_id',
      responseSummary: 'Report response did not include report id.',
    });
  }

  if (reportRunId !== expectedRunId) {
    throw createSmokeError(step, {
      errorCode: 'report_run_id_mismatch',
      responseSummary: `Expected runId=${expectedRunId}, got ${reportRunId || '<empty>'}.`,
    });
  }

  if (sourceCount <= 0 || sources.length <= 0) {
    throw createSmokeError(step, {
      errorCode: 'missing_report_sources',
      responseSummary: 'Report sourceCount is 0 or sources is empty. The run may not have run_sources; run a RAG/knowledge_search question first.',
    });
  }

  if (sourceLineage !== 'run_sources') {
    throw createSmokeError(step, {
      errorCode: 'invalid_source_lineage',
      responseSummary: `Expected sourceLineage=run_sources, got ${sourceLineage || '<empty>'}.`,
    });
  }

  return {
    reportId,
    reportRunId,
    sources,
    sourceCount,
    sourceLineage,
  };
}

function formatScore(source) {
  const score = Number(source?.score);
  return Number.isFinite(score) ? score.toFixed(2) : '';
}

function formatCitationLabel(value) {
  const label = String(value || 'source');
  return label.startsWith('[') ? label : `[${label}]`;
}

function printSuccess(debug, reportState) {
  console.log('Smoke PASS');
  console.log(`conversationId: ${debug.conversationId}`);
  console.log(`runId: ${debug.runId}`);
  console.log(`usageId: ${debug.usageId || ''}`);
  console.log(`assistantMessageId: ${debug.assistantMessageId || ''}`);
  console.log(`reportId: ${debug.reportId}`);
  console.log(`sourceCount: ${reportState.sourceCount}`);
  console.log('firstSources:');

  for (const source of reportState.sources.slice(0, 3)) {
    const label = formatCitationLabel(source?.citationLabel || source?.citation_label || source?.id);
    const title = source?.title || 'Untitled source';
    const score = formatScore(source);
    console.log(`  - ${label} ${title}${score ? ` ${score}` : ''}`);
  }
}

function printFailure(error, debug) {
  console.error('Smoke FAIL');
  console.error(`failedStep: ${error.step || 'unknown'}`);
  console.error(`httpStatus: ${error.httpStatus ?? ''}`);
  console.error(`errorCode: ${error.errorCode || error.code || error.name || 'unknown_error'}`);
  console.error(`responseSummary: ${summarizeText(error.responseSummary || error.message || '')}`);
  console.error('debug:');
  console.error(`  conversationId: ${debug.conversationId || ''}`);
  console.error(`  clientRunId: ${debug.clientRunId || ''}`);
  console.error(`  runId: ${debug.runId || ''}`);
  console.error(`  reportId: ${debug.reportId || ''}`);
}

async function createSmokeConversation(options, debug) {
  const response = await requestJson(options, {
    method: 'POST',
    path: '/api/workbench/conversations',
    body: {
      title: 'Report Source Smoke',
      mode: 'agent',
      metadata: {
        source: SMOKE_SOURCE,
        tool: SMOKE_TOOL,
      },
    },
  });
  const payload = assertJsonOk('create_conversation', response);
  const conversationId = extractConversationId(payload);

  if (!conversationId) {
    throw createSmokeError('create_conversation', {
      httpStatus: response.status,
      errorCode: 'missing_conversation_id',
      responseSummary: summarizeText(response.text),
    });
  }

  debug.conversationId = conversationId;
}

async function createReport(options, debug) {
  const response = await requestJson(options, {
    method: 'POST',
    path: '/api/workbench/reports',
    body: {
      conversationId: debug.conversationId,
      runId: debug.runId,
      title: 'Smoke Report Source Test',
      contentMarkdown: '## Smoke Report\n\n用于验证 Report Source 引用闭环。',
      status: 'generated',
      metadata: {
        source: SMOKE_SOURCE,
        tool: SMOKE_TOOL,
      },
    },
  });
  const payload = assertJsonOk('create_report', response);
  const report = extractReportFromPayload(payload);
  const reportState = validateReport('create_report', report, debug.runId);
  debug.reportId = reportState.reportId;

  return reportState;
}

async function verifyReportReadback(options, debug) {
  const response = await requestJson(options, {
    method: 'GET',
    path: `/api/workbench/reports?conversationId=${encodeURIComponent(debug.conversationId)}`,
  });
  const payload = assertJsonOk('read_reports', response);
  const reports = extractReports(payload);
  const report = reports.find((item) => getReportId(item) === debug.reportId);

  if (!report) {
    throw createSmokeError('read_reports', {
      httpStatus: response.status,
      errorCode: 'report_not_found',
      responseSummary: `Created report ${debug.reportId} was not found in GET /api/workbench/reports response.`,
    });
  }

  return validateReport('read_reports', report, debug.runId);
}

async function main() {
  const debug = {
    conversationId: '',
    clientRunId: `smoke-report-source-${Date.now()}`,
    runId: '',
    usageId: '',
    assistantMessageId: '',
    reportId: '',
  };

  try {
    const options = parseArgs(process.argv.slice(2));

    await createSmokeConversation(options, debug);

    const streamState = await runAgentStream(options, debug);
    debug.runId = streamState.runId;
    debug.usageId = streamState.usageId;
    debug.assistantMessageId = streamState.assistantMessageId;

    const createdReportState = await createReport(options, debug);
    const readbackReportState = await verifyReportReadback(options, debug);

    printSuccess(debug, {
      ...createdReportState,
      sourceCount: readbackReportState.sourceCount,
      sources: readbackReportState.sources,
    });
  } catch (error) {
    printFailure(error, debug);
    process.exitCode = 1;
  }
}

await main();
