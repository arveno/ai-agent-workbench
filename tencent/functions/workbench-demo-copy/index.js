const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 1024;

const TEMPLATE_COLUMNS = [
  'id',
  'title',
  'description',
  'category',
  'visibility',
  'seed_messages',
  'is_enabled',
].join(',');

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

const VALID_ROLES = new Set(['user', 'assistant', 'system']);
const VALID_KINDS = new Set(['text', 'tool_summary', 'report', 'error', 'system_notice']);
const VALID_STATUSES = new Set(['pending', 'streaming', 'completed', 'failed']);

function loadSharedModule(name) {
  const bundledSharedPath = path.join(__dirname, '_shared', `${name}.js`);
  const localSharedModule = fs.existsSync(bundledSharedPath) ? `./_shared/${name}` : `../_shared/${name}`;
  return require(localSharedModule);
}

const { authenticateRequest } = loadSharedModule('auth');
const { assertNoQueryError, extractRows, getDb, parseJsonArray, parseJsonObject } = loadSharedModule('mysql');

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

function readTemplateId(body) {
  return typeof body.templateId === 'string' && body.templateId.trim() ? body.templateId.trim() : null;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1';
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

function hasTemplateVisibility(row) {
  return row.visibility === 'demo' || row.visibility === 'system';
}

function normalizeSeedMessage(value) {
  if (!isRecord(value) || typeof value.content !== 'string' || !VALID_ROLES.has(value.role)) {
    return null;
  }

  const kind = value.kind === undefined || value.kind === null || value.kind === '' ? 'text' : value.kind;
  const status = value.status === undefined || value.status === null || value.status === '' ? 'completed' : value.status;

  if (!VALID_KINDS.has(kind) || !VALID_STATUSES.has(status)) {
    return null;
  }

  return {
    role: value.role,
    kind,
    content: value.content,
    status,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
}

function normalizeSeedMessages(value) {
  return parseJsonArray(value)
    .map((message) => normalizeSeedMessage(message))
    .filter((message) => message !== null);
}

async function fetchTemplate(db, templateId) {
  const result = await db
    .from('demo_conversation_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', templateId)
    .eq('is_enabled', 1);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => normalizeBoolean(row.is_enabled) && hasTemplateVisibility(row));
  return rows.length > 0 ? rows[0] : null;
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

  const rows = extractRows(result).filter(
    (row) =>
      String(row._openid ?? '') === currentUser.openid &&
      String(row.user_id ?? '') === currentUser.userId &&
      String(row.visibility ?? '') === 'private',
  );
  return rows.length > 0 ? mapConversation(rows[0]) : null;
}

async function bestEffortDeleteConversation(db, currentUser, conversationId) {
  try {
    const result = await db
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('_openid', currentUser.openid)
      .eq('user_id', currentUser.userId);

    assertNoQueryError(result);
  } catch (error) {
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : error);
    console.error('[workbench-demo-copy] compensation cleanup failed', logMessage);
  }
}

async function insertSeedMessages(db, currentUser, conversationId, templateId, seedMessages) {
  for (let index = 0; index < seedMessages.length; index += 1) {
    const message = seedMessages[index];
    const insertPayload = {
      id: randomUUID(),
      _openid: currentUser.openid,
      user_id: currentUser.userId,
      conversation_id: conversationId,
      role: message.role,
      kind: message.kind,
      content: message.content,
      status: message.status,
      client_message_id: `demo_${templateId}_${index}_${randomUUID()}`,
      metadata: JSON.stringify({
        ...message.metadata,
        source: 'demo-copy',
        templateId,
        templateMessageIndex: index,
      }),
    };

    const insertResult = await db.from('messages').insert(insertPayload);
    assertNoQueryError(insertResult);
  }
}

async function copyDemoConversation(currentUser, templateId) {
  const db = getDb();
  const template = await fetchTemplate(db, templateId);

  if (!template) {
    throw new RequestError(404, 'not_found', 'Demo conversation template was not found.');
  }

  const seedMessages = normalizeSeedMessages(template.seed_messages);
  const conversationId = randomUUID();
  const copiedAt = new Date().toISOString();
  const conversationPayload = {
    id: conversationId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    title: String(template.title ?? '新会话'),
    summary: String(template.description ?? ''),
    mode: 'mock',
    status: 'active',
    visibility: 'private',
    source_template_id: templateId,
    message_count: seedMessages.length,
    metadata: JSON.stringify({
      source: 'demo-copy',
      templateId,
      templateCategory: String(template.category ?? ''),
      copiedAt,
    }),
  };

  const insertConversationResult = await db.from('conversations').insert(conversationPayload);
  assertNoQueryError(insertConversationResult);

  try {
    await insertSeedMessages(db, currentUser, conversationId, templateId, seedMessages);
  } catch (error) {
    await bestEffortDeleteConversation(db, currentUser, conversationId);
    throw error;
  }

  const conversation = await fetchConversationById(db, currentUser, conversationId);

  if (!conversation) {
    throw new Error('Created conversation was not found.');
  }

  return {
    conversation,
    messagesCount: seedMessages.length,
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
    message: '复制示例会话失败。',
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

  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  try {
    const currentUser = await authenticateRequest(req);
    const body = await readRequestBody(req);
    const templateId = readTemplateId(body);

    if (!templateId) {
      throw new RequestError(400, 'validation_error', 'Missing templateId.');
    }

    const data = await copyDemoConversation(currentUser, templateId);

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-demo-copy] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-demo-copy] listening on ${HOST}:${PORT}`);
});
