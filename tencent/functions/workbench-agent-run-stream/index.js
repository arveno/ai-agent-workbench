const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 1024;
const EVENT_DELAY_MS = 450;
const DEFAULT_QUOTA_LIMIT = 20;
const MAX_TOOL_ROWS = 20;

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
const TEACHING_METRICS_COLUMNS = [
  'id',
  'month',
  'grade',
  'class_name',
  'subject',
  'avg_score',
  'attendance_rate',
  'homework_completion_rate',
  'warning_count',
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
const { getModelGatewayConfig, normalizeModelError, streamChatCompletion } = loadSharedModule('modelGateway');
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

class DataToolError extends Error {
  constructor(fallbackReason, publicMessage) {
    super(publicMessage);
    this.name = 'DataToolError';
    this.fallbackReason = fallbackReason;
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

async function consumeQuota(db, currentUser, runId, runtimeRunId, source = 'cloudbase-agent-run-basic-loop') {
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
      source,
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
    intent: context.intent || 'unknown',
    prompt: context.prompt,
    plan: JSON.stringify(context.planSnapshot || {}),
    data_source_snapshot: JSON.stringify(context.dataSourceSnapshot || { source: 'mock' }),
    chart_data: JSON.stringify({}),
    conclusion: null,
    conclusion_source: null,
    report_state: context.reportState || 'hidden',
    metadata: JSON.stringify({
      source: context.agentMode === 'real' ? 'cloudbase-agent-run-real' : 'cloudbase-agent-run-basic-loop',
      clientRunId: context.clientRunId,
      provider: context.provider || 'mock',
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

async function completeAgentRun(db, currentUser, context, elapsedMs, conclusion, assistantMessageId, options = {}) {
  const completedAt = toMysqlDateTime(new Date());
  const updateRunResult = await db
    .from('agent_runs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      elapsed_ms: elapsedMs,
      intent: context.intent || 'unknown',
      plan: JSON.stringify(context.planSnapshot || {}),
      data_source_snapshot: JSON.stringify(context.dataSourceSnapshot || {}),
      conclusion,
      conclusion_source: options.conclusionSource || context.conclusionSource || 'fallback',
      report_state: options.reportState || context.reportState || 'hidden',
      chart_data: JSON.stringify(options.chartData || {
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
      intent: context.intent || 'unknown',
      plan: JSON.stringify(context.planSnapshot || {}),
      data_source_snapshot: JSON.stringify(context.dataSourceSnapshot || {}),
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

async function createAssistantMessage(db, currentUser, context, conversation, conclusion, metadata = {}) {
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
      source: metadata.source || context.conclusionSource || 'fallback',
      conclusionSource: metadata.conclusionSource || context.conclusionSource || 'fallback',
      fallbackReason: metadata.fallbackReason || null,
      modelProvider: metadata.modelProvider || context.modelDiagnostics?.modelProvider || null,
      modelName: metadata.modelName || context.modelDiagnostics?.modelName || null,
      modelErrorType: metadata.modelErrorType || context.modelDiagnostics?.modelErrorType || null,
      modelHttpStatus: metadata.modelHttpStatus || context.modelDiagnostics?.modelHttpStatus || null,
      modelErrorMessage: metadata.modelErrorMessage || context.modelDiagnostics?.modelErrorMessage || null,
      agentMode: context.agentMode || 'basic',
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

function nowIso() {
  return new Date().toISOString();
}

function readProvider() {
  return 'cloudbase_mysql';
}

function getDataSourceSnapshot() {
  return {
    provider: 'cloudbase_mysql',
    name: 'CloudBase MySQL / teaching_metrics',
    typeLabel: 'CloudBase MySQL',
    schema: 'public_demo',
    tableName: 'teaching_metrics',
  };
}

function planToRunSnapshot(plan) {
  return {
    intent: plan.intent,
    shouldUseDataAnalysis: plan.shouldUseDataAnalysis,
    reason: plan.reason,
    metric: plan.metric,
    groupBy: plan.groupBy,
    timeRangeLabel: plan.timeRange && plan.timeRange.type !== 'none' ? plan.timeRange.label : undefined,
    comparison: plan.comparison,
  };
}

function createRunSnapshot(context, options = {}) {
  const createdAt = context.createdAt || nowIso();
  const plan = options.plan || context.plan;
  const intent = plan?.intent || context.intent || 'unknown';

  return {
    id: context.runId,
    mode: 'agent',
    status: options.status || 'running',
    intent,
    prompt: context.prompt,
    plan: plan ? planToRunSnapshot(plan) : {
      intent: 'unknown',
      shouldUseDataAnalysis: false,
      reason: '正在判断任务类型',
    },
    dataSource: context.dataSourceSnapshot || getDataSourceSnapshot(),
    steps: options.steps || context.steps || [],
    toolInvocations: options.toolInvocations || context.toolInvocations || [],
    chartData: options.chartData || context.chartData,
    conclusion: options.conclusion || context.conclusion || '',
    conclusionSource: options.conclusionSource || context.conclusionSource || 'none',
    conclusionNotice: options.conclusionNotice || context.conclusionNotice,
    reportState: options.reportState || context.reportState || 'hidden',
    createdAt,
    updatedAt: nowIso(),
    startedAt: createdAt,
  };
}

function createRunStep(id, title, status, description) {
  const timestamp = nowIso();

  return {
    id,
    title,
    description,
    status,
    startedAt: timestamp,
    completedAt: status === 'success' ? timestamp : undefined,
  };
}

function createToolEventTool(params) {
  return {
    id: params.runtimeToolId,
    toolId: params.runtimeToolId,
    toolName: params.toolName,
    displayName: params.displayName,
    status: 'running',
    inputSummary: params.inputSummary,
    outputSummary: '',
    startedAt: params.startedAt,
  };
}

async function persistAndWriteRawEvent(db, currentUser, context, res, disconnect, event, delayMs = EVENT_DELAY_MS) {
  if (disconnect.isClosed()) {
    return false;
  }

  await appendRunEvent(db, currentUser, context, event);

  if (!writeSseEvent(res, event)) {
    return false;
  }

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  return !disconnect.isClosed();
}

const CAPABILITY_KEYWORDS = [
  '你能做什么',
  '你可以做什么',
  '你可以帮我做哪些分析',
  '有什么功能',
  '有什么能力',
  '工作台有什么能力',
  '怎么用',
  '介绍一下',
  '帮助',
  'help',
  'what can you do',
];
const DATA_ANALYSIS_KEYWORDS = [
  '分析',
  '数据',
  '成绩',
  '平均分',
  '出勤',
  '出勤率',
  '作业',
  '完成率',
  '异常',
  '指标',
  '趋势',
  '对比',
  '上月',
  '本月',
  '教学质量',
];
const DATA_ANALYSIS_PRIORITY_KEYWORDS = [
  '分析',
  '教学质量数据',
  '找出异常',
  '异常指标',
  '指标变化',
  '数据异常',
  '趋势',
  '对比',
  '本月',
  '上月',
  '环比',
  '班级',
  '平均分',
  '成绩',
];
const KNOWLEDGE_QA_KEYWORDS = [
  '制度',
  '政策',
  '依据',
  '规则',
  '评价口径',
  '定义',
  '说明',
  '来源',
  '引用',
  '为什么要关注',
  '教学评价',
  '学业预警',
  '数据异常处理',
];

function includesAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function padMonth(month) {
  return String(month).padStart(2, '0');
}

function createMonthLabel(month) {
  const [year, monthValue] = month.split('-');
  return `${year} 年 ${Number(monthValue)} 月`;
}

function extractExplicitMonth(prompt) {
  const normalizedPrompt = prompt.trim();
  const cnMatch = normalizedPrompt.match(/(19\d{2}|20\d{2})\s*年\s*(1[0-2]|0?[1-9])\s*月/);
  const separatorMatch = normalizedPrompt.match(/(19\d{2}|20\d{2})[-/](1[0-2]|0?[1-9])/);
  const match = cnMatch || separatorMatch;

  if (!match) {
    return null;
  }

  const year = match[1];
  const month = Number.parseInt(match[2], 10);
  return `${year}-${padMonth(month)}`;
}

function pickMetricFromPrompt(prompt) {
  if (prompt.includes('异常') || prompt.includes('预警')) return 'warning_count';
  if (prompt.includes('出勤') || prompt.includes('出勤率')) return 'attendance_rate';
  if (prompt.includes('作业') || prompt.includes('完成率')) return 'homework_completion_rate';
  if (prompt.includes('平均分') || prompt.includes('成绩') || prompt.includes('分数')) return 'avg_score';
  return 'warning_count';
}

function pickGroupByFromPrompt(prompt) {
  if (includesAnyKeyword(prompt, ['趋势', '月份', '对比', '上月', '环比'])) {
    return 'month';
  }

  if (includesAnyKeyword(prompt, ['年级'])) {
    return 'grade';
  }

  return 'subject';
}

function pickTimeRangeFromPrompt(prompt) {
  const explicitMonth = extractExplicitMonth(prompt);

  if (explicitMonth) {
    return {
      type: 'month',
      month: explicitMonth,
      label: createMonthLabel(explicitMonth),
    };
  }

  if (includesAnyKeyword(prompt, ['本月', '这个月', '当前月份'])) {
    return {
      type: 'latest_available_month',
      label: '最新可用月份',
    };
  }

  return { type: 'none' };
}

function fallbackPlanAgentRun(prompt) {
  const normalizedPrompt = prompt.trim();
  const lowerPrompt = normalizedPrompt.toLowerCase();

  if (includesAnyKeyword(normalizedPrompt, CAPABILITY_KEYWORDS) || includesAnyKeyword(lowerPrompt, CAPABILITY_KEYWORDS)) {
    return {
      intent: 'capability_intro',
      shouldUseDataAnalysis: false,
      reason: '用户在询问系统能力，不需要访问数据源。',
    };
  }

  const shouldUseDataAnalysis =
    includesAnyKeyword(normalizedPrompt, DATA_ANALYSIS_PRIORITY_KEYWORDS) ||
    includesAnyKeyword(lowerPrompt, DATA_ANALYSIS_PRIORITY_KEYWORDS) ||
    Boolean(extractExplicitMonth(normalizedPrompt));

  const shouldUseKnowledgeQa =
    includesAnyKeyword(normalizedPrompt, KNOWLEDGE_QA_KEYWORDS) ||
    includesAnyKeyword(lowerPrompt, KNOWLEDGE_QA_KEYWORDS);

  if (shouldUseDataAnalysis) {
    return {
      intent: 'data_analysis',
      shouldUseDataAnalysis: true,
      reason: '用户在请求教学质量相关的数据分析。',
      metric: pickMetricFromPrompt(normalizedPrompt),
      groupBy: pickGroupByFromPrompt(normalizedPrompt),
      timeRange: pickTimeRangeFromPrompt(normalizedPrompt),
      comparison: includesAnyKeyword(normalizedPrompt, ['上月', '环比', '对比上月', '较上月']) ? 'previous_month' : 'none',
    };
  }

  if (shouldUseKnowledgeQa) {
    return {
      intent: 'knowledge_qa',
      shouldUseDataAnalysis: false,
      reason: '用户在询问教学评价制度、规则依据或指标口径，需要检索知识库。',
    };
  }

  if (includesAnyKeyword(normalizedPrompt, DATA_ANALYSIS_KEYWORDS) || includesAnyKeyword(lowerPrompt, DATA_ANALYSIS_KEYWORDS)) {
    return {
      intent: 'data_analysis',
      shouldUseDataAnalysis: true,
      reason: '用户在请求教学质量相关的数据分析。',
      metric: pickMetricFromPrompt(normalizedPrompt),
      groupBy: pickGroupByFromPrompt(normalizedPrompt),
      timeRange: pickTimeRangeFromPrompt(normalizedPrompt),
      comparison: 'none',
    };
  }

  return {
    intent: 'unsupported',
    shouldUseDataAnalysis: false,
    reason: '当前问题不属于教育数据分析工作台支持范围。',
  };
}

function normalizeMetric(value) {
  if (value === 'abnormal_count') {
    return 'warning_count';
  }

  return ['avg_score', 'attendance_rate', 'homework_completion_rate', 'warning_count'].includes(value)
    ? value
    : 'warning_count';
}

function normalizeGroupBy(value) {
  if (value === 'metric_month') {
    return 'month';
  }

  return ['subject', 'grade', 'month'].includes(value) ? value : 'subject';
}

function normalizePlan(rawPlan, fallback) {
  if (!isRecord(rawPlan)) {
    return fallback;
  }

  const intent = ['capability_intro', 'data_analysis', 'knowledge_qa', 'unsupported'].includes(rawPlan.intent)
    ? rawPlan.intent
    : fallback.intent;

  if (intent !== 'data_analysis') {
    return {
      intent,
      shouldUseDataAnalysis: false,
      reason: readOptionalString(rawPlan.reason) || fallback.reason,
    };
  }

  let timeRange = fallback.timeRange || { type: 'none' };

  if (isRecord(rawPlan.timeRange)) {
    if (rawPlan.timeRange.type === 'month' && /^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/.test(rawPlan.timeRange.month || '')) {
      timeRange = {
        type: 'month',
        month: rawPlan.timeRange.month,
        label: readOptionalString(rawPlan.timeRange.label) || createMonthLabel(rawPlan.timeRange.month),
      };
    } else if (rawPlan.timeRange.type === 'latest_available_month') {
      timeRange = {
        type: 'latest_available_month',
        label: readOptionalString(rawPlan.timeRange.label) || '最新可用月份',
      };
    } else if (rawPlan.timeRange.type === 'none') {
      timeRange = { type: 'none' };
    }
  }

  return {
    intent,
    shouldUseDataAnalysis: true,
    reason: readOptionalString(rawPlan.reason) || fallback.reason,
    metric: normalizeMetric(rawPlan.metric || fallback.metric),
    groupBy: normalizeGroupBy(rawPlan.groupBy || fallback.groupBy),
    timeRange,
    comparison: rawPlan.comparison === 'previous_month' ? 'previous_month' : 'none',
  };
}

async function planAgentRun(prompt) {
  const fallback = fallbackPlanAgentRun(prompt);
  return {
    plan: fallback,
    plannerSource: 'local_rules',
    fallbackReason: null,
  };
}

function normalizeCellValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function inspectSchema() {
  const columns = [
    { columnName: 'id', dataType: 'VARCHAR(36)', description: '演示数据行 ID。' },
    { columnName: 'month', dataType: 'VARCHAR(20)', description: '统计月份，格式为 YYYY-MM。' },
    { columnName: 'grade', dataType: 'VARCHAR(50)', description: '年级，例如七年级、八年级、九年级。' },
    { columnName: 'class_name', dataType: 'VARCHAR(100)', description: '班级名称。' },
    { columnName: 'subject', dataType: 'VARCHAR(100)', description: '学科，例如数学、语文、英语。' },
    { columnName: 'avg_score', dataType: 'DECIMAL(5,2)', description: '班级该学科平均分。' },
    { columnName: 'attendance_rate', dataType: 'DECIMAL(5,2)', description: '出勤率，单位为百分比。' },
    { columnName: 'homework_completion_rate', dataType: 'DECIMAL(5,2)', description: '作业完成率，单位为百分比。' },
    { columnName: 'warning_count', dataType: 'INT UNSIGNED', description: '需要关注的预警或异常数量。' },
    { columnName: 'metadata', dataType: 'JSON', description: '演示数据标签和趋势说明。' },
  ].map((column, index) => ({
    ...column,
    isNullable: false,
    ordinalPosition: index + 1,
  }));

  return {
    schemas: ['public_demo'],
    tableCount: 1,
    tables: [
      {
        schema: 'public_demo',
        tableName: 'teaching_metrics',
        description: 'CloudBase MySQL 公开教学质量演示数据源。',
        columns,
      },
    ],
  };
}

function getPreviousMonth(month) {
  const [year, monthValue] = month.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, monthValue - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isMissingTableError(error) {
  const message = (error && typeof error === 'object'
    ? `${error.message || ''} ${error.code || ''} ${error.errCode || ''} ${JSON.stringify(error)}`
    : String(error && error.message ? error.message : error)
  ).toLowerCase();
  return (
    message.includes('teaching_metrics') &&
    (
      message.includes('not exist') ||
      message.includes('doesn\'t exist') ||
      message.includes('unknown table') ||
      message.includes('no such table') ||
      message.includes('er_no_such_table')
    )
  );
}

function toDataToolError(error) {
  if (error instanceof DataToolError) {
    return error;
  }

  if (isMissingTableError(error)) {
    return new DataToolError('data_table_not_found', 'CloudBase MySQL teaching_metrics table was not found.');
  }

  return new DataToolError('data_tool_query_failed', 'CloudBase MySQL teaching_metrics query failed.');
}

function normalizeTeachingMetricRow(row) {
  return {
    id: String(row.id ?? ''),
    month: String(row.month ?? ''),
    grade: String(row.grade ?? ''),
    class_name: String(row.class_name ?? ''),
    subject: String(row.subject ?? ''),
    avg_score: Number(row.avg_score) || 0,
    attendance_rate: Number(row.attendance_rate) || 0,
    homework_completion_rate: Number(row.homework_completion_rate) || 0,
    warning_count: normalizeNumber(row.warning_count, 0),
    metadata: parseJsonObject(row.metadata),
    created_at: normalizeCellValue(row.created_at),
    updated_at: normalizeCellValue(row.updated_at),
  };
}

async function fetchTeachingMetricRows(db) {
  try {
    const result = await db.from('teaching_metrics').select(TEACHING_METRICS_COLUMNS);
    if (result && result.error) {
      throw toDataToolError(result.error);
    }

    assertNoQueryError(result);
    return extractRows(result).map(normalizeTeachingMetricRow);
  } catch (error) {
    throw toDataToolError(error);
  }
}

function filterTeachingRows(rows, input) {
  let filteredRows = rows;
  const normalizedGrade = readOptionalString(input.grade);
  const normalizedSubject = readOptionalString(input.subject);

  if (normalizedGrade) {
    filteredRows = filteredRows.filter((row) => row.grade === normalizedGrade);
  }

  if (normalizedSubject) {
    filteredRows = filteredRows.filter((row) => row.subject === normalizedSubject);
  }

  if (input.timeRange?.type === 'month') {
    const months = input.comparison === 'previous_month'
      ? [getPreviousMonth(input.timeRange.month), input.timeRange.month]
      : [input.timeRange.month];
    filteredRows = filteredRows.filter((row) => months.includes(row.month));
  } else if (input.timeRange?.type === 'latest_available_month') {
    const latestMonth = filteredRows.reduce((latest, row) => (row.month > latest ? row.month : latest), '');
    filteredRows = latestMonth ? filteredRows.filter((row) => row.month === latestMonth) : [];
  }

  return filteredRows;
}

function roundMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function createSummary(rows, groupBy) {
  const groupMap = new Map();

  for (const row of rows) {
    const dimension = String(row[groupBy] ?? '');
    const key = dimension || '未分组';
    const current = groupMap.get(key) || {
      dimension: key,
      recordCount: 0,
      avgScoreTotal: 0,
      attendanceRateTotal: 0,
      homeworkCompletionRateTotal: 0,
      warningCount: 0,
    };

    current.recordCount += 1;
    current.avgScoreTotal += row.avg_score;
    current.attendanceRateTotal += row.attendance_rate;
    current.homeworkCompletionRateTotal += row.homework_completion_rate;
    current.warningCount += row.warning_count;
    groupMap.set(key, current);
  }

  return Array.from(groupMap.values()).map((summary) => ({
    dimension: summary.dimension,
    recordCount: summary.recordCount,
    avg_score: roundMetric(summary.avgScoreTotal / summary.recordCount),
    attendance_rate: roundMetric(summary.attendanceRateTotal / summary.recordCount),
    homework_completion_rate: roundMetric(summary.homeworkCompletionRateTotal / summary.recordCount),
    warning_count: summary.warningCount,
  }));
}

function getMetricValue(summary, metric) {
  if (metric === 'warning_count') {
    return summary.warning_count;
  }

  return Number(summary[metric]) || 0;
}

function sortSummaryRows(rows, metric) {
  return rows.sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric));
}

async function aggregateTable(db, input) {
  const metric = normalizeMetric(input.metric);
  const groupBy = normalizeGroupBy(input.groupBy);
  const startedAt = Date.now();
  const allRows = await fetchTeachingMetricRows(db);
  const filteredRows = filterTeachingRows(allRows, input);
  const totalRecords = filteredRows.length;
  const summaryByGrade = sortSummaryRows(createSummary(filteredRows, 'grade'), metric);
  const summaryBySubject = sortSummaryRows(createSummary(filteredRows, 'subject'), metric);
  const summaryByMonth = sortSummaryRows(createSummary(filteredRows, 'month'), metric);
  const groupedSummary = sortSummaryRows(createSummary(filteredRows, groupBy), metric).slice(0, input.limit || MAX_TOOL_ROWS);
  const rows = groupedSummary.map((summary) => ({
    ...summary,
    value: getMetricValue(summary, metric),
  }));

  return {
    metric,
    groupBy,
    totalRecords,
    rowCount: rows.length,
    averages: createSummary(filteredRows, 'all').find((summary) => summary.dimension === '未分组') || {
      recordCount: 0,
      avg_score: 0,
      attendance_rate: 0,
      homework_completion_rate: 0,
      warning_count: 0,
    },
    summaryByGrade,
    summaryBySubject,
    summaryByMonth,
    rows,
    elapsedMs: Date.now() - startedAt,
    timeRangeLabel: input.timeRange?.type !== 'none' ? input.timeRange?.label : undefined,
  };
}

function renderChart(input) {
  const labels = [];
  const values = [];

  for (const row of input.rows) {
    const value = Number(row[input.valueKey]);

    if (Number.isFinite(value)) {
      labels.push(String(row[input.labelKey] ?? ''));
      values.push(value);
    }
  }

  return {
    title: input.title,
    chartType: input.chartType,
    config: {
      xField: input.labelKey,
      yField: input.valueKey,
      metric: input.metric,
      groupBy: input.groupBy,
    },
    labels,
    values,
    series: [
      {
        name: getMetricLabel(input.metric),
        data: values,
      },
    ],
    summary: labels.length
      ? `已生成 ${labels.length} 个数据点，图表类型为 ${input.chartType}。`
      : '没有可用于图表渲染的有效数据点。',
  };
}

function toRunChartData(chartResult) {
  return {
    title: chartResult.title,
    chartType: chartResult.chartType,
    config: chartResult.config || {},
    labels: chartResult.labels,
    series: [
      {
        name: chartResult.title || '指标值',
        values: chartResult.values,
      },
    ],
    summary: chartResult.summary,
  };
}

function getMetricLabel(metric) {
  return {
    avg_score: '平均分',
    attendance_rate: '出勤率',
    homework_completion_rate: '作业完成率',
    warning_count: '预警数量',
    abnormal_count: '预警数量',
  }[metric] || '异常指标';
}

function getGroupByLabel(groupBy) {
  if (groupBy === 'month' || groupBy === 'metric_month') {
    return '月份';
  }

  return groupBy === 'grade' ? '年级' : '学科';
}

function getTimeRangeLabel(timeRange) {
  return timeRange?.type === 'month' || timeRange?.type === 'latest_available_month' ? timeRange.label : '未指定';
}

function buildChartTitle(plan) {
  const timeRangeLabel = getTimeRangeLabel(plan.timeRange);
  const timePrefix = timeRangeLabel === '未指定' ? '' : timeRangeLabel;
  const comparisonText = plan.comparison === 'previous_month' && timePrefix ? '及上月' : '';
  const suffix = normalizeGroupBy(plan.groupBy) === 'month' ? '趋势分析' : '分布分析';
  return `${timePrefix}${comparisonText}${getMetricLabel(plan.metric)}${suffix}` || `${getMetricLabel(plan.metric)}${suffix}`;
}

function buildFallbackConclusion(plan, chartResult, fallbackReason) {
  const metricName = getMetricLabel(plan.metric);
  const groupByName = getGroupByLabel(plan.groupBy);
  const timeRangeLabel = getTimeRangeLabel(plan.timeRange);
  const labels = chartResult?.labels || [];
  const values = chartResult?.values || [];

  if (fallbackReason === 'data_table_not_found') {
    return [
      '当前 CloudBase Agent Run 已完成鉴权、quota 和运行记录写入，但 CloudBase MySQL 中未找到 `teaching_metrics` 表。',
      '本次不会伪造模型或工具结果，因此只返回 fallback 说明。',
      '请先执行 `tencent/migrations/002_cloudbase_teaching_metrics.sql` 和 `tencent/seeds/003_teaching_metrics_seed.sql` 后重试。',
    ].join('\n\n');
  }

  if (fallbackReason === 'data_tool_query_failed') {
    return [
      '当前 CloudBase Agent Run 已完成鉴权、quota 和运行记录写入，但读取 CloudBase MySQL 教学指标数据失败。',
      '本次不会伪造模型或工具结果，因此只返回 fallback 说明。',
      '请检查 CloudBase 函数运行日志、MySQL 权限和 `teaching_metrics` 表结构后重试。',
    ].join('\n\n');
  }

  if (fallbackReason === 'unknown_tool_error') {
    return [
      '当前 CloudBase Agent Run 已完成鉴权、quota 和运行记录写入，但受控工具链出现未知错误。',
      '本次不会伪造模型或工具结果，因此只返回 fallback 说明。',
      '请检查 schema_inspect、aggregate_table 和 chart_render 对应的 tool_invocations 记录。',
    ].join('\n\n');
  }

  if (fallbackReason === 'model_not_configured') {
    return [
      `数据工具已从 CloudBase MySQL 的 \`teaching_metrics\` 表读取并聚合教学质量数据${timeRangeLabel !== '未指定' ? `，时间范围为“${timeRangeLabel}”` : ''}。`,
      '当前未配置模型网关，因此最终回复使用结构化 fallback 结论生成，不会伪装成真实模型输出。',
      labels.length > 0 && values.length > 0
        ? `${labels[0]} 在“${metricName}”上最需要关注（约 ${Number(values[0] || 0).toFixed(2)}），建议结合年级、班级和学科继续排查。`
        : '当前工具结果没有足够数据点生成明确排序。',
    ].join('\n\n');
  }

  if (String(fallbackReason || '').startsWith('model_')) {
    return [
      `数据工具已从 CloudBase MySQL 的 \`teaching_metrics\` 表读取并聚合教学质量数据${timeRangeLabel !== '未指定' ? `，时间范围为“${timeRangeLabel}”` : ''}。`,
      `模型结论生成失败，fallbackReason=${fallbackReason}。当前回复使用结构化 fallback 结论生成，不会伪装成真实模型输出。`,
      labels.length > 0 && values.length > 0
        ? `${labels[0]} 在“${metricName}”上最需要关注（约 ${Number(values[0] || 0).toFixed(2)}），建议结合年级、班级和学科继续排查。`
        : '当前工具结果没有足够数据点生成明确排序。',
    ].join('\n\n');
  }

  if (labels.length === 0 || values.length === 0) {
    return [
      `已尝试围绕“${metricName}”按${groupByName}维度执行受控分析${timeRangeLabel !== '未指定' ? `，时间范围为“${timeRangeLabel}”` : ''}。`,
      '当前工具结果不足以生成明确结论，本次不会使用其他时间范围或未返回的数据代替。',
      '建议确认数据源是否已有对应月份和指标数据，或调整问题后重新分析。',
    ].join('\n\n');
  }

  const maxIndex = values.reduce((maxIdx, value, index, array) => (value > array[maxIdx] ? index : maxIdx), 0);
  const maxLabel = labels[maxIndex] || '当前维度';
  const maxValue = Number(values[maxIndex] || 0);
  const topLabels = labels.slice(0, 3).join('、');

  return [
    `本次基于受控工具结果完成 ${metricName} 分析${timeRangeLabel !== '未指定' ? `，时间范围为“${timeRangeLabel}”` : ''}。`,
    `${maxLabel} 在该指标上最为突出（约 ${maxValue.toFixed(2)}），建议优先关注该维度并结合班级层级进一步排查。`,
    topLabels ? `当前结果主要覆盖：${topLabels}。` : '当前结果覆盖范围有限。',
  ].join('\n\n');
}

function buildCapabilityIntroConclusion() {
  return [
    '我可以作为一个教育数据分析助手，帮助你围绕教学质量数据做分析。',
    '',
    '当前 CloudBase 版真实 Agent Run 已接入固定后端链路，可以进行意图判断、受控工具调用、SSE 事件写入和 fallback 结论生成。',
    '',
    '你可以这样问：分析本月教学质量数据，找出异常指标。',
  ].join('\n');
}

function buildUnsupportedConclusion() {
  return [
    '这个问题暂时超出了当前工作台的支持范围。',
    '',
    '目前我主要支持围绕教育数据进行分析，例如成绩、出勤率、作业完成率和异常指标等。',
    '',
    '你可以尝试这样问：分析本月教学质量数据，找出异常指标。',
  ].join('\n');
}

function buildKnowledgeFallbackConclusion(fallbackReason) {
  return [
    '当前 CloudBase Agent Run 尚未迁移 RAG 知识库检索链路，因此本次不会伪装成真实知识库回答。',
    `fallbackReason=${fallbackReason}`,
    '后续需要迁移知识库表、检索逻辑和 rag_retrieval_logs 后，再开启真实 knowledge_qa。',
  ].join('\n\n');
}

function splitTextIntoDeltas(text) {
  const deltas = [];
  let buffer = '';

  for (const char of text) {
    buffer += char;

    if (buffer.length >= 18 || /[。！？\n]/.test(char)) {
      deltas.push(buffer);
      buffer = '';
    }
  }

  if (buffer) {
    deltas.push(buffer);
  }

  return deltas;
}

function buildConclusionMessages(context) {
  const rowsPreview = (context.aggregateResult?.rows || [])
    .slice(0, 5)
    .map((row) => JSON.stringify(row))
    .join('\n');

  return [
    {
      role: 'system',
      content: '你是一个教育数据分析助手。只能基于工具结果输出结论，不要编造工具结果中没有的数据。',
    },
    {
      role: 'user',
      content: [
        '【用户问题】',
        context.prompt,
        '',
        '【意图识别】',
        `metric=${context.plan.metric}, groupBy=${context.plan.groupBy}`,
        `timeRange=${getTimeRangeLabel(context.plan.timeRange)}, comparison=${context.plan.comparison || 'none'}`,
        '',
        '【Schema 摘要】',
        `tableCount=${context.schemaResult?.tableCount || 0}`,
        '',
        '【聚合结果摘要】',
        `rowCount=${context.aggregateResult?.rowCount || 0}`,
        rowsPreview || '[]',
        '',
        '【图表摘要】',
        context.chartResult?.summary || '',
        '',
        '请输出：1) 关键发现；2) 可能原因；3) 下一步建议。保持简洁。',
      ].join('\n'),
    },
  ];
}

function createConfiguredModelDiagnostics(errorType, errorMessage) {
  const config = getModelGatewayConfig();

  return {
    modelProvider: config.provider || null,
    modelName: config.model || null,
    modelErrorType: errorType || null,
    modelHttpStatus: null,
    modelErrorMessage: errorMessage || null,
  };
}

function createFailedModelDiagnostics(error) {
  const modelError = normalizeModelError(error);

  return {
    modelProvider: modelError.provider || null,
    modelName: modelError.model || null,
    modelErrorType: modelError.errorType || 'model_failed',
    modelHttpStatus: modelError.httpStatus,
    modelErrorMessage: modelError.message || null,
    hasModelApiKey: Boolean(modelError.hasApiKey),
    modelApiKeyLength: Number(modelError.apiKeyLength) || 0,
  };
}

function createModelEventMetadata(diagnostics = {}) {
  return {
    modelProvider: diagnostics.modelProvider || null,
    modelName: diagnostics.modelName || null,
    modelErrorType: diagnostics.modelErrorType || null,
    modelHttpStatus: Number.isInteger(diagnostics.modelHttpStatus) ? diagnostics.modelHttpStatus : null,
    modelErrorMessage: diagnostics.modelErrorMessage || null,
  };
}

async function createToolInvocationRecord(db, currentUser, context, params) {
  const id = randomUUID();
  const insertResult = await db.from('tool_invocations').insert({
    id,
    _openid: currentUser.openid,
    user_id: currentUser.userId,
    run_id: context.runId,
    conversation_id: context.conversationId,
    tool_name: params.toolName,
    display_name: params.displayName,
    status: 'running',
    input: JSON.stringify(params.input || {}),
    input_summary: params.inputSummary || '',
    output: JSON.stringify({}),
    output_summary: null,
    metadata: JSON.stringify({
      source: 'cloudbase-agent-run-real',
      runtimeToolId: params.runtimeToolId,
    }),
  });

  assertNoQueryError(insertResult);
  return id;
}

async function updateToolInvocationRecord(db, currentUser, toolInvocationId, params) {
  const updateResult = await db
    .from('tool_invocations')
    .update({
      status: params.status,
      output: JSON.stringify(params.output || {}),
      output_summary: params.outputSummary || null,
      finished_at: toMysqlDateTime(new Date()),
      elapsed_ms: params.elapsedMs,
      error: params.error || null,
      metadata: JSON.stringify(params.metadata || {}),
    })
    .eq('id', toolInvocationId)
    .eq('_openid', currentUser.openid)
    .eq('user_id', currentUser.userId);

  assertNoQueryError(updateResult);
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
      console.log('[workbench-agent-run-stream] stream closed', source, runId);
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
  console.log('[workbench-agent-run-stream] event', event.type, event.runId || event.run?.id);
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
    agentMode: 'basic',
    intent: 'mock_basic_loop',
    planSnapshot: {
      source: 'cloudbase-basic-loop',
      steps: ['validate_conversation', 'consume_quota', 'mock_tool', 'fixed_conclusion', 'assistant_message'],
    },
    dataSourceSnapshot: { source: 'mock' },
    conclusionSource: 'mock_fixed',
    reportState: 'hidden',
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

async function emitConclusionDeltas(db, currentUser, context, res, disconnect, text) {
  for (const delta of splitTextIntoDeltas(text)) {
    const ok = await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('conclusion_delta', context, { delta }),
      0,
    );

    if (!ok) {
      return false;
    }
  }

  return true;
}

async function streamStaticConclusion(db, currentUser, context, res, disconnect, params) {
  const ok = await emitConclusionDeltas(db, currentUser, context, res, disconnect, params.conclusion);

  if (!ok) {
    return false;
  }

  return persistAndWriteRawEvent(
    db,
    currentUser,
    context,
    res,
    disconnect,
    createRunEvent('conclusion_completed', context, {
      conclusion: params.conclusion,
      conclusionSource: params.conclusionSource,
      conclusionNotice: params.conclusionNotice,
      fallbackReason: params.fallbackReason,
      modelProvider: params.modelProvider,
      modelName: params.modelName,
      modelErrorType: params.modelErrorType,
      modelHttpStatus: params.modelHttpStatus,
      modelErrorMessage: params.modelErrorMessage,
    }),
  );
}

async function runControlledTool(db, currentUser, context, res, disconnect, params) {
  const startedAt = Date.now();
  const startedIso = nowIso();
  const toolInvocationId = await createToolInvocationRecord(db, currentUser, context, {
    runtimeToolId: params.runtimeToolId,
    toolName: params.toolName,
    displayName: params.displayName,
    input: params.input,
    inputSummary: params.inputSummary,
  });

  const started = await persistAndWriteRawEvent(
    db,
    currentUser,
    context,
    res,
    disconnect,
    createRunEvent('tool_started', context, {
      tool: createToolEventTool({
        runtimeToolId: params.runtimeToolId,
        toolName: params.toolName,
        displayName: params.displayName,
        inputSummary: params.inputSummary,
        startedAt: startedIso,
      }),
    }),
  );

  if (!started) {
    throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
  }

  try {
    const output = await params.execute();
    const elapsedMs = Math.max(Date.now() - startedAt, 1);
    await updateToolInvocationRecord(db, currentUser, toolInvocationId, {
      status: 'completed',
      output,
      outputSummary: params.outputSummary(output),
      elapsedMs,
      metadata: {
        source: 'cloudbase-agent-run-real',
        runtimeToolId: params.runtimeToolId,
        runId: context.runId,
      },
    });

    const completed = await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('tool_completed', context, {
        toolId: params.runtimeToolId,
        outputSummary: params.outputSummary(output),
        completedAt: nowIso(),
        elapsedMs,
      }),
    );

    if (!completed) {
      throw new RequestError(499, 'client_disconnected', 'Client disconnected.');
    }

    return output;
  } catch (error) {
    const elapsedMs = Math.max(Date.now() - startedAt, 1);
    const fallbackReason = error instanceof DataToolError ? error.fallbackReason : 'unknown_tool_error';
    const errorMessage = error instanceof DataToolError ? error.publicMessage : '受控工具执行失败';
    await updateToolInvocationRecord(db, currentUser, toolInvocationId, {
      status: 'failed',
      output: {
        fallbackReason,
      },
      outputSummary: errorMessage,
      elapsedMs,
      error: errorMessage,
      metadata: {
        source: 'cloudbase-agent-run-real',
        runtimeToolId: params.runtimeToolId,
        runId: context.runId,
        fallbackReason,
      },
    });
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('tool_failed', context, {
        toolId: params.runtimeToolId,
        errorMessage,
        fallbackReason,
        completedAt: nowIso(),
        elapsedMs,
      }),
    );
    throw error;
  }
}

async function runRealDataAnalysis(db, currentUser, context, res, disconnect) {
  const plan = context.plan;
  const toolStart = Date.now();

  try {
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_started', context, {
        stepId: 'step_schema',
        title: '读取数据源 Schema',
        description: '通过 schema_inspect 读取允许访问的表和字段。',
        startedAt: nowIso(),
      }),
    );
    const schemaResult = await runControlledTool(db, currentUser, context, res, disconnect, {
      runtimeToolId: 'schema_inspect',
      toolName: 'schema_inspect',
      displayName: '数据源结构读取',
      input: { includeColumns: true },
      inputSummary: 'includeColumns=true',
      execute: () => inspectSchema(),
      outputSummary: (output) => `读取 ${output.tableCount} 张表`,
    });
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_completed', context, {
        stepId: 'step_schema',
        completedAt: nowIso(),
        elapsedMs: Math.max(Date.now() - toolStart, 1),
      }),
    );

    const aggregateStart = Date.now();
    const aggregateInput = {
      metric: normalizeMetric(plan.metric),
      groupBy: plan.comparison === 'previous_month' && plan.timeRange?.type === 'month'
        ? 'month'
        : normalizeGroupBy(plan.groupBy),
      limit: MAX_TOOL_ROWS,
      timeRange: plan.timeRange || { type: 'none' },
      comparison: plan.comparison || 'none',
    };
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_started', context, {
        stepId: 'step_aggregate',
        title: '执行受控查询工具',
        description: `metric=${aggregateInput.metric}, groupBy=${aggregateInput.groupBy}`,
        startedAt: nowIso(),
      }),
    );
    const aggregateResult = await runControlledTool(db, currentUser, context, res, disconnect, {
      runtimeToolId: 'aggregate_table',
      toolName: 'aggregate_table',
      displayName: '数据聚合分析',
      input: aggregateInput,
      inputSummary: JSON.stringify(aggregateInput),
      execute: () => aggregateTable(db, aggregateInput),
      outputSummary: (output) => output.totalRecords > 0 ? `读取 ${output.totalRecords} 条记录，返回 ${output.rowCount} 条聚合结果` : '未找到可聚合的数据',
    });
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_completed', context, {
        stepId: 'step_aggregate',
        completedAt: nowIso(),
        elapsedMs: Math.max(Date.now() - aggregateStart, 1),
      }),
    );

    const chartStart = Date.now();
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_started', context, {
        stepId: 'step_chart',
        title: '生成图表数据',
        description: '通过 chart_render 生成统一图表数据结构。',
        startedAt: nowIso(),
      }),
    );
    const chartInput = {
      title: buildChartTitle(aggregateInput),
      chartType: 'bar',
      labelKey: 'dimension',
      valueKey: 'value',
      metric: aggregateInput.metric,
      groupBy: aggregateInput.groupBy,
      rows: aggregateResult.rows,
    };
    const chartResult = await runControlledTool(db, currentUser, context, res, disconnect, {
      runtimeToolId: 'chart_render',
      toolName: 'chart_render',
      displayName: '图表数据生成',
      input: {
        title: chartInput.title,
        chartType: chartInput.chartType,
        rowCount: chartInput.rows.length,
      },
      inputSummary: JSON.stringify({ title: chartInput.title, rowCount: chartInput.rows.length }),
      execute: async () => renderChart(chartInput),
      outputSummary: (output) => output.summary,
    });
    context.chartData = toRunChartData(chartResult);
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('chart_ready', context, {
        chartData: context.chartData,
      }),
    );
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_completed', context, {
        stepId: 'step_chart',
        completedAt: nowIso(),
        elapsedMs: Math.max(Date.now() - chartStart, 1),
      }),
    );

    return {
      schemaResult,
      aggregateResult,
      chartResult,
      fallbackReason: null,
    };
  } catch (error) {
    if (error && error.errorCode === 'client_disconnected') {
      throw error;
    }

    return {
      schemaResult: null,
      aggregateResult: null,
      chartResult: null,
      fallbackReason: error instanceof DataToolError ? error.fallbackReason : 'unknown_tool_error',
    };
  }
}

async function generateRealConclusion(db, currentUser, context, res, disconnect, toolContext) {
  await persistAndWriteRawEvent(
    db,
    currentUser,
    context,
    res,
    disconnect,
    createRunEvent('step_started', context, {
      stepId: 'step_conclusion',
      title: '生成最终回复',
      description: '基于工具结果生成最终分析结论。',
      startedAt: nowIso(),
    }),
  );

  let conclusion = '';
  let conclusionSource = 'fallback';
  let fallbackReason = toolContext.fallbackReason;
  let conclusionNotice = null;
  const modelConfig = getModelGatewayConfig();

  if (fallbackReason) {
    conclusion = buildFallbackConclusion(context.plan, toolContext.chartResult, fallbackReason);
    conclusionNotice = '数据工具不可用，当前结论由明确 fallback 生成。';
    await streamStaticConclusion(db, currentUser, context, res, disconnect, {
      conclusion,
      conclusionSource,
      conclusionNotice,
      fallbackReason,
    });
  } else if (!toolContext.aggregateResult || toolContext.aggregateResult.totalRecords === 0) {
    fallbackReason = 'data_empty';
    conclusion = buildFallbackConclusion(context.plan, toolContext.chartResult, fallbackReason);
    conclusionNotice = '受控工具未返回可分析数据，当前结论由明确 fallback 生成。';
    await streamStaticConclusion(db, currentUser, context, res, disconnect, {
      conclusion,
      conclusionSource,
      conclusionNotice,
      fallbackReason,
    });
  } else if (!modelConfig.isConfigured) {
    fallbackReason = 'model_not_configured';
    context.modelDiagnostics = createConfiguredModelDiagnostics(
      fallbackReason,
      modelConfig.source === 'model_gateway'
        ? 'MODEL_GATEWAY_* is not fully configured.'
        : 'GROQ_API_KEY is not configured.',
    );
    conclusion = buildFallbackConclusion(context.plan, toolContext.chartResult, fallbackReason);
    conclusionNotice = '未配置模型网关，当前结论由本地工具结果摘要生成。';
    await streamStaticConclusion(db, currentUser, context, res, disconnect, {
      conclusion,
      conclusionSource,
      conclusionNotice,
      fallbackReason,
      ...createModelEventMetadata(context.modelDiagnostics),
    });
  } else {
    try {
      let deltaQueue = Promise.resolve();
      const modelResult = await streamChatCompletion({
        messages: buildConclusionMessages({
          prompt: context.prompt,
          plan: context.plan,
          schemaResult: toolContext.schemaResult,
          aggregateResult: toolContext.aggregateResult,
          chartResult: toolContext.chartResult,
        }),
        onDelta: (delta) => {
          deltaQueue = deltaQueue.then(() => (
            persistAndWriteRawEvent(
              db,
              currentUser,
              context,
              res,
              disconnect,
              createRunEvent('conclusion_delta', context, { delta }),
              0,
            )
          ));
        },
      });
      await deltaQueue;

      conclusion = modelResult.text;
      conclusionSource = modelResult.provider || 'model';
      context.modelDiagnostics = {
        modelProvider: modelResult.provider || modelConfig.provider || null,
        modelName: modelResult.model || modelConfig.model || null,
        modelErrorType: null,
        modelHttpStatus: null,
        modelErrorMessage: null,
      };
      await persistAndWriteRawEvent(
        db,
        currentUser,
        context,
        res,
        disconnect,
        createRunEvent('conclusion_completed', context, {
          conclusion,
          conclusionSource,
          ...createModelEventMetadata(context.modelDiagnostics),
        }),
      );
    } catch (error) {
      const modelDiagnostics = createFailedModelDiagnostics(error);
      fallbackReason = modelDiagnostics.modelErrorType || 'model_failed';
      context.modelDiagnostics = modelDiagnostics;
      console.error('[workbench-agent-run-stream] model conclusion failed', JSON.stringify({
        modelProvider: modelDiagnostics.modelProvider,
        modelName: modelDiagnostics.modelName,
        modelErrorType: modelDiagnostics.modelErrorType,
        modelHttpStatus: modelDiagnostics.modelHttpStatus,
        modelErrorMessage: modelDiagnostics.modelErrorMessage,
        hasModelApiKey: modelDiagnostics.hasModelApiKey,
        modelApiKeyLength: modelDiagnostics.modelApiKeyLength,
      }));
      conclusion = buildFallbackConclusion(context.plan, toolContext.chartResult, fallbackReason);
      conclusionNotice = '模型生成失败，当前结论由本地工具结果摘要生成。';
      await streamStaticConclusion(db, currentUser, context, res, disconnect, {
        conclusion,
        conclusionSource,
        conclusionNotice,
        fallbackReason,
        ...createModelEventMetadata(modelDiagnostics),
      });
    }
  }

  context.conclusion = conclusion;
  context.conclusionSource = conclusionSource;
  context.fallbackReason = fallbackReason;
  context.conclusionNotice = conclusionNotice;

  await persistAndWriteRawEvent(
    db,
    currentUser,
    context,
    res,
    disconnect,
    createRunEvent('step_completed', context, {
      stepId: 'step_conclusion',
      completedAt: nowIso(),
      elapsedMs: Math.max(Date.now() - context.conclusionStartedAt, 1),
    }),
  );

  return conclusion;
}

async function runRealAgentFlow(req, res, currentUser, body) {
  const db = getDb();
  const conversationId = readRequiredString(body.conversationId, 'Missing conversation id.');
  const conversation = await fetchConversationRecord(db, currentUser, conversationId);

  if (!conversation) {
    throw new RequestError(404, 'not_found', 'Workbench conversation was not found.');
  }

  const runId = randomUUID();
  const clientRunId = readOptionalString(body.clientRunId) || runId;
  const provider = readProvider(body.provider);
  const context = {
    runId,
    clientRunId,
    runtimeRunId: clientRunId,
    conversationId,
    provider,
    prompt: readOptionalString(body.prompt) || '分析本月教学质量数据，找出异常指标',
    usageId: null,
    eventSeq: 0,
    agentMode: 'real',
    createdAt: nowIso(),
    intent: 'unknown',
    plan: null,
    planSnapshot: {},
    dataSourceSnapshot: getDataSourceSnapshot(provider),
    chartData: null,
    conclusion: '',
    conclusionSource: 'none',
    fallbackReason: null,
    modelDiagnostics: null,
    reportState: 'hidden',
    steps: [],
    toolInvocations: [],
  };
  const startedAt = Date.now();
  const quotaResult = await consumeQuota(db, currentUser, runId, context.runtimeRunId, 'cloudbase-agent-run-real');
  context.usageId = quotaResult.usageId;
  await createAgentRun(db, currentUser, context);

  const disconnect = createDisconnectTracker(req, res, context.runId);
  let assistantMessageId = null;
  let didComplete = false;

  startSseResponse(res);

  try {
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      {
        type: 'run_started',
        runId: context.runId,
        run: createRunSnapshot(context),
        usageId: context.usageId,
        clientRunId: context.clientRunId,
        conversationId: context.conversationId,
      },
    );

    const plannerStart = Date.now();
    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_started', context, {
        stepId: 'step_intent',
        title: '理解用户问题',
        description: '正在判断用户意图、分析目标和是否需要访问数据源。',
        startedAt: nowIso(),
      }),
    );
    const planned = await planAgentRun(context.prompt);
    context.plan = planned.plan;
    context.intent = planned.plan.intent;
    context.planSnapshot = planToRunSnapshot(planned.plan);
    context.steps = [
      createRunStep('step_intent', '理解用户问题', 'success', `intent=${planned.plan.intent}，reason=${planned.plan.reason}`),
    ];

    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('step_completed', context, {
        stepId: 'step_intent',
        completedAt: nowIso(),
        elapsedMs: Math.max(Date.now() - plannerStart, 1),
        plannerSource: planned.plannerSource,
        fallbackReason: planned.fallbackReason,
      }),
    );
    let conclusion = '';

    if (planned.plan.intent === 'capability_intro') {
      conclusion = buildCapabilityIntroConclusion();
      context.conclusionSource = 'fallback';
      context.fallbackReason = 'local_capability_intro';
      await streamStaticConclusion(db, currentUser, context, res, disconnect, {
        conclusion,
        conclusionSource: 'fallback',
        conclusionNotice: '能力说明由 CloudBase 本地逻辑生成。',
        fallbackReason: context.fallbackReason,
      });
    } else if (planned.plan.intent === 'unsupported') {
      conclusion = buildUnsupportedConclusion();
      context.conclusionSource = 'fallback';
      context.fallbackReason = 'local_unsupported';
      await streamStaticConclusion(db, currentUser, context, res, disconnect, {
        conclusion,
        conclusionSource: 'fallback',
        conclusionNotice: '不支持问题由 CloudBase 本地逻辑生成。',
        fallbackReason: context.fallbackReason,
      });
    } else if (planned.plan.intent === 'knowledge_qa') {
      conclusion = buildKnowledgeFallbackConclusion('rag_not_migrated');
      context.conclusionSource = 'fallback';
      context.fallbackReason = 'rag_not_migrated';
      await streamStaticConclusion(db, currentUser, context, res, disconnect, {
        conclusion,
        conclusionSource: 'fallback',
        conclusionNotice: 'CloudBase RAG 知识库链路尚未迁移。',
        fallbackReason: context.fallbackReason,
      });
    } else {
      const toolContext = await runRealDataAnalysis(db, currentUser, context, res, disconnect);
      context.conclusionStartedAt = Date.now();
      conclusion = await generateRealConclusion(db, currentUser, context, res, disconnect, toolContext);
      context.reportState = 'pending';
      await persistAndWriteRawEvent(
        db,
        currentUser,
        context,
        res,
        disconnect,
        createRunEvent('report_pending', context, {}),
      );
    }

    context.conclusion = conclusion;
    assistantMessageId = await createAssistantMessage(db, currentUser, context, conversation, conclusion, {
      source: context.conclusionSource,
      fallbackReason: context.fallbackReason,
      ...createModelEventMetadata(context.modelDiagnostics),
    });
    const elapsedMs = Math.max(Date.now() - startedAt, 1);
    await completeAgentRun(db, currentUser, context, elapsedMs, conclusion, assistantMessageId, {
      conclusionSource: context.conclusionSource,
      chartData: context.chartData || {},
      reportState: context.reportState,
    });

    await persistAndWriteRawEvent(
      db,
      currentUser,
      context,
      res,
      disconnect,
      createRunEvent('run_completed', context, {
        completedAt: nowIso(),
        elapsedMs,
        assistantMessageId,
        conclusionSource: context.conclusionSource,
        fallbackReason: context.fallbackReason,
        ...createModelEventMetadata(context.modelDiagnostics),
      }),
    );

    try {
      await finishUsage(db, currentUser, context.usageId, 'completed', null, {
        source: 'cloudbase-agent-run-real',
        runId: context.runId,
        assistantMessageId,
        conclusionSource: context.conclusionSource,
        fallbackReason: context.fallbackReason,
        ...createModelEventMetadata(context.modelDiagnostics),
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
        source: 'cloudbase-agent-run-real',
        runId: context.runId,
      });
    } catch (cleanupError) {
      console.error('[workbench-agent-run-stream] usage cleanup failed', sanitizeLogMessage(cleanupError.message));
    }

    if (!disconnected && !res.writableEnded && !res.destroyed) {
      const failEvent = createRunEvent('run_failed', context, {
        errorMessage: 'Agent Run 执行失败，请检查数据源或模型配置。',
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

    if (body.mode === 'basic') {
      await runBasicAgentFlow(req, res, currentUser, body);
      return;
    }

    await runRealAgentFlow(req, res, currentUser, body);
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
