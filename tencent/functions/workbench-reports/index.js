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

const VALID_STATUSES = new Set(['draft', 'generated', 'archived']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function toUuidOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return UUID_PATTERN.test(normalizedValue) ? normalizedValue : null;
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
    metadata: parseJsonObject(row.metadata),
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

async function fetchReportById(db, currentUser, reportId) {
  const result = await db
    .from('report_artifacts')
    .select(REPORT_COLUMNS)
    .eq('id', reportId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedReportOwner(row, currentUser));
  return rows.length > 0 ? mapReport(rows[0]) : null;
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

  return {
    reports,
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
  const insertPayload = {
    id: reportId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    conversation_id: conversationId,
    run_id: toUuidOrNull(body.runId),
    title: readTitle(body.title),
    content_markdown: readContentMarkdown(body.contentMarkdown),
    status: readStatus(body.status),
    version: 1,
    metadata: JSON.stringify(readMetadata(body.metadata)),
  };

  const insertResult = await db.from('report_artifacts').insert(insertPayload);
  assertNoQueryError(insertResult);

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

    if (req.method === 'POST') {
      const body = await readRequestBody(req);
      const report = await createReport(currentUser, body);

      sendJson(res, 200, {
        ok: true,
        data: report,
      });
      return;
    }

    const params = readGetParams(req);

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
