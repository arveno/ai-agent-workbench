const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_BODY_BYTES = 1024 * 1024;

const CONVERSATION_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'title',
  'summary',
  'mode',
  'status',
  'visibility',
  'source_template_id',
  'latest_run_id',
  'message_count',
  'metadata',
  'created_at',
  'updated_at',
  'archived_at',
].join(',');

const VALID_STATUSES = new Set(['active', 'running', 'completed', 'failed', 'archived']);
const VALID_MODES = new Set(['mock', 'agent', 'mixed']);

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

function readPositiveLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function readQueryString(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  return normalizedValue || null;
}

function readStatus(value) {
  const status = readQueryString(value);

  if (!status) {
    return null;
  }

  if (!VALID_STATUSES.has(status)) {
    throw new RequestError(400, 'validation_error', 'Invalid conversation status.');
  }

  return status;
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

function readCreateTitle(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '新会话';
}

function readCreateSummary(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readCreateMode(value) {
  if (typeof value === 'string' && VALID_MODES.has(value)) {
    return value;
  }

  return 'mock';
}

function readCreateMetadata(value) {
  return isRecord(value) ? value : {};
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

function compareUpdatedDesc(left, right) {
  const leftTime = toComparableTime(left.updated_at);
  const rightTime = toComparableTime(right.updated_at);

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const updatedDiff = normalizeDateTime(right.updated_at).localeCompare(normalizeDateTime(left.updated_at));

  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  return normalizeDateTime(right.created_at).localeCompare(normalizeDateTime(left.created_at));
}

function isBeforeCursor(row, cursor) {
  const cursorTime = toComparableTime(cursor);
  const rowTime = toComparableTime(row.updated_at);

  if (cursorTime !== null && rowTime !== null) {
    return rowTime < cursorTime;
  }

  return normalizeDateTime(row.updated_at) < cursor;
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value);
  return stringValue ? stringValue : null;
}

function mapConversation(row) {
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    title: String(row.title ?? '新会话'),
    summary: toNullableString(row.summary),
    mode: String(row.mode ?? 'mock'),
    status: String(row.status ?? 'active'),
    visibility: String(row.visibility ?? 'private'),
    source_template_id: toNullableString(row.source_template_id),
    latest_run_id: toNullableString(row.latest_run_id),
    message_count: normalizeNumber(row.message_count),
    created_at: normalizeDateTime(row.created_at),
    updated_at: normalizeDateTime(row.updated_at),
    archived_at: toNullableString(normalizeDateTime(row.archived_at)),
    metadata: parseJsonObject(row.metadata),
  };
}

function hasExpectedOwner(row, currentUser) {
  return (
    String(row._openid ?? '') === currentUser.openid &&
    String(row.user_id ?? '') === currentUser.userId &&
    String(row.visibility ?? '') === 'private'
  );
}

async function fetchConversations(currentUser, params) {
  const db = getDb();
  let query = db
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  if (params.status) {
    query = query.eq('status', params.status);
  }

  const result = await query;
  assertNoQueryError(result);

  let rows = extractRows(result)
    .filter((row) => hasExpectedOwner(row, currentUser))
    .map(mapConversation);

  if (!params.status) {
    rows = rows.filter((row) => row.status !== 'archived');
  }

  if (params.cursor) {
    rows = rows.filter((row) => isBeforeCursor(row, params.cursor));
  }

  rows.sort(compareUpdatedDesc);

  const conversations = rows.slice(0, params.limit);
  const nextCursor = rows.length > params.limit ? conversations[conversations.length - 1]?.updated_at ?? null : null;

  return {
    conversations,
    nextCursor,
  };
}

async function fetchConversationById(db, currentUser, conversationId) {
  const result = await db
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedOwner(row, currentUser));
  return rows.length > 0 ? mapConversation(rows[0]) : null;
}

async function createConversation(currentUser, body) {
  const db = getDb();
  const conversationId = randomUUID();
  const insertPayload = {
    id: conversationId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    title: readCreateTitle(body.title),
    summary: readCreateSummary(body.summary),
    mode: readCreateMode(body.mode),
    status: 'active',
    visibility: 'private',
    message_count: 0,
    metadata: JSON.stringify(readCreateMetadata(body.metadata)),
  };

  const insertResult = await db.from('conversations').insert(insertPayload);
  assertNoQueryError(insertResult);

  const conversation = await fetchConversationById(db, currentUser, conversationId);

  if (!conversation) {
    throw new Error('Created conversation was not found.');
  }

  return conversation;
}

function readListParams(req) {
  const url = new URL(req.url || '/', 'http://localhost');

  return {
    limit: readPositiveLimit(url.searchParams.get('limit')),
    cursor: readQueryString(url.searchParams.get('cursor')),
    status: readStatus(url.searchParams.get('status')),
  };
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
    message: 'Workbench 会话请求失败。',
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
      const conversation = await createConversation(currentUser, body);

      sendJson(res, 200, {
        ok: true,
        data: conversation,
      });
      return;
    }

    const params = readListParams(req);
    const data = await fetchConversations(currentUser, params);

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-conversations] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-conversations] listening on ${HOST}:${PORT}`);
});
