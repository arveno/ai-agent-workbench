const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_QUOTA_LIMIT = 20;

const QUOTA_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'quota_type',
  'quota_limit',
  'quota_used',
  'period_start',
  'period_end',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

const USAGE_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'run_id',
  'quota_type',
  'status',
  'started_at',
  'finished_at',
  'error_code',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

const VALID_FINISH_STATUSES = new Set(['completed', 'failed', 'stopped']);

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

function normalizeNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.trunc(numberValue) : fallback;
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

  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function readMetadata(value) {
  return isRecord(value) ? value : {};
}

function readBodyAction(body) {
  const action = typeof body.action === 'string' ? body.action.trim() : '';

  if (action === 'consume' || action === 'finish') {
    return action;
  }

  throw new RequestError(400, 'validation_error', 'Invalid quota action.');
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

function mapQuota(row) {
  const quotaLimit = normalizeNumber(row.quota_limit, DEFAULT_QUOTA_LIMIT);
  const quotaUsed = normalizeNumber(row.quota_used, 0);

  return {
    id: String(row.id ?? ''),
    openid: String(row._openid ?? ''),
    userId: String(row.user_id ?? ''),
    quotaType: String(row.quota_type ?? 'agent_run'),
    quotaLimit,
    quotaUsed,
    remaining: Math.max(quotaLimit - quotaUsed, 0),
    periodStart: normalizeDateTime(row.period_start),
    periodEnd: normalizeDateTime(row.period_end),
    metadata: parseJsonObject(row.metadata),
    createdAt: normalizeDateTime(row.created_at),
    updatedAt: normalizeDateTime(row.updated_at),
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

function mapUsage(row) {
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    run_id: toNullableString(row.run_id),
    quota_type: String(row.quota_type ?? 'agent_run'),
    status: String(row.status ?? 'started'),
    started_at: normalizeDateTime(row.started_at),
    finished_at: toNullableString(normalizeDateTime(row.finished_at)),
    error_code: toNullableString(row.error_code),
    created_at: normalizeDateTime(row.created_at),
    updated_at: normalizeDateTime(row.updated_at),
    metadata: parseJsonObject(row.metadata),
  };
}

function hasExpectedQuotaOwner(row, currentUser) {
  return String(row._openid ?? '') === currentUser.openid && String(row.user_id ?? '') === currentUser.userId;
}

function hasExpectedUsageOwner(row, currentUser) {
  return String(row._openid ?? '') === currentUser.openid && String(row.user_id ?? '') === currentUser.userId;
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

  const rows = extractRows(result).filter((row) => hasExpectedQuotaOwner(row, currentUser));
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

  const rows = extractRows(result).filter((row) => hasExpectedQuotaOwner(row, currentUser));
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
    metadata: JSON.stringify({}),
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
    .update({
      quota_used: nextUsed,
    })
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

async function fetchUsageById(db, currentUser, usageId) {
  const result = await db
    .from('agent_run_usage')
    .select(USAGE_COLUMNS)
    .eq('id', usageId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedUsageOwner(row, currentUser));
  return rows.length > 0 ? mapUsage(rows[0]) : null;
}

async function readQuota(currentUser) {
  const db = getDb();
  const quota = await ensureMonthlyQuota(db, currentUser);

  return {
    quota: toPublicQuota(quota),
  };
}

async function consumeQuota(currentUser, body) {
  const db = getDb();
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
    run_id: toNullableString(body.runId),
    quota_type: 'agent_run',
    status: 'started',
    metadata: JSON.stringify(readMetadata(body.metadata)),
  });

  assertNoQueryError(insertUsageResult);

  return {
    usageId,
    quota: toPublicQuota(updatedQuota),
  };
}

function readUsageId(body) {
  const usageId = typeof body.usageId === 'string' ? body.usageId.trim() : '';

  if (!usageId) {
    throw new RequestError(400, 'validation_error', 'Missing usageId.');
  }

  return usageId;
}

function readFinishStatus(body) {
  const status = typeof body.status === 'string' ? body.status.trim() : '';

  if (!VALID_FINISH_STATUSES.has(status)) {
    throw new RequestError(400, 'validation_error', 'Invalid usage status.');
  }

  return status;
}

async function finishUsage(currentUser, body) {
  const db = getDb();
  const usageId = readUsageId(body);
  const status = readFinishStatus(body);
  const existingUsage = await fetchUsageById(db, currentUser, usageId);

  if (!existingUsage) {
    throw new RequestError(404, 'not_found', 'Agent Run usage was not found.');
  }

  const updateResult = await db
    .from('agent_run_usage')
    .update({
      status,
      finished_at: toMysqlDateTime(new Date()),
      error_code: toNullableString(body.errorCode),
      metadata: JSON.stringify(readMetadata(body.metadata)),
    })
    .eq('id', usageId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateResult);

  const usage = await fetchUsageById(db, currentUser, usageId);

  if (!usage) {
    throw new Error('Updated usage was not found.');
  }

  return {
    usage,
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
    message: 'Workbench quota request failed.',
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

    if (req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        data: await readQuota(currentUser),
      });
      return;
    }

    const body = await readRequestBody(req);
    const action = readBodyAction(body);

    if (action === 'consume') {
      sendJson(res, 200, {
        ok: true,
        data: await consumeQuota(currentUser, body),
      });
      return;
    }

    if (action === 'finish') {
      sendJson(res, 200, {
        ok: true,
        data: await finishUsage(currentUser, body),
      });
      return;
    }
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-quota] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-quota] listening on ${HOST}:${PORT}`);
});
