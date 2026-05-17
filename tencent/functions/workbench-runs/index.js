const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';

const CONVERSATION_COLUMNS = ['id', '_openid', 'user_id', 'visibility'].join(',');
const AGENT_RUN_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'conversation_id',
  'usage_id',
  'runtime_run_id',
  'mode',
  'status',
  'intent',
  'prompt',
  'plan',
  'data_source_snapshot',
  'chart_data',
  'conclusion',
  'conclusion_source',
  'report_state',
  'started_at',
  'completed_at',
  'elapsed_ms',
  'error_message',
  'metadata',
  'created_at',
  'updated_at',
].join(',');
const RUN_EVENT_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'run_id',
  'conversation_id',
  'seq',
  'event_type',
  'payload',
  'created_at',
  'updated_at',
].join(',');
const TOOL_INVOCATION_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'run_id',
  'conversation_id',
  'tool_name',
  'display_name',
  'status',
  'input',
  'input_summary',
  'output',
  'output_summary',
  'started_at',
  'finished_at',
  'elapsed_ms',
  'error',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

function loadSharedModule(name) {
  const bundledSharedPath = path.join(__dirname, '_shared', `${name}.js`);
  const localSharedModule = fs.existsSync(bundledSharedPath) ? `./_shared/${name}` : `../_shared/${name}`;
  return require(localSharedModule);
}

const { authenticateRequest } = loadSharedModule('auth');
const { assertNoQueryError, extractRows, getDb, parseJsonObject } = loadSharedModule('mysql');

class RequestError extends Error {
  constructor(statusCode, errorCode, publicMessage) {
    super(publicMessage);
    this.name = 'RequestError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.publicMessage = publicMessage;
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  setCorsHeaders(res);
  res.writeHead(204);
  res.end();
}

function sendError(res, statusCode, errorCode, message) {
  sendJson(res, statusCode, {
    ok: false,
    errorCode,
    message,
  });
}

function readQueryString(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  return normalizedValue || null;
}

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeNullableNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
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

function toComparableTime(value) {
  const normalizedValue = normalizeDateTime(value);

  if (!normalizedValue) {
    return null;
  }

  const parsedTime = Date.parse(normalizedValue);
  return Number.isFinite(parsedTime) ? parsedTime : null;
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value);
  return stringValue ? stringValue : null;
}

function compareRunCreatedDesc(left, right) {
  const leftTime = toComparableTime(left.created_at);
  const rightTime = toComparableTime(right.created_at);

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const createdDiff = normalizeDateTime(right.created_at).localeCompare(normalizeDateTime(left.created_at));

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return String(right.id ?? '').localeCompare(String(left.id ?? ''));
}

function compareEventAsc(left, right) {
  const leftTime = toComparableTime(left.created_at);
  const rightTime = toComparableTime(right.created_at);

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const createdDiff = normalizeDateTime(left.created_at).localeCompare(normalizeDateTime(right.created_at));

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return normalizeNumber(left.seq) - normalizeNumber(right.seq);
}

function compareToolCreatedAsc(left, right) {
  const leftTime = toComparableTime(left.created_at);
  const rightTime = toComparableTime(right.created_at);

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const createdDiff = normalizeDateTime(left.created_at).localeCompare(normalizeDateTime(right.created_at));

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
}

function readGetParams(req) {
  const url = new URL(req.url || '/', 'http://localhost');

  return {
    conversationId: readQueryString(url.searchParams.get('conversationId')),
    runId: readQueryString(url.searchParams.get('runId')),
    latest: url.searchParams.get('latest') === '1',
  };
}

function hasExpectedConversationOwner(row, currentUser) {
  return (
    String(row._openid ?? '') === currentUser.openid &&
    String(row.user_id ?? '') === currentUser.userId &&
    String(row.visibility ?? '') === 'private'
  );
}

function hasExpectedOwner(row, currentUser) {
  return String(row._openid ?? '') === currentUser.openid && String(row.user_id ?? '') === currentUser.userId;
}

function mapAgentRun(row) {
  return {
    id: String(row.id ?? ''),
    conversation_id: String(row.conversation_id ?? ''),
    user_id: String(row.user_id ?? ''),
    usage_id: toNullableString(row.usage_id),
    runtime_run_id: toNullableString(row.runtime_run_id),
    mode: String(row.mode ?? 'agent'),
    status: String(row.status ?? 'running'),
    intent: toNullableString(row.intent),
    prompt: toNullableString(row.prompt),
    plan: parseJsonObject(row.plan),
    data_source_snapshot: parseJsonObject(row.data_source_snapshot),
    chart_data: parseJsonObject(row.chart_data),
    conclusion: toNullableString(row.conclusion),
    conclusion_source: toNullableString(row.conclusion_source),
    report_state: toNullableString(row.report_state),
    started_at: normalizeDateTime(row.started_at || row.created_at),
    completed_at: row.completed_at ? normalizeDateTime(row.completed_at) : null,
    elapsed_ms: normalizeNullableNumber(row.elapsed_ms),
    error_message: toNullableString(row.error_message),
    metadata: parseJsonObject(row.metadata),
  };
}

function mapRunEvent(row) {
  return {
    id: String(row.id ?? ''),
    run_id: String(row.run_id ?? ''),
    conversation_id: String(row.conversation_id ?? ''),
    user_id: String(row.user_id ?? ''),
    seq: normalizeNumber(row.seq),
    event_type: String(row.event_type ?? ''),
    payload: parseJsonObject(row.payload),
    created_at: normalizeDateTime(row.created_at),
  };
}

function mapToolInvocation(row) {
  return {
    id: String(row.id ?? ''),
    run_id: String(row.run_id ?? ''),
    conversation_id: String(row.conversation_id ?? ''),
    user_id: String(row.user_id ?? ''),
    tool_name: String(row.tool_name ?? ''),
    display_name: String(row.display_name ?? ''),
    status: String(row.status ?? 'running'),
    input: parseJsonObject(row.input),
    input_summary: toNullableString(row.input_summary),
    output: parseJsonObject(row.output),
    output_summary: toNullableString(row.output_summary),
    started_at: normalizeDateTime(row.started_at || row.created_at),
    finished_at: row.finished_at ? normalizeDateTime(row.finished_at) : null,
    elapsed_ms: normalizeNullableNumber(row.elapsed_ms),
    error: toNullableString(row.error),
    metadata: parseJsonObject(row.metadata),
  };
}

function createEmptyRunBundle() {
  return {
    run: null,
    events: [],
    toolInvocations: [],
  };
}

async function fetchConversationRecord(db, currentUser, conversationId) {
  const result = await db
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedConversationOwner(row, currentUser));
  return rows.length > 0 ? rows[0] : null;
}

async function assertConversationOwner(db, currentUser, conversationId) {
  const conversation = await fetchConversationRecord(db, currentUser, conversationId);

  if (!conversation) {
    throw new RequestError(404, 'not_found', 'Workbench conversation was not found.');
  }

  return conversation;
}

async function fetchLatestRunForConversation(db, currentUser, conversationId) {
  await assertConversationOwner(db, currentUser, conversationId);

  const result = await db
    .from('agent_runs')
    .select(AGENT_RUN_COLUMNS)
    .eq('conversation_id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result)
    .filter(
      (row) =>
        hasExpectedOwner(row, currentUser) &&
        String(row.conversation_id ?? '') === conversationId,
    )
    .sort(compareRunCreatedDesc);

  return rows.length > 0 ? mapAgentRun(rows[0]) : null;
}

async function fetchRunById(db, currentUser, runId) {
  const idResult = await db
    .from('agent_runs')
    .select(AGENT_RUN_COLUMNS)
    .eq('id', runId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(idResult);

  const idRows = extractRows(idResult).filter((row) => hasExpectedOwner(row, currentUser));

  if (idRows.length > 0) {
    return mapAgentRun(idRows[0]);
  }

  const runtimeResult = await db
    .from('agent_runs')
    .select(AGENT_RUN_COLUMNS)
    .eq('runtime_run_id', runId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(runtimeResult);

  const runtimeRows = extractRows(runtimeResult)
    .filter((row) => hasExpectedOwner(row, currentUser))
    .sort(compareRunCreatedDesc);

  return runtimeRows.length > 0 ? mapAgentRun(runtimeRows[0]) : null;
}

async function fetchRunEvents(db, currentUser, run) {
  const result = await db
    .from('run_events')
    .select(RUN_EVENT_COLUMNS)
    .eq('run_id', run.id)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  return extractRows(result)
    .filter(
      (row) =>
        hasExpectedOwner(row, currentUser) &&
        String(row.run_id ?? '') === run.id &&
        String(row.conversation_id ?? '') === run.conversation_id,
    )
    .sort(compareEventAsc)
    .map(mapRunEvent);
}

async function fetchToolInvocations(db, currentUser, run) {
  const result = await db
    .from('tool_invocations')
    .select(TOOL_INVOCATION_COLUMNS)
    .eq('run_id', run.id)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  return extractRows(result)
    .filter(
      (row) =>
        hasExpectedOwner(row, currentUser) &&
        String(row.run_id ?? '') === run.id &&
        String(row.conversation_id ?? '') === run.conversation_id,
    )
    .sort(compareToolCreatedAsc)
    .map(mapToolInvocation);
}

async function hydrateRunBundle(db, currentUser, run) {
  if (!run) {
    return createEmptyRunBundle();
  }

  const [events, toolInvocations] = await Promise.all([
    fetchRunEvents(db, currentUser, run),
    fetchToolInvocations(db, currentUser, run),
  ]);

  return {
    run,
    events,
    toolInvocations,
  };
}

async function fetchRunBundle(currentUser, params) {
  const db = getDb();

  if (params.runId) {
    return hydrateRunBundle(db, currentUser, await fetchRunById(db, currentUser, params.runId));
  }

  if (params.conversationId) {
    return hydrateRunBundle(
      db,
      currentUser,
      await fetchLatestRunForConversation(db, currentUser, params.conversationId),
    );
  }

  throw new RequestError(400, 'validation_error', 'Missing runId or conversationId.');
}

function toPublicError(error) {
  const statusCode = Number(error && error.statusCode);

  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 && error.errorCode) {
    return {
      statusCode,
      errorCode: error.errorCode,
      message: error.publicMessage || error.message || '请求失败。',
    };
  }

  return {
    statusCode: 500,
    errorCode: 'db_error',
    message: 'Workbench Run 读取失败。',
  };
}

function sanitizeLogMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password|connection|string)=([^&\s]+)/gi, '$1=[redacted]');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendNoContent(res);
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  try {
    const currentUser = await authenticateRequest(req);
    const params = readGetParams(req);
    const data = await fetchRunBundle(currentUser, params);

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-runs] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-runs] listening on ${HOST}:${PORT}`);
});
