const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 1024;

const CONVERSATION_COLUMNS = ['id', '_openid', 'user_id', 'visibility'].join(',');
const REPORT_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'conversation_id',
  'run_id',
  'title',
  'content_markdown',
  'status',
  'version',
  'metadata',
  'created_at',
  'updated_at',
].join(',');
const RUN_SOURCE_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'run_id',
  'conversation_id',
  'tool_invocation_id',
  'retrieval_log_id',
  'document_id',
  'chunk_id',
  'citation_label',
  'source_order',
  'title',
  'preview',
  'score',
  'source_type',
  'used_in_answer',
  'no_source_reason',
  'created_at',
  'metadata',
].join(',');
const AGENT_RUN_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'conversation_id',
  'metadata',
].join(',');

const VALID_STATUSES = new Set(['draft', 'generated', 'archived']);
const VALID_RUN_REPORT_STATES = new Set(['hidden', 'pending', 'generating', 'generated', 'skipped', 'failed']);
const VALID_SOURCE_TYPES = new Set(['knowledge', 'tool', 'report', 'manual']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loadSharedModule(name) {
  const bundledSharedPath = path.join(__dirname, '_shared', `${name}.js`);
  const localSharedModule = fs.existsSync(bundledSharedPath) ? `./_shared/${name}` : `../_shared/${name}`;
  return require(localSharedModule);
}

const { authenticateRequest } = loadSharedModule('auth');
const { assertNoQueryError, extractRows, getDb, parseJsonObject } = loadSharedModule('mysql');
const {
  createAgentRunModelMetadata,
  stripLegacyModelMetadata,
} = loadSharedModule('agentRunModelMetadata');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

function compareCreatedDesc(left, right) {
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

function compareSourceOrderAsc(left, right) {
  const orderDiff = normalizeNumber(left.source_order) - normalizeNumber(right.source_order);

  if (orderDiff !== 0) {
    return orderDiff;
  }

  const createdDiff = normalizeDateTime(left.created_at).localeCompare(normalizeDateTime(right.created_at));

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value);
  return stringValue ? stringValue : null;
}

function readGetParams(req) {
  const url = new URL(req.url || '/', 'http://localhost');

  return {
    id: readQueryString(url.searchParams.get('id')),
    conversationId: readQueryString(url.searchParams.get('conversationId')),
    action: readQueryString(url.searchParams.get('action')),
  };
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

function readConversationIdFromBody(body) {
  return readQueryString(body.conversationId);
}

function readTitle(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '分析报告';
}

function readStatus(value) {
  if (typeof value === 'string' && VALID_STATUSES.has(value)) {
    return value;
  }

  return 'generated';
}

function readContentMarkdown(value) {
  const content = typeof value === 'string' ? value.trim() : '';

  if (!content) {
    throw new RequestError(400, 'validation_error', 'Report contentMarkdown is required.');
  }

  return content;
}

function readMetadata(value) {
  return isRecord(value) ? value : {};
}

function readRunReportState(value) {
  if (typeof value === 'string' && VALID_RUN_REPORT_STATES.has(value)) {
    return value;
  }

  throw new RequestError(400, 'validation_error', 'Invalid report state.');
}

function normalizeSourceType(value) {
  const sourceType = String(value || 'knowledge');
  return VALID_SOURCE_TYPES.has(sourceType) ? sourceType : 'knowledge';
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1';
}

function mapRunSource(row) {
  const metadata = parseJsonObject(row.metadata);
  const sourceOrder = normalizeNumber(row.source_order);

  return {
    id: String(row.id ?? ''),
    runId: String(row.run_id ?? ''),
    conversationId: String(row.conversation_id ?? ''),
    toolInvocationId: toNullableString(row.tool_invocation_id) || undefined,
    retrievalLogId: toNullableString(row.retrieval_log_id) || undefined,
    documentId: toNullableString(row.document_id) || undefined,
    chunkId: toNullableString(row.chunk_id) || undefined,
    citationLabel: toNullableString(row.citation_label) || undefined,
    sourceOrder,
    title: String(row.title ?? ''),
    preview: String(row.preview ?? ''),
    score: normalizeNullableNumber(row.score) ?? undefined,
    sourceType: normalizeSourceType(row.source_type),
    usedInAnswer: normalizeBoolean(row.used_in_answer),
    noSourceReason: toNullableString(row.no_source_reason) || undefined,
    createdAt: normalizeDateTime(row.created_at),
    metadata,
  };
}

function createReportMetadata(metadata, runModelMetadata = {}, options = {}) {
  const nextMetadata = options.stripRequestModelMetadata
    ? stripLegacyModelMetadata(metadata)
    : (isRecord(metadata) ? { ...metadata } : {});

  delete nextMetadata.sources;
  delete nextMetadata.sourceCount;
  delete nextMetadata.source_count;
  delete nextMetadata.sourceLineage;
  delete nextMetadata.source_lineage;
  delete nextMetadata.sourceNoSourceReason;
  delete nextMetadata.source_no_source_reason;

  return {
    ...nextMetadata,
    ...(isRecord(runModelMetadata) ? runModelMetadata : {}),
  };
}

function toUuidOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return UUID_PATTERN.test(normalizedValue) ? normalizedValue : null;
}

function readRequiredRunId(value) {
  const runId = toUuidOrNull(value);

  if (!runId) {
    throw new RequestError(400, 'validation_error', 'Canonical UUID runId is required.');
  }

  return runId;
}

function mapReport(row) {
  return {
    id: String(row.id ?? ''),
    conversation_id: String(row.conversation_id ?? ''),
    run_id: toNullableString(row.run_id),
    user_id: String(row.user_id ?? ''),
    title: String(row.title ?? '分析报告'),
    content_markdown: String(row.content_markdown ?? ''),
    status: String(row.status ?? 'generated'),
    version: normalizeNumber(row.version),
    created_at: normalizeDateTime(row.created_at),
    updated_at: normalizeDateTime(row.updated_at),
    metadata: createReportMetadata(parseJsonObject(row.metadata)),
    sources: [],
    sourceCount: 0,
    sourceLineage: 'run_sources',
    sourceNoSourceReason: null,
  };
}

function hasExpectedConversationOwner(row, currentUser) {
  return (
    String(row._openid ?? '') === currentUser.openid &&
    String(row.user_id ?? '') === currentUser.userId &&
    String(row.visibility ?? '') === 'private'
  );
}

function hasExpectedReportOwner(row, currentUser) {
  return String(row._openid ?? '') === currentUser.openid && String(row.user_id ?? '') === currentUser.userId;
}

function hasExpectedAgentRunOwner(row, currentUser, conversationId, runId) {
  return (
    String(row.id ?? '') === runId &&
    String(row.conversation_id ?? '') === conversationId &&
    String(row._openid ?? '') === currentUser.openid &&
    String(row.user_id ?? '') === currentUser.userId
  );
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

async function fetchRunSources(db, currentUser, conversationId, runId) {
  if (!runId) {
    return [];
  }

  const result = await db
    .from('run_sources')
    .select(RUN_SOURCE_COLUMNS)
    .eq('run_id', runId)
    .eq('conversation_id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  return extractRows(result)
    .filter(
      (row) =>
        String(row._openid ?? '') === currentUser.openid &&
        String(row.user_id ?? '') === currentUser.userId &&
        String(row.conversation_id ?? '') === conversationId &&
        String(row.run_id ?? '') === runId,
    )
    .sort(compareSourceOrderAsc)
    .map(mapRunSource);
}

async function readRunSourceSnapshot(db, currentUser, conversationId, runId) {
  if (!runId) {
    return {
      sources: [],
      noSourceReason: 'missing_run_id',
    };
  }

  try {
    const sources = await fetchRunSources(db, currentUser, conversationId, runId);

    return {
      sources,
      noSourceReason: sources.length > 0 ? null : 'no_run_sources',
    };
  } catch (error) {
    console.warn(
      '[workbench-reports] failed to read run_sources',
      sanitizeLogMessage(error && error.message ? error.message : 'unknown_error'),
    );

    return {
      sources: [],
      noSourceReason: 'source_query_failed',
    };
  }
}

async function readAgentRunModelMetadata(db, currentUser, conversationId, runId) {
  if (!runId) {
    return {};
  }

  const result = await db
    .from('agent_runs')
    .select(AGENT_RUN_COLUMNS)
    .eq('id', runId)
    .eq('conversation_id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedAgentRunOwner(row, currentUser, conversationId, runId));
  const run = rows.length > 0 ? rows[0] : null;

  if (!run) {
    return {};
  }

  return createAgentRunModelMetadata(parseJsonObject(run.metadata));
}

async function hydrateReportSources(db, currentUser, report) {
  const runId = toUuidOrNull(report.run_id);

  if (!runId) {
    return {
      ...report,
      sources: [],
      sourceCount: 0,
      sourceLineage: 'run_sources',
      sourceNoSourceReason: 'missing_run_id',
    };
  }

  const sourceSnapshot = await readRunSourceSnapshot(db, currentUser, report.conversation_id, runId);

  return {
    ...report,
    sources: sourceSnapshot.sources,
    sourceCount: sourceSnapshot.sources.length,
    sourceLineage: 'run_sources',
    sourceNoSourceReason: sourceSnapshot.noSourceReason,
  };
}

async function fetchReportById(db, currentUser, reportId) {
  const result = await db
    .from('report_artifacts')
    .select(REPORT_COLUMNS)
    .eq('id', reportId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedReportOwner(row, currentUser));
  return rows.length > 0 ? hydrateReportSources(db, currentUser, mapReport(rows[0])) : null;
}

async function fetchReportsByConversation(currentUser, conversationId) {
  const db = getDb();
  await assertConversationOwner(db, currentUser, conversationId);

  const result = await db
    .from('report_artifacts')
    .select(REPORT_COLUMNS)
    .eq('conversation_id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const reports = extractRows(result)
    .filter(
      (row) =>
        hasExpectedReportOwner(row, currentUser) &&
        String(row.conversation_id ?? '') === conversationId,
    )
    .sort(compareCreatedDesc)
    .map(mapReport);
  const reportsWithSources = await Promise.all(
    reports.map((report) => hydrateReportSources(db, currentUser, report)),
  );

  return {
    reports: reportsWithSources,
  };
}

async function markAgentRunReportState(db, currentUser, conversationId, runId, reportState) {
  const updateByIdResult = await db
    .from('agent_runs')
    .update({
      report_state: reportState,
    })
    .eq('id', runId)
    .eq('conversation_id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateByIdResult);
}

async function createReportStateMarker(db, currentUser, conversationId, runId, reportState, runModelMetadata = {}) {
  if (reportState !== 'skipped') {
    return null;
  }

  const metadata = createReportMetadata({
    source: 'agent-run-report-state',
    reportState,
    runId,
  }, runModelMetadata, {
    stripRequestModelMetadata: true,
  });

  const reportId = randomUUID();
  const insertResult = await db.from('report_artifacts').insert({
    id: reportId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    conversation_id: conversationId,
    run_id: runId,
    title: '报告状态',
    content_markdown: '用户已选择暂不生成报告。',
    status: 'archived',
    version: 1,
    metadata: JSON.stringify(metadata),
  });

  assertNoQueryError(insertResult);

  return reportId;
}

async function updateRunReportState(currentUser, body) {
  const db = getDb();
  const conversationId = readConversationIdFromBody(body);

  if (!conversationId) {
    throw new RequestError(400, 'validation_error', 'Missing conversation id.');
  }

  await assertConversationOwner(db, currentUser, conversationId);

  const reportState = readRunReportState(body.reportState);
  const runId = readRequiredRunId(body.runId);
  const runModelMetadata = await readAgentRunModelMetadata(db, currentUser, conversationId, runId);

  await markAgentRunReportState(db, currentUser, conversationId, runId, reportState);
  await createReportStateMarker(db, currentUser, conversationId, runId, reportState, runModelMetadata);

  return {
    runId,
    reportState,
  };
}

async function createReport(currentUser, body) {
  const db = getDb();
  const conversationId = readConversationIdFromBody(body);

  if (!conversationId) {
    throw new RequestError(400, 'validation_error', 'Missing conversation id.');
  }

  await assertConversationOwner(db, currentUser, conversationId);

  const reportId = randomUUID();
  const requestMetadata = readMetadata(body.metadata);
  const runId = readRequiredRunId(body.runId);
  const runModelMetadata = await readAgentRunModelMetadata(db, currentUser, conversationId, runId);
  const metadata = createReportMetadata(requestMetadata, runModelMetadata, {
    stripRequestModelMetadata: true,
  });
  const insertPayload = {
    id: reportId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    conversation_id: conversationId,
    run_id: runId,
    title: readTitle(body.title),
    content_markdown: readContentMarkdown(body.contentMarkdown),
    status: readStatus(body.status),
    version: 1,
    metadata: JSON.stringify(metadata),
  };

  const insertResult = await db.from('report_artifacts').insert(insertPayload);
  assertNoQueryError(insertResult);
  await markAgentRunReportState(db, currentUser, conversationId, runId, 'generated');

  const report = await fetchReportById(db, currentUser, reportId);

  if (!report) {
    throw new Error('Created report was not found.');
  }

  return report;
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
    message: 'Workbench 报告请求失败。',
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

  if (req.method !== 'GET' && req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  try {
    const currentUser = await authenticateRequest(req);
    const params = readGetParams(req);

    if (req.method === 'POST') {
      const body = await readRequestBody(req);

      if (params.action === 'run-report-state') {
        const data = await updateRunReportState(currentUser, body);

        sendJson(res, 200, {
          ok: true,
          data,
        });
        return;
      }

      const report = await createReport(currentUser, body);

      sendJson(res, 200, {
        ok: true,
        data: report,
      });
      return;
    }

    if (params.id) {
      const db = getDb();
      const report = await fetchReportById(db, currentUser, params.id);

      if (!report) {
        throw new RequestError(404, 'not_found', 'Report was not found.');
      }

      sendJson(res, 200, {
        ok: true,
        data: report,
      });
      return;
    }

    if (!params.conversationId) {
      throw new RequestError(400, 'validation_error', 'Missing conversation id.');
    }

    const data = await fetchReportsByConversation(currentUser, params.conversationId);

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-reports] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-reports] listening on ${HOST}:${PORT}`);
});
