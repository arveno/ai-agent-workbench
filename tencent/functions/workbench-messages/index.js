const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_BODY_BYTES = 1024 * 1024;

const CONVERSATION_COLUMNS = ['id', '_openid', 'user_id', 'visibility', 'message_count'].join(',');
const MESSAGE_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'conversation_id',
  'role',
  'kind',
  'content',
  'run_id',
  'client_message_id',
  'status',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

const VALID_ROLES = new Set(['user', 'assistant', 'system']);
const VALID_KINDS = new Set(['text', 'tool_summary', 'report', 'error', 'system_notice']);
const VALID_STATUSES = new Set(['pending', 'streaming', 'completed', 'failed']);
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

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value);
  return stringValue ? stringValue : null;
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

function isBeforeCursor(row, before) {
  const cursorTime = toComparableTime(before);
  const rowTime = toComparableTime(row.created_at);

  if (cursorTime !== null && rowTime !== null) {
    return rowTime < cursorTime;
  }

  return normalizeDateTime(row.created_at) < before;
}

function readConversationIdFromQuery(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return readQueryString(url.searchParams.get('conversationId'));
}

function readConversationIdFromBody(body) {
  return readQueryString(body.conversationId);
}

function readListParams(req) {
  const url = new URL(req.url || '/', 'http://localhost');

  return {
    limit: readPositiveLimit(url.searchParams.get('limit')),
    before: readQueryString(url.searchParams.get('before')),
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

function readMessageRole(value) {
  if (typeof value === 'string' && VALID_ROLES.has(value)) {
    return value;
  }

  throw new RequestError(400, 'validation_error', 'Invalid message role.');
}

function readMessageKind(value) {
  if (value === undefined || value === null || value === '') {
    return 'text';
  }

  if (typeof value === 'string' && VALID_KINDS.has(value)) {
    return value;
  }

  throw new RequestError(400, 'validation_error', 'Invalid message kind.');
}

function readMessageStatus(value) {
  if (value === undefined || value === null || value === '') {
    return 'completed';
  }

  if (typeof value === 'string' && VALID_STATUSES.has(value)) {
    return value;
  }

  throw new RequestError(400, 'validation_error', 'Invalid message status.');
}

function readMessageContent(value) {
  const content = typeof value === 'string' ? value : '';

  if (!content.trim()) {
    throw new RequestError(400, 'validation_error', 'Message content is required.');
  }

  return content;
}

function readClientMessageId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toUuidOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return UUID_PATTERN.test(normalizedValue) ? normalizedValue : null;
}

function readMetadata(value) {
  return isRecord(value) ? value : {};
}

function mapMessage(row) {
  return {
    id: String(row.id ?? ''),
    conversation_id: String(row.conversation_id ?? ''),
    user_id: String(row.user_id ?? ''),
    role: String(row.role ?? 'user'),
    kind: String(row.kind ?? 'text'),
    content: String(row.content ?? ''),
    run_id: toNullableString(row.run_id),
    client_message_id: toNullableString(row.client_message_id),
    status: String(row.status ?? 'completed'),
    created_at: normalizeDateTime(row.created_at),
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

function hasExpectedMessageOwner(row, currentUser, conversationId) {
  return (
    String(row._openid ?? '') === currentUser.openid &&
    String(row.user_id ?? '') === currentUser.userId &&
    String(row.conversation_id ?? '') === conversationId
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

async function fetchMessageById(db, currentUser, messageId) {
  const result = await db
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('id', messageId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter(
    (row) => String(row._openid ?? '') === currentUser.openid && String(row.user_id ?? '') === currentUser.userId,
  );
  return rows.length > 0 ? mapMessage(rows[0]) : null;
}

async function findExistingMessage(db, currentUser, clientMessageId) {
  const result = await db
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('client_message_id', clientMessageId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter(
    (row) =>
      String(row._openid ?? '') === currentUser.openid &&
      String(row.user_id ?? '') === currentUser.userId &&
      String(row.client_message_id ?? '') === clientMessageId,
  );
  return rows.length > 0 ? mapMessage(rows[0]) : null;
}

async function fetchMessages(currentUser, conversationId, params) {
  const db = getDb();
  const conversation = await fetchConversationRecord(db, currentUser, conversationId);

  if (!conversation) {
    throw new RequestError(404, 'not_found', 'Workbench conversation was not found.');
  }

  const result = await db
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  let rows = extractRows(result).filter((row) => hasExpectedMessageOwner(row, currentUser, conversationId));

  if (params.before) {
    rows = rows.filter((row) => isBeforeCursor(row, params.before));
  }

  rows.sort(compareCreatedDesc);

  const pageRows = rows.slice(0, params.limit);
  const messages = pageRows.slice().reverse().map(mapMessage);
  const nextCursor = rows.length > params.limit ? messages[0]?.created_at ?? null : null;

  return {
    messages,
    nextCursor,
  };
}

function isDuplicateKeyError(error) {
  const message = String((error && error.message) || error || '').toLowerCase();
  return message.includes('duplicate') || message.includes('uk_messages_user_client_message');
}

async function updateConversationAfterMessage(db, currentUser, conversation) {
  const nextMessageCount = normalizeNumber(conversation.message_count) + 1;
  const result = await db
    .from('conversations')
    .update({ message_count: nextMessageCount })
    .eq('id', String(conversation.id ?? ''))
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId)
    .eq('visibility', 'private');

  assertNoQueryError(result);
}

async function createMessage(currentUser, conversationId, body) {
  const db = getDb();
  const conversation = await fetchConversationRecord(db, currentUser, conversationId);

  if (!conversation) {
    throw new RequestError(404, 'not_found', 'Workbench conversation was not found.');
  }

  const clientMessageId = readClientMessageId(body.clientMessageId);

  if (clientMessageId) {
    const existingMessage = await findExistingMessage(db, currentUser, clientMessageId);

    if (existingMessage) {
      return existingMessage;
    }
  }

  const messageId = randomUUID();
  const insertPayload = {
    id: messageId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    conversation_id: conversationId,
    role: readMessageRole(body.role),
    kind: readMessageKind(body.kind),
    content: readMessageContent(body.content),
    run_id: toUuidOrNull(body.runId),
    client_message_id: clientMessageId,
    status: readMessageStatus(body.status),
    metadata: JSON.stringify(readMetadata(body.metadata)),
  };

  try {
    const insertResult = await db.from('messages').insert(insertPayload);
    assertNoQueryError(insertResult);
  } catch (error) {
    if (clientMessageId && isDuplicateKeyError(error)) {
      const existingMessage = await findExistingMessage(db, currentUser, clientMessageId);

      if (existingMessage) {
        return existingMessage;
      }
    }

    throw error;
  }

  const message = await fetchMessageById(db, currentUser, messageId);

  if (!message) {
    throw new Error('Created message was not found.');
  }

  await updateConversationAfterMessage(db, currentUser, conversation);

  return message;
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
    message: 'Workbench 消息请求失败。',
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
      const conversationId = readConversationIdFromBody(body);

      if (!conversationId) {
        throw new RequestError(400, 'validation_error', 'Missing conversation id.');
      }

      const message = await createMessage(currentUser, conversationId, body);

      sendJson(res, 200, {
        ok: true,
        data: message,
      });
      return;
    }

    const conversationId = readConversationIdFromQuery(req);

    if (!conversationId) {
      throw new RequestError(400, 'validation_error', 'Missing conversation id.');
    }

    const params = readListParams(req);
    const data = await fetchMessages(currentUser, conversationId, params);

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-messages] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-messages] listening on ${HOST}:${PORT}`);
});
