const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 1024;
const EVENT_DELAY_MS = 450;
const DEFAULT_QUOTA_LIMIT = 20;

const CONVERSATION_COLUMNS = ['id', '_openid', 'user_id', 'visibility', 'message_count'].join(',');
const QUOTA_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'quota_type',
  'quota_limit',
  'quota_used',
  'period_start',
  'period_end',
].join(',');

function loadSharedModule(name) {
  const bundledSharedPath = path.join(__dirname, '_shared', `${name}.js`);
  const localSharedModule = fs.existsSync(bundledSharedPath) ? `./_shared/${name}` : `../_shared/${name}`;
  return require(localSharedModule);
}

const { authenticateRequest } = loadSharedModule('auth');
const { assertNoQueryError, extractRows, getDb } = loadSharedModule('mysql');

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequestBodyValue(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    throw new RequestError(400, 'validation_error', 'Invalid JSON body.');
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    let didReject = false;

    req.setEncoding('utf8');

    req.on('data', (chunk) => {
      if (didReject) {
        return;
      }

      rawBody += chunk;

      if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
        didReject = true;
        reject(new RequestError(400, 'validation_error', 'Request body too large.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (didReject) {
        return;
      }

      try {
        resolve(parseRequestBodyValue(rawBody));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', () => {
      if (!didReject) {
        reject(new RequestError(400, 'validation_error', 'Invalid request body.'));
      }
    });
  });
}

function readRequiredString(value, message) {
  const stringValue = typeof value === 'string' ? value.trim() : '';

  if (!stringValue) {
    throw new RequestError(400, 'validation_error', message);
  }

  return stringValue;
}

function readOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.trunc(numberValue) : fallback;
}

function padNumber(value, length = 2) {
  return String(value).padStart(length, '0');
}

function toMysqlDateTime(date) {
  return (
    `${date.getUTCFullYear()}-${padNumber(date.getUTCMonth() + 1)}-${padNumber(date.getUTCDate())}` +
    ` ${padNumber(date.getUTCHours())}:${padNumber(date.getUTCMinutes())}:${padNumber(date.getUTCSeconds())}.` +
    padNumber(date.getUTCMilliseconds(), 3)
  );
}

function getCurrentMonthPeriod() {
  const shiftedNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = shiftedNow.getUTCFullYear();
  const month = shiftedNow.getUTCMonth() + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    periodStart: `${year}-${padNumber(month)}-01 00:00:00.000`,
    periodEnd: `${nextMonthYear}-${padNumber(nextMonth)}-01 00:00:00.000`,
  };
}

function isDuplicateKeyError(error) {
  const message = String(error && error.message ? error.message : error).toLowerCase();
  return message.includes('duplicate') || message.includes('er_dup_entry');
}

function isAdmin(currentUser) {
  return String(currentUser.role || '').toLowerCase() === 'admin';
}

function hasExpectedOwner(row, currentUser) {
  return String(row._openid ?? '') === currentUser.openid && String(row.user_id ?? '') === currentUser.userId;
}

function hasExpectedConversationOwner(row, currentUser) {
  return hasExpectedOwner(row, currentUser) && String(row.visibility ?? '') === 'private';
}

function mapQuota(row) {
  const quotaLimit = normalizeNumber(row.quota_limit, DEFAULT_QUOTA_LIMIT);
  const quotaUsed = normalizeNumber(row.quota_used, 0);

  return {
    id: String(row.id ?? ''),
    quotaType: String(row.quota_type ?? 'agent_run'),
    quotaLimit,
    quotaUsed,
    remaining: Math.max(quotaLimit - quotaUsed, 0),
    periodStart: String(row.period_start ?? ''),
    periodEnd: String(row.period_end ?? ''),
  };
}

function toPublicQuota(quota) {
  return {
    quotaType: quota.quotaType,
    quotaLimit: quota.quotaLimit,
    quotaUsed: quota.quotaUsed,
    remaining: quota.remaining,
    periodStart: quota.periodStart,
    periodEnd: quota.periodEnd,
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

async function fetchQuotaByPeriod(db, currentUser, periodStart) {
  const result = await db
    .from('agent_run_quota')
    .select(QUOTA_COLUMNS)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('quota_type', 'agent_run')
    .eq('period_start', periodStart);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedOwner(row, currentUser));
  return rows.length > 0 ? mapQuota(rows[0]) : null;
}

async function fetchQuotaById(db, currentUser, quotaId) {
  const result = await db
    .from('agent_run_quota')
    .select(QUOTA_COLUMNS)
    .eq('id', quotaId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedOwner(row, currentUser));
  return rows.length > 0 ? mapQuota(rows[0]) : null;
}

async function ensureMonthlyQuota(db, currentUser) {
  const period = getCurrentMonthPeriod();
  const existingQuota = await fetchQuotaByPeriod(db, currentUser, period.periodStart);

  if (existingQuota) {
    return existingQuota;
  }

  const quotaId = randomUUID();
  const insertPayload = {
    id: quotaId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    quota_type: 'agent_run',
    quota_limit: DEFAULT_QUOTA_LIMIT,
    quota_used: 0,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    metadata: JSON.stringify({ source: 'agent-run-basic-loop' }),
  };

  try {
    const insertResult = await db.from('agent_run_quota').insert(insertPayload);
    assertNoQueryError(insertResult);
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const quota = await fetchQuotaByPeriod(db, currentUser, period.periodStart);

  if (!quota) {
    throw new Error('Monthly quota was not found.');
  }

  return quota;
}

async function updateQuotaUsed(db, currentUser, quota, nextUsed) {
  const updateResult = await db
    .from('agent_run_quota')
    .update({ quota_used: nextUsed })
    .eq('id', quota.id)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateResult);

  const updatedQuota = await fetchQuotaById(db, currentUser, quota.id);

  if (!updatedQuota) {
    throw new Error('Updated quota was not found.');
  }

  return updatedQuota;
}

async function consumeQuota(db, currentUser, runId, runtimeRunId) {
  const quota = await ensureMonthlyQuota(db, currentUser);
  let updatedQuota = quota;

  if (!isAdmin(currentUser)) {
    if (quota.quotaUsed >= quota.quotaLimit) {
      throw new RequestError(429, 'quota_exceeded', 'Agent Run quota exceeded.');
    }

    updatedQuota = await updateQuotaUsed(db, currentUser, quota, quota.quotaUsed + 1);
  }

  const usageId = randomUUID();
  const insertUsageResult = await db.from('agent_run_usage').insert({
    id: usageId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    run_id: runtimeRunId || runId,
    quota_type: 'agent_run',
    status: 'started',
    metadata: JSON.stringify({
      source: 'cloudbase-agent-run-basic-loop',
      runId,
      runtimeRunId,
    }),
  });

  assertNoQueryError(insertUsageResult);

  return {
    usageId,
    quota: updatedQuota,
  };
}

async function finishUsage(db, currentUser, usageId, status, errorCode, metadata = {}) {
  if (!usageId) {
    return;
  }

  const updateResult = await db
    .from('agent_run_usage')
    .update({
      status,
      finished_at: toMysqlDateTime(new Date()),
      error_code: errorCode || null,
      metadata: JSON.stringify(metadata),
    })
    .eq('id', usageId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateResult);
}

async function createAgentRun(db, currentUser, context) {
  const insertResult = await db.from('agent_runs').insert({
    id: context.runId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    conversation_id: context.conversationId,
    usage_id: context.usageId,
    runtime_run_id: context.runtimeRunId,
    mode: 'agent',
    status: 'running',
    intent: 'mock_basic_loop',
    prompt: context.prompt,
    plan: JSON.stringify({
      source: 'cloudbase-basic-loop',
      steps: ['validate_conversation', 'consume_quota', 'mock_tool', 'fixed_conclusion', 'assistant_message'],
    }),
    data_source_snapshot: JSON.stringify({ source: 'mock' }),
    chart_data: JSON.stringify({}),
    conclusion: null,
    conclusion_source: null,
    report_state: 'not_requested',
    metadata: JSON.stringify({
      source: 'cloudbase-agent-run-basic-loop',
      clientRunId: context.clientRunId,
    }),
  });

  assertNoQueryError(insertResult);

  const updateConversationResult = await db
    .from('conversations')
    .update({
      latest_run_id: context.runId,
      status: 'running',
    })
    .eq('id', context.conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  assertNoQueryError(updateConversationResult);
}

async function completeAgentRun(db, currentUser, context, elapsedMs, conclusion, assistantMessageId) {
  const completedAt = toMysqlDateTime(new Date());
  const updateRunResult = await db
    .from('agent_runs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      elapsed_ms: elapsedMs,
      conclusion,
      conclusion_source: 'mock_fixed',
      report_state: 'not_requested',
      chart_data: JSON.stringify({
        type: 'mock_summary',
        assistantMessageId,
      }),
    })
    .eq('id', context.runId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateRunResult);

  const updateConversationResult = await db
    .from('conversations')
    .update({
      latest_run_id: context.runId,
      status: 'completed',
    })
    .eq('id', context.conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  assertNoQueryError(updateConversationResult);
}

async function failAgentRun(db, currentUser, context, status, errorMessage) {
  if (!context.runId || !context.conversationId) {
    return;
  }

  const updateResult = await db
    .from('agent_runs')
    .update({
      status,
      completed_at: toMysqlDateTime(new Date()),
      error_message: errorMessage ? String(errorMessage).slice(0, 1000) : null,
    })
    .eq('id', context.runId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateResult);

  const conversationStatus = status === 'stopped' ? 'active' : 'failed';
  const conversationUpdateResult = await db
    .from('conversations')
    .update({
      latest_run_id: context.runId,
      status: conversationStatus,
    })
    .eq('id', context.conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  assertNoQueryError(conversationUpdateResult);
}

async function appendRunEvent(db, currentUser, context, event) {
  context.eventSeq += 1;

  const insertResult = await db.from('run_events').insert({
    id: randomUUID(),
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    run_id: context.runId,
    conversation_id: context.conversationId,
    seq: context.eventSeq,
    event_type: event.type,
    payload: JSON.stringify(event),
  });

  assertNoQueryError(insertResult);
}

async function createToolInvocation(db, currentUser, context, toolInvocationId) {
  const input = {
    prompt: context.prompt,
    mode: 'mock_basic_loop',
  };

  const insertResult = await db.from('tool_invocations').insert({
    id: toolInvocationId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    run_id: context.runId,
    conversation_id: context.conversationId,
    tool_name: 'mock_analysis',
    display_name: 'Mock Analysis',
    status: 'running',
    input: JSON.stringify(input),
    input_summary: '固定 Agent Run 基础闭环 mock 工具输入',
    output: JSON.stringify({}),
    output_summary: null,
    metadata: JSON.stringify({
      source: 'cloudbase-agent-run-basic-loop',
    }),
  });

  assertNoQueryError(insertResult);
}

async function completeToolInvocation(db, currentUser, context, toolInvocationId, startedAt, output) {
  const updateResult = await db
    .from('tool_invocations')
    .update({
      status: 'completed',
      output: JSON.stringify(output),
      output_summary: output.summary,
      finished_at: toMysqlDateTime(new Date()),
      elapsed_ms: Math.max(Date.now() - startedAt, 1),
      metadata: JSON.stringify({
        source: 'cloudbase-agent-run-basic-loop',
        runId: context.runId,
      }),
    })
    .eq('id', toolInvocationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateResult);
}

async function createAssistantMessage(db, currentUser, context, conversation, conclusion) {
  const messageId = randomUUID();
  const insertResult = await db.from('messages').insert({
    id: messageId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    conversation_id: context.conversationId,
    role: 'assistant',
    kind: 'text',
    content: conclusion,
    run_id: context.runId,
    client_message_id: `agent-assistant-${context.runId}`,
    status: 'completed',
    metadata: JSON.stringify({
      source: 'cloudbase-agent-run-basic-loop',
      runtimeRunId: context.runtimeRunId,
    }),
  });

  assertNoQueryError(insertResult);

  const updateConversationResult = await db
    .from('conversations')
    .update({
      message_count: normalizeNumber(conversation.message_count) + 1,
      latest_run_id: context.runId,
    })
    .eq('id', context.conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  assertNoQueryError(updateConversationResult);

  return messageId;
}

function createRunEvent(type, context, extra = {}) {
  return {
    type,
    runId: context.runId,
    usageId: context.usageId,
    clientRunId: context.clientRunId,
    conversationId: context.conversationId,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createDisconnectTracker(req, res, runId) {
  let closed = false;
  let finished = false;

  function markClosed(source) {
    if (closed) {
      return;
    }

    closed = true;

    if (!finished) {
      console.log('[workbench-agent-run-stream] basic loop stream closed', source, runId);
    }
  }

  req.on('aborted', () => markClosed('req_aborted'));
  req.on('close', () => {
    if (req.aborted) {
      markClosed('req_close');
    }
  });
  res.on('close', () => {
    if (!finished) {
      markClosed('res_close');
    }
  });

  return {
    isClosed() {
      return closed || res.destroyed || res.writableEnded;
    },
    finish() {
      finished = true;
    },
  };
}

function startSseResponse(res) {
  setCorsHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function writeSseEvent(res, event) {
  if (res.writableEnded || res.destroyed) {
    return false;
  }

  res.write(`data: ${JSON.stringify(event)}\n\n`);
  console.log('[workbench-agent-run-stream] event', event.type, event.runId);
  return true;
}

async function persistAndWriteEvent(db, currentUser, context, res, disconnect, type, extra = {}) {
  if (disconnect.isClosed()) {
    return false;
  }

  const event = createRunEvent(type, context, extra);
  await appendRunEvent(db, currentUser, context, event);

  if (!writeSseEvent(res, event)) {
    return false;
  }

  await sleep(EVENT_DELAY_MS);
  return !disconnect.isClosed();
}

function toPublicError(error) {
  const statusCode = Number(error && error.statusCode);

  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 && error.errorCode) {
    return {
      statusCode,
      errorCode: error.errorCode,
      message: error.publicMessage || error.message || 'Request failed.',
    };
  }

  return {
    statusCode: 500,
    errorCode: 'db_error',
    message: 'Agent Run basic loop request failed.',
  };
}

function sanitizeLogMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password|connection|string)=([^&\s]+)/gi, '$1=[redacted]');
}

async function runBasicAgentFlow(req, res, currentUser, body) {
  const db = getDb();
  const conversationId = readRequiredString(body.conversationId, 'Missing conversation id.');
  const conversation = await fetchConversationRecord(db, currentUser, conversationId);

  if (!conversation) {
    throw new RequestError(404, 'not_found', 'Workbench conversation was not found.');
  }

  const runId = randomUUID();
  const clientRunId = readOptionalString(body.clientRunId) || runId;
  const runtimeRunId = clientRunId;
  const context = {
    runId,
    clientRunId,
    runtimeRunId,
    conversationId,
    prompt: readOptionalString(body.prompt) || 'CloudBase Agent Run 基础闭环测试',
    usageId: null,
    eventSeq: 0,
  };

  const startedAt = Date.now();
  const quotaResult = await consumeQuota(db, currentUser, runId, runtimeRunId);
  context.usageId = quotaResult.usageId;
  await createAgentRun(db, currentUser, context);

  const disconnect = createDisconnectTracker(req, res, context.runId);
  let assistantMessageId = null;
  let didComplete = false;

  startSseResponse(res);

  try {
    if (
      !(await persistAndWriteEvent(db, currentUser, context, res, disconnect, 'run_started', {
        status: 'running',
        prompt: context.prompt,
        quota: toPublicQuota(quotaResult.quota),
      }))
    ) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    if (
      !(await persistAndWriteEvent(db, currentUser, context, res, disconnect, 'step_started', {
        stepId: 'mock_agent_basic_loop',
        title: 'CloudBase Agent Run 基础闭环',
      }))
    ) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    const toolInvocationId = randomUUID();
    const toolStartedAt = Date.now();
    await createToolInvocation(db, currentUser, context, toolInvocationId);

    if (
      !(await persistAndWriteEvent(db, currentUser, context, res, disconnect, 'tool_started', {
        toolInvocationId,
        toolName: 'mock_analysis',
        displayName: 'Mock Analysis',
      }))
    ) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    const mockToolOutput = {
      summary: 'mock 工具已完成固定分析流程。',
      facts: ['conversation_owner_verified', 'quota_consumed', 'agent_run_created'],
    };
    await completeToolInvocation(db, currentUser, context, toolInvocationId, toolStartedAt, mockToolOutput);

    if (
      !(await persistAndWriteEvent(db, currentUser, context, res, disconnect, 'tool_completed', {
        toolInvocationId,
        toolName: 'mock_analysis',
        outputSummary: mockToolOutput.summary,
      }))
    ) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    const conclusion =
      'CloudBase Agent Run 基础闭环已完成：已校验会话归属、消耗 quota、创建 agent_runs、写入 run_events、记录 mock tool_invocations，并持久化 assistant message。';

    if (
      !(await persistAndWriteEvent(db, currentUser, context, res, disconnect, 'conclusion_delta', {
        delta: conclusion,
      }))
    ) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    if (
      !(await persistAndWriteEvent(db, currentUser, context, res, disconnect, 'conclusion_completed', {
        conclusion,
        source: 'mock_fixed',
      }))
    ) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    assistantMessageId = await createAssistantMessage(db, currentUser, context, conversation, conclusion);
    const elapsedMs = Math.max(Date.now() - startedAt, 1);
    await completeAgentRun(db, currentUser, context, elapsedMs, conclusion, assistantMessageId);

    if (
      !(await persistAndWriteEvent(db, currentUser, context, res, disconnect, 'run_completed', {
        status: 'completed',
        elapsedMs,
        assistantMessageId,
      }))
    ) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    try {
      await finishUsage(db, currentUser, context.usageId, 'completed', null, {
        source: 'cloudbase-agent-run-basic-loop',
        runId: context.runId,
        assistantMessageId,
      });
    } catch (finishError) {
      console.error('[workbench-agent-run-stream] usage finish completed failed', sanitizeLogMessage(finishError.message));
    }

    didComplete = true;
    disconnect.finish();

    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  } catch (error) {
    const disconnected = error && error.errorCode === 'client_disconnected';
    const finalStatus = disconnected ? 'stopped' : 'failed';

    try {
      await failAgentRun(db, currentUser, context, finalStatus, error && error.message);
    } catch (cleanupError) {
      console.error('[workbench-agent-run-stream] run cleanup failed', sanitizeLogMessage(cleanupError.message));
    }

    try {
      await finishUsage(db, currentUser, context.usageId, finalStatus, disconnected ? 'client_disconnected' : 'run_failed', {
        source: 'cloudbase-agent-run-basic-loop',
        runId: context.runId,
      });
    } catch (cleanupError) {
      console.error('[workbench-agent-run-stream] usage cleanup failed', sanitizeLogMessage(cleanupError.message));
    }

    if (!disconnected && !res.writableEnded && !res.destroyed) {
      const failEvent = createRunEvent('run_failed', context, {
        status: 'failed',
        errorCode: 'run_failed',
      });

      try {
        await appendRunEvent(db, currentUser, context, failEvent);
      } catch (eventError) {
        console.error('[workbench-agent-run-stream] failure event persist failed', sanitizeLogMessage(eventError.message));
      }

      writeSseEvent(res, failEvent);
      res.end();
    }

    if (!didComplete && !disconnected) {
      throw error;
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendNoContent(res);
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  try {
    const currentUser = await authenticateRequest(req);
    const body = await readRequestBody(req);
    await runBasicAgentFlow(req, res, currentUser, body);
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-agent-run-stream] request failed', publicError.errorCode, logMessage);

    if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-agent-run-stream] listening on ${HOST}:${PORT}`);
});
