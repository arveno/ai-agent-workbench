const http = require('node:http');
const cloudbase = require('@cloudbase/node-sdk');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';

const app = cloudbase.init({
  env: 'ai-agent-workbench-poc-d6731923d',
});

const db = app.rdb();

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function compareTemplateRows(a, b) {
  const sortDiff = normalizeNumber(a.sort_order) - normalizeNumber(b.sort_order);

  if (sortDiff !== 0) {
    return sortDiff;
  }

  return normalizeDateTime(a.created_at).localeCompare(normalizeDateTime(b.created_at));
}

function extractRows(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (!result || typeof result !== 'object') {
    return [];
  }

  const data = result.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  if (Array.isArray(data.executeResultList)) {
    return data.executeResultList;
  }

  if (Array.isArray(data.records)) {
    return data.records;
  }

  if (Array.isArray(data.rows)) {
    return data.rows;
  }

  if (Array.isArray(data.list)) {
    return data.list;
  }

  return [];
}

function assertNoQueryError(result) {
  const error = result && result.error;

  if (!error) {
    return;
  }

  if (typeof error === 'string') {
    throw new Error(error);
  }

  if (error && typeof error === 'object') {
    throw new Error(error.message || error.errMsg || 'CloudBase MySQL query failed');
  }

  throw new Error('CloudBase MySQL query failed');
}

function hasPublicVisibility(row) {
  return row.visibility === 'demo' || row.visibility === 'system';
}

function mapConversation(row) {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    category: String(row.category ?? 'intro'),
    visibility: String(row.visibility ?? 'demo'),
    seed_messages: parseJsonArray(row.seed_messages),
    seed_runs: parseJsonArray(row.seed_runs),
    seed_reports: parseJsonArray(row.seed_reports),
    sort_order: normalizeNumber(row.sort_order),
    is_enabled: normalizeBoolean(row.is_enabled),
    created_at: normalizeDateTime(row.created_at),
    updated_at: normalizeDateTime(row.updated_at),
    metadata: parseJsonObject(row.metadata),
  };
}

async function fetchDemoConversations() {
  const result = await db
    .from('demo_conversation_templates')
    .select(
      'id,title,description,category,visibility,seed_messages,seed_runs,seed_reports,sort_order,is_enabled,metadata,created_at,updated_at',
    )
    .eq('is_enabled', 1);

  assertNoQueryError(result);

  return extractRows(result)
    .filter((row) => normalizeBoolean(row.is_enabled) && hasPublicVisibility(row))
    .sort(compareTemplateRows)
    .map(mapConversation);
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
    const conversations = await fetchDemoConversations();
    sendJson(res, 200, {
      ok: true,
      data: {
        conversations,
      },
    });
  } catch (error) {
    console.error('[demo-conversations] query failed', error && error.message ? error.message : error);
    sendError(res, 500, 'db_error', '读取示例会话失败。');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[demo-conversations] listening on ${HOST}:${PORT}`);
});
