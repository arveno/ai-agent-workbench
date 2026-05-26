const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_RESULTS_LIMIT = 20;
const MAX_RESULTS_LIMIT = 50;
const ROUTE_PATH = '/api/workbench/evaluations';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CASE_COLUMNS = [
  'id',
  'title',
  'question',
  'category',
  'expected_intent',
  'expected_tools',
  'expected_rag',
  'expected_report',
  'expected_conclusion_points',
  'is_active',
  'sort_order',
  'metadata',
].join(',');
const RESULT_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'case_id',
  'conversation_id',
  'run_id',
  'verdict',
  'bad_case_reason',
  'human_note',
  'actual_summary',
  'model_trace',
  'tool_summary',
  'rag_summary',
  'report_summary',
  'metadata',
  'created_at',
  'updated_at',
].join(',');
const CONVERSATION_COLUMNS = ['id', '_openid', 'user_id', 'visibility'].join(',');
const AGENT_RUN_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'conversation_id',
  'metadata',
  'created_at',
].join(',');

const VALID_VERDICTS = new Set(['pass', 'fail', 'unknown']);
const FORBIDDEN_RAW_FIELDS = new Set([
  'runEvents',
  'run_events',
  'rawEvents',
  'rawRunEvents',
  'toolRawPayload',
  'rawToolPayload',
  'rawToolInput',
  'rawToolOutput',
  'rawToolInputs',
  'rawToolOutputs',
  'toolInput',
  'toolOutput',
  'toolInputs',
  'toolOutputs',
  'rawInput',
  'rawOutput',
]);

function loadSharedModule(name) {
  const bundledSharedPath = path.join(__dirname, '_shared', `${name}.js`);
  const localSharedModule = fs.existsSync(bundledSharedPath) ? `./_shared/${name}` : `../_shared/${name}`;
  return require(localSharedModule);
}

const { authenticateRequest } = loadSharedModule('auth');
const { assertNoQueryError, extractRows, getDb, parseJsonArray, parseJsonObject } = loadSharedModule('mysql');
const {
  extractLangSmithTraceFromMetadata,
  submitLangSmithEvaluationFeedback,
} = loadSharedModule('langsmithObservability');
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

function readRequestUrl(req) {
  return new URL(req.url || '/', 'http://localhost');
}

function assertAllowedRoute(url) {
  if (url.pathname !== '/' && url.pathname !== ROUTE_PATH) {
    throw new RequestError(404, 'not_found', 'Route not found.');
  }
}

function readQueryString(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  return normalizedValue || null;
}

function readPositiveLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_RESULTS_LIMIT;
  }

  return Math.min(parsed, MAX_RESULTS_LIMIT);
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

function compareCasesAsc(left, right) {
  const sortDiff = normalizeNumber(left.sort_order) - normalizeNumber(right.sort_order);

  if (sortDiff !== 0) {
    return sortDiff;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
}

function isActiveFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function readRequiredString(body, fieldName) {
  const value = toNullableString(body[fieldName]);

  if (!value) {
    throw new RequestError(400, 'validation_error', `Missing ${fieldName}.`);
  }

  return value;
}

function readOptionalString(body, fieldName, maxLength = 0) {
  if (body[fieldName] === null || body[fieldName] === undefined || body[fieldName] === '') {
    return null;
  }

  if (typeof body[fieldName] !== 'string') {
    throw new RequestError(400, 'validation_error', `${fieldName} must be a string.`);
  }

  const value = body[fieldName].trim();

  if (!value) {
    return null;
  }

  if (maxLength > 0 && value.length > maxLength) {
    throw new RequestError(400, 'validation_error', `${fieldName} is too long.`);
  }

  return value;
}

function readOptionalRunId(value) {
  const runId = typeof value === 'string' ? value.trim() : '';

  if (!runId) {
    return null;
  }

  if (!UUID_PATTERN.test(runId)) {
    throw new RequestError(400, 'validation_error', 'runId must be a canonical UUID.');
  }

  return runId;
}

function readVerdict(value) {
  const verdict = typeof value === 'string' ? value.trim() : '';

  if (!VALID_VERDICTS.has(verdict)) {
    throw new RequestError(400, 'invalid_verdict', 'Invalid evaluation verdict.');
  }

  return verdict;
}

function readRequiredObject(body, fieldName) {
  const value = body[fieldName];

  if (!isRecord(value)) {
    throw new RequestError(400, 'validation_error', `${fieldName} must be an object.`);
  }

  return value;
}

function readOptionalObject(body, fieldName) {
  const value = body[fieldName];

  if (value === null || value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new RequestError(400, 'validation_error', `${fieldName} must be an object.`);
  }

  return value;
}

function readRequiredArray(body, fieldName) {
  const value = body[fieldName];

  if (!Array.isArray(value)) {
    throw new RequestError(400, 'validation_error', `${fieldName} must be an array.`);
  }

  return value;
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

function findForbiddenRawField(value, pathParts = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findForbiddenRawField(value[index], pathParts.concat(String(index)));

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of Object.keys(value)) {
    const nextPathParts = pathParts.concat(key);

    if (FORBIDDEN_RAW_FIELDS.has(key)) {
      return nextPathParts.join('.');
    }

    const match = findForbiddenRawField(value[key], nextPathParts);

    if (match) {
      return match;
    }
  }

  return null;
}

function assertNoForbiddenRawFields(body) {
  const forbiddenField = findForbiddenRawField(body);

  if (forbiddenField) {
    throw new RequestError(400, 'validation_error', `Raw evaluation payload is not allowed: ${forbiddenField}.`);
  }
}

function readGetParams(req) {
  const url = readRequestUrl(req);

  return {
    url,
    resource: readQueryString(url.searchParams.get('resource')),
    category: readQueryString(url.searchParams.get('category')),
    caseId: readQueryString(url.searchParams.get('caseId')),
    runId: readOptionalRunId(url.searchParams.get('runId')),
    conversationId: readQueryString(url.searchParams.get('conversationId')),
    limit: readPositiveLimit(url.searchParams.get('limit')),
  };
}

function readPostResource(url, body) {
  const resource = readQueryString(body.resource) || readQueryString(url.searchParams.get('resource'));
  const action = readQueryString(body.action) || readQueryString(url.searchParams.get('action'));

  if (resource === 'results' || action === 'createResult') {
    return 'results';
  }

  throw new RequestError(400, 'validation_error', 'Invalid evaluation resource.');
}

function hasExpectedOwner(row, currentUser) {
  return String(row._openid ?? '') === currentUser.openid && String(row.user_id ?? '') === currentUser.userId;
}

function mapCase(row) {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    question: String(row.question ?? ''),
    category: String(row.category ?? ''),
    expectedIntent: toNullableString(row.expected_intent),
    expectedTools: parseJsonArray(row.expected_tools),
    expectedRag: parseJsonObject(row.expected_rag),
    expectedReport: parseJsonObject(row.expected_report),
    expectedConclusionPoints: parseJsonArray(row.expected_conclusion_points),
    metadata: parseJsonObject(row.metadata),
    sortOrder: normalizeNumber(row.sort_order),
  };
}

function mapResult(row) {
  return {
    id: String(row.id ?? ''),
    caseId: String(row.case_id ?? ''),
    conversationId: toNullableString(row.conversation_id),
    runId: toNullableString(row.run_id),
    verdict: String(row.verdict ?? 'unknown'),
    badCaseReason: toNullableString(row.bad_case_reason),
    humanNote: toNullableString(row.human_note),
    actualSummary: parseJsonObject(row.actual_summary),
    modelTrace: parseJsonObject(row.model_trace),
    toolSummary: parseJsonArray(row.tool_summary),
    ragSummary: parseJsonObject(row.rag_summary),
    reportSummary: parseJsonObject(row.report_summary),
    metadata: parseJsonObject(row.metadata),
    createdAt: normalizeDateTime(row.created_at),
    updatedAt: normalizeDateTime(row.updated_at),
  };
}

function createEvaluationModelTrace(runModelMetadata, hasCanonicalRun) {
  return hasCanonicalRun && isRecord(runModelMetadata.modelTrace) ? runModelMetadata.modelTrace : {};
}

function createPayloadMetadata(payloadMetadata) {
  return stripLegacyModelMetadata(payloadMetadata);
}

function createEvaluationMetadata(payloadMetadata, runModelMetadata, langSmithEvaluation) {
  return {
    ...createPayloadMetadata(payloadMetadata),
    ...(isRecord(runModelMetadata) ? runModelMetadata : {}),
    source: 'workbench-evaluation',
    resultVersion: 1,
    langSmithEvaluation,
  };
}

async function fetchCases(params) {
  const db = getDb();
  let query = db.from('eval_cases').select(CASE_COLUMNS).eq('is_active', 1);

  if (params.category) {
    query = query.eq('category', params.category);
  }

  const result = await query;
  assertNoQueryError(result);

  const cases = extractRows(result)
    .filter(
      (row) =>
        isActiveFlag(row.is_active) &&
        (!params.category || String(row.category ?? '') === params.category),
    )
    .sort(compareCasesAsc)
    .map(mapCase);

  return {
    cases,
  };
}

async function fetchCaseById(db, caseId) {
  const result = await db.from('eval_cases').select(CASE_COLUMNS).eq('id', caseId);
  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => String(row.id ?? '') === caseId);
  return rows.length > 0 ? rows[0] : null;
}

async function fetchConversationRecord(db, currentUser, conversationId) {
  const result = await db
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', conversationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedOwner(row, currentUser));
  return rows.length > 0 ? rows[0] : null;
}

async function assertConversationOwner(db, currentUser, conversationId) {
  const conversation = await fetchConversationRecord(db, currentUser, conversationId);

  if (!conversation) {
    throw new RequestError(404, 'conversation_not_found', 'Workbench conversation was not found.');
  }

  return conversation;
}

async function fetchRunById(db, currentUser, runId) {
  const result = await db
    .from('agent_runs')
    .select(AGENT_RUN_COLUMNS)
    .eq('id', runId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedOwner(row, currentUser));
  return rows.length > 0 ? rows[0] : null;
}

async function fetchResults(currentUser, params) {
  const db = getDb();
  let query = db
    .from('eval_results')
    .select(RESULT_COLUMNS)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  if (params.caseId) {
    query = query.eq('case_id', params.caseId);
  }

  if (params.runId) {
    query = query.eq('run_id', params.runId);
  }

  if (params.conversationId) {
    query = query.eq('conversation_id', params.conversationId);
  }

  const result = await query;
  assertNoQueryError(result);

  const results = extractRows(result)
    .filter(
      (row) => {
        if (!hasExpectedOwner(row, currentUser)) {
          return false;
        }

        if (params.caseId && String(row.case_id ?? '') !== params.caseId) {
          return false;
        }

        if (params.runId && String(row.run_id ?? '') !== params.runId) {
          return false;
        }

        if (params.conversationId && String(row.conversation_id ?? '') !== params.conversationId) {
          return false;
        }

        return true;
      },
    )
    .sort(compareCreatedDesc)
    .slice(0, params.limit)
    .map(mapResult);

  return {
    results,
  };
}

async function fetchResultById(db, currentUser, resultId) {
  const result = await db
    .from('eval_results')
    .select(RESULT_COLUMNS)
    .eq('id', resultId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(result);

  const rows = extractRows(result).filter((row) => hasExpectedOwner(row, currentUser));
  return rows.length > 0 ? mapResult(rows[0]) : null;
}

function readCreateResultPayload(body) {
  assertNoForbiddenRawFields(body);

  return {
    caseId: readRequiredString(body, 'caseId'),
    conversationId: readOptionalString(body, 'conversationId'),
    runId: readOptionalRunId(body.runId),
    verdict: readVerdict(body.verdict),
    badCaseReason: readOptionalString(body, 'badCaseReason', 128),
    humanNote: readOptionalString(body, 'humanNote'),
    actualSummary: readRequiredObject(body, 'actualSummary'),
    toolSummary: readRequiredArray(body, 'toolSummary'),
    ragSummary: readRequiredObject(body, 'ragSummary'),
    reportSummary: readRequiredObject(body, 'reportSummary'),
    metadata: readOptionalObject(body, 'metadata'),
  };
}

async function createResult(currentUser, body) {
  const payload = readCreateResultPayload(body);
  const db = getDb();
  const evaluationCase = await fetchCaseById(db, payload.caseId);

  if (!evaluationCase) {
    throw new RequestError(404, 'case_not_found', 'Evaluation case was not found.');
  }

  if (!isActiveFlag(evaluationCase.is_active)) {
    throw new RequestError(400, 'case_inactive', 'Evaluation case is inactive.');
  }

  if (payload.conversationId) {
    await assertConversationOwner(db, currentUser, payload.conversationId);
  }

  let run = null;

  if (payload.runId) {
    run = await fetchRunById(db, currentUser, payload.runId);
  }

  if (payload.runId && !run) {
    throw new RequestError(404, 'run_not_found', 'Workbench run was not found.');
  }

  const runConversationId = run ? toNullableString(run.conversation_id) : null;

  if (payload.conversationId && runConversationId !== payload.conversationId) {
    throw new RequestError(404, 'run_not_found', 'Workbench run was not found.');
  }

  const resultId = randomUUID();
  const runMetadata = run ? parseJsonObject(run.metadata) : {};
  const hasCanonicalRun = Boolean(run);
  const runModelMetadata = run
    ? createAgentRunModelMetadata(runMetadata)
    : {};
  const modelTrace = createEvaluationModelTrace(runModelMetadata, hasCanonicalRun);
  const langSmithEvaluation = await submitLangSmithEvaluationFeedback({
    evaluationId: resultId,
    runId: run ? String(run.id ?? '') : null,
    conversationId: payload.conversationId || runConversationId,
    caseId: payload.caseId,
    verdict: payload.verdict,
    badCaseReason: payload.badCaseReason,
    humanNote: payload.humanNote,
    langSmithTrace: extractLangSmithTraceFromMetadata(runMetadata),
  });
  const insertPayload = {
    id: resultId,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    case_id: payload.caseId,
    conversation_id: payload.conversationId || runConversationId,
    run_id: run ? String(run.id ?? '') : null,
    verdict: payload.verdict,
    bad_case_reason: payload.badCaseReason,
    human_note: payload.humanNote,
    actual_summary: JSON.stringify(payload.actualSummary),
    model_trace: JSON.stringify(modelTrace),
    tool_summary: JSON.stringify(payload.toolSummary),
    rag_summary: JSON.stringify(payload.ragSummary),
    report_summary: JSON.stringify(payload.reportSummary),
    metadata: JSON.stringify(createEvaluationMetadata(
      payload.metadata,
      runModelMetadata,
      langSmithEvaluation,
    )),
  };

  const insertResult = await db.from('eval_results').insert(insertPayload);
  assertNoQueryError(insertResult);

  const result = await fetchResultById(db, currentUser, resultId);

  if (!result) {
    throw new Error('Created evaluation result was not found.');
  }

  return {
    result,
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
    message: 'Workbench Evaluation 请求失败。',
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
    const url = readRequestUrl(req);
    assertAllowedRoute(url);

    if (req.method === 'GET') {
      const params = readGetParams(req);

      if (params.resource === 'cases') {
        const data = await fetchCases(params);

        sendJson(res, 200, {
          ok: true,
          data,
        });
        return;
      }

      if (params.resource === 'results') {
        const currentUser = await authenticateRequest(req);
        const data = await fetchResults(currentUser, params);

        sendJson(res, 200, {
          ok: true,
          data,
        });
        return;
      }

      throw new RequestError(400, 'validation_error', 'Invalid evaluation resource.');
    }

    const currentUser = await authenticateRequest(req);
    const body = await readRequestBody(req);
    readPostResource(url, body);

    const data = await createResult(currentUser, body);

    sendJson(res, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[workbench-evaluations] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-evaluations] listening on ${HOST}:${PORT}`);
});
