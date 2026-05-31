import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(rootDir, 'contracts/schemas');
const typescript = require('typescript');

async function listSchemaFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listSchemaFiles(entryPath);
      }

      return entry.name.endsWith('.schema.json') ? [entryPath] : [];
    }),
  );

  return files.flat();
}

function toSchemaRelativePath(filePath) {
  return path.relative(schemaDir, filePath).split(path.sep).join('/');
}

function requireCommonJsFile(filePath, stubs = {}) {
  const loadedModule = new Module(filePath);
  loadedModule.filename = filePath;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  loadedModule.require = (request) => {
    if (Object.hasOwn(stubs, request)) {
      return stubs[request];
    }

    return Module.prototype.require.call(loadedModule, request);
  };
  loadedModule._compile(readFileSync(filePath, 'utf8'), filePath);
  return loadedModule.exports;
}

function requireTypeScriptFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const { outputText } = typescript.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
    },
    fileName: filePath,
  });
  const loadedModule = new Module(filePath);
  loadedModule.filename = filePath;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  loadedModule._compile(outputText, filePath);
  return loadedModule.exports;
}

const reportBoundary = require(path.join(rootDir, 'tencent/functions/workbench-reports/metadata-boundary.js'));
const evaluationBoundary = require(path.join(rootDir, 'tencent/functions/workbench-evaluations/metadata-boundary.js'));
const modelLayer = requireCommonJsFile(
  path.join(rootDir, 'tencent/functions/_shared/langchainModelLayer.js'),
  { '@langchain/openai': { ChatOpenAI: class ChatOpenAI {} } },
);
const demoConversations = requireTypeScriptFile(path.join(rootDir, 'src/mocks/demoConversations.ts'));

const RUN_ID = '123e4567-e89b-12d3-a456-426614174000';
const REQUEST_RUN_ID = '223e4567-e89b-12d3-a456-426614174000';
const CREATED_AT = '2026-05-28T00:00:00.000Z';
const UPDATED_AT = '2026-05-28T00:01:00.000Z';

const MODEL_TRACE = {
  selectedModelId: 'siliconflow-qwen-free',
  provider: 'siliconflow',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  latencyMs: 1234,
  usage: {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    usageAvailable: true,
    usageSource: 'provider',
    usageUnavailableReason: null,
  },
  costEstimate: {
    estimatedCost: 0,
    currency: 'USD',
    pricingUnit: '1M tokens',
    isEstimated: true,
    pricingSource: 'catalog',
    costUnavailableReason: null,
  },
  fallbackReason: null,
  modelErrorType: null,
  modelHttpStatus: null,
  modelErrorMessage: null,
  conclusionSource: 'model',
};

const AGENT_CONCLUSION = {
  markdownText: '分析完成，核心指标保持稳定。',
  plainText: '分析完成，核心指标保持稳定。',
  notice: null,
};

const RUN_SOURCE = {
  id: 'source-1',
  runId: RUN_ID,
  conversationId: 'conversation-1',
  sourceOrder: 1,
  title: '知识库片段',
  preview: '与问题相关的知识库内容。',
  sourceType: 'knowledge',
  createdAt: CREATED_AT,
};

const RUN_PLAN = {
  intent: 'data_analysis',
  shouldUseDataAnalysis: true,
  metric: 'warning_count',
  groupBy: 'subject',
  timeRangeLabel: '2026-05',
  comparison: 'none',
  reason: '用户在请求教学质量相关的数据分析。',
};

const RUN_DATA_SOURCE = {
  provider: 'cloudbase_mysql',
  name: 'CloudBase MySQL / teaching_metrics',
  typeLabel: 'CloudBase MySQL',
  schema: 'public_demo',
  tableName: 'teaching_metrics',
  tableCount: 1,
};

const RUN_CHART_DATA = {
  title: '教学质量趋势',
  chartType: 'bar',
  config: {
    xField: 'dimension',
    yField: 'value',
    metric: 'warning_count',
    groupBy: 'subject',
  },
  labels: ['一班'],
  series: [{ name: '平均分', values: [88] }],
  summary: '已生成 1 个数据点，图表类型为 bar。',
};

const LANGSMITH_TRACE = {
  provider: 'langsmith',
  status: 'completed',
  reason: null,
  projectName: 'ai-agent-workbench',
  traceId: 'trace-1',
  runId: 'langsmith-run-1',
  runName: 'workbench_agent_run',
  startedAt: CREATED_AT,
  completedAt: UPDATED_AT,
  errorType: null,
  errorMessage: null,
  timeoutMs: null,
  externalReference: {
    workbenchRunId: RUN_ID,
    conversationId: 'conversation-1',
    clientRunId: 'client-run-1',
    selectedModelId: MODEL_TRACE.selectedModelId,
    langGraphThreadId: `agent-run:${RUN_ID}`,
  },
};

const MALICIOUS_MODEL_TRACE = {
  ...MODEL_TRACE,
  selectedModelId: 'request-model',
  provider: 'request-provider',
  model: 'request-model-name',
};

const FORBIDDEN_METADATA_FIELDS = [
  'provider',
  'model',
  'selectedModelId',
  'usage',
  'costEstimate',
  'fallbackReason',
  'modelErrorType',
  'conclusionSource',
  'tokenUsage',
];

const REPORT_REQUEST_ONLY_FORBIDDEN_FIELDS = [
  'sources',
  'sourceCount',
  'source_count',
  'sourceLineage',
  'source_lineage',
  'sourceNoSourceReason',
  'source_no_source_reason',
];

async function createSchemaValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    validateSchema: true,
  });
  const schemaFiles = (await listSchemaFiles(schemaDir)).sort((a, b) =>
    toSchemaRelativePath(a).localeCompare(toSchemaRelativePath(b)),
  );
  const schemasByFile = new Map();

  for (const file of schemaFiles) {
    const schema = JSON.parse(await readFile(file, 'utf8'));
    schemasByFile.set(toSchemaRelativePath(file), schema);
    ajv.addSchema(schema);
  }

  return {
    getSchemaFiles() {
      return [...schemasByFile.keys()].sort((left, right) => left.localeCompare(right));
    },
    getSchema(file) {
      const schema = schemasByFile.get(file);
      assert.ok(schema, `Missing schema fixture: ${file}`);
      return schema;
    },
    assertValid(file, data) {
      const schema = schemasByFile.get(file);
      assert.ok(schema, `Missing schema fixture: ${file}`);

      const validate = ajv.compile(schema);
      const isValid = validate(data);

      if (!isValid) {
        throw new Error(`${file} validation failed: ${ajv.errorsText(validate.errors, { separator: '\n' })}`);
      }
    },
    assertInvalid(file, data) {
      const schema = schemasByFile.get(file);
      assert.ok(schema, `Missing schema fixture: ${file}`);

      const validate = ajv.compile(schema);
      assert.equal(validate(data), false, `${file} should reject invalid fixture`);
    },
  };
}

function assertNoTopLevelFields(value, fields) {
  for (const field of fields) {
    assert.equal(Object.hasOwn(value, field), false, `${field} must not exist at metadata top level`);
  }
}

function createForbiddenRequestMetadata(extra = {}) {
  return {
    provider: 'request-provider',
    model: 'request-model',
    selectedModelId: 'request-selected-model',
    usage: { totalTokens: 999 },
    costEstimate: { estimatedCost: 999 },
    fallbackReason: 'request-fallback',
    modelErrorType: 'request-error',
    conclusionSource: 'fallback',
    tokenUsage: { totalTokens: 999 },
    modelTrace: MALICIOUS_MODEL_TRACE,
    ...extra,
  };
}

function testReportRequestMetadata() {
  const requestMetadata = reportBoundary.createReportRequestMetadata({
    ...createForbiddenRequestMetadata({
      sources: [{ id: 'source-1' }],
      sourceCount: 1,
      source_count: 1,
      sourceLineage: 'request',
      source_lineage: 'request',
      sourceNoSourceReason: 'request',
      source_no_source_reason: 'request',
    }),
    source: ' request-source ',
    runId: ` ${REQUEST_RUN_ID} `,
    reportState: ' generated ',
    toolNames: [' schema_inspect ', '', 7, 'knowledge_search'],
  });

  assert.deepEqual(requestMetadata, {
    source: 'request-source',
    runId: REQUEST_RUN_ID,
    reportState: 'generated',
    toolNames: ['schema_inspect', 'knowledge_search'],
  });
}

function testReportCreateMetadata(validate) {
  const metadata = reportBoundary.createReportMetadata(
    {
      ...createForbiddenRequestMetadata({
        sources: [{ id: 'source-1' }],
        sourceCount: 1,
        source_count: 1,
        sourceLineage: 'request',
        source_lineage: 'request',
        sourceNoSourceReason: 'request',
        source_no_source_reason: 'request',
      }),
      source: 'manual',
      runId: REQUEST_RUN_ID,
      reportState: 'generated',
      toolNames: ['schema_inspect'],
    },
    { modelTrace: MODEL_TRACE },
    { runId: RUN_ID },
  );

  assert.equal(metadata.runId, RUN_ID);
  assert.equal(metadata.source, 'manual');
  assert.deepEqual(metadata.modelTrace, MODEL_TRACE);
  assertNoTopLevelFields(metadata, [
    ...FORBIDDEN_METADATA_FIELDS,
    ...REPORT_REQUEST_ONLY_FORBIDDEN_FIELDS,
  ]);
  validate.assertValid('objects/report-metadata.schema.json', metadata);
}

function testReportPersistedRead(validate) {
  const metadata = reportBoundary.readPersistedReportMetadata({
    ...createForbiddenRequestMetadata(),
    runId: RUN_ID,
    source: 'persisted',
    reportState: 'generated',
    toolNames: ['aggregate_table'],
    modelTrace: MODEL_TRACE,
    langSmithTraceId: ' trace-report-1 ',
  });

  assert.equal(metadata.runId, RUN_ID);
  assert.equal(metadata.langSmithTraceId, 'trace-report-1');
  assert.deepEqual(metadata.modelTrace, MODEL_TRACE);
  assertNoTopLevelFields(metadata, FORBIDDEN_METADATA_FIELDS);
  validate.assertValid('objects/report-metadata.schema.json', metadata);
}

function testMapReport(validate) {
  const report = reportBoundary.mapReport({
    id: 'report-1',
    conversation_id: 'conversation-1',
    run_id: RUN_ID,
    user_id: 'user-1',
    title: 'Report title',
    content_markdown: '# Report',
    status: 'generated',
    version: 1,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    metadata: JSON.stringify({
      runId: RUN_ID,
      source: 'persisted',
      modelTrace: MODEL_TRACE,
      langSmithTraceId: 'trace-report-1',
      provider: 'must-not-leak',
      tokenUsage: { totalTokens: 999 },
    }),
  });

  assert.equal(report.runId, RUN_ID);
  assert.deepEqual(report.sources, []);
  assert.equal(report.sourceCount, 0);
  assert.equal(report.sourceLineage, 'run_sources');
  assert.equal(report.sourceNoSourceReason, null);
  assertNoTopLevelFields(report.metadata, FORBIDDEN_METADATA_FIELDS);
  validate.assertValid('objects/report-metadata.schema.json', report.metadata);
  validate.assertValid('objects/report-artifact.schema.json', report);
}

function testEvaluationRequestMetadata() {
  const requestMetadata = evaluationBoundary.createEvaluationRequestMetadata({
    ...createForbiddenRequestMetadata(),
    evaluatorVersion: ' rubric-v1 ',
  });

  assert.deepEqual(requestMetadata, {
    evaluatorVersion: 'rubric-v1',
  });
}

function testEvaluationCreateMetadata(validate) {
  assert.throws(
    () => evaluationBoundary.createEvaluationMetadata({}, { modelTrace: MODEL_TRACE }, {}, {}),
    /requires canonical runId/,
  );

  const metadata = evaluationBoundary.createEvaluationMetadata(
    {
      ...createForbiddenRequestMetadata(),
      evaluatorVersion: 'rubric-v1',
    },
    { modelTrace: MODEL_TRACE },
    {
      status: 'submitted',
      langSmithTraceId: ' trace-eval-create ',
    },
    { runId: RUN_ID },
  );

  assert.equal(metadata.runId, RUN_ID);
  assert.equal(metadata.source, 'workbench-evaluation');
  assert.equal(metadata.resultVersion, 1);
  assert.equal(metadata.langSmithTraceId, 'trace-eval-create');
  assert.equal(metadata.evaluatorVersion, 'rubric-v1');
  assert.deepEqual(metadata.modelTrace, MODEL_TRACE);
  assert.notDeepEqual(metadata.modelTrace, MALICIOUS_MODEL_TRACE);
  assertNoTopLevelFields(metadata, FORBIDDEN_METADATA_FIELDS);
  validate.assertValid('objects/evaluation-metadata.schema.json', metadata);
}

function testEvaluationPersistedRead(validate) {
  const row = {
    run_id: RUN_ID,
    model_trace: JSON.stringify(MODEL_TRACE),
    metadata: JSON.stringify({
      ...createForbiddenRequestMetadata(),
      evaluatorVersion: 'rubric-v2',
      resultVersion: 2,
      modelTrace: MALICIOUS_MODEL_TRACE,
      langSmithTraceId: ' trace-eval-read ',
      langSmithEvaluation: {
        status: 'submitted',
      },
    }),
  };
  const metadata = evaluationBoundary.readPersistedEvaluationMetadata(row);

  assert.equal(metadata.runId, RUN_ID);
  assert.equal(metadata.source, 'workbench-evaluation');
  assert.equal(metadata.resultVersion, 2);
  assert.equal(metadata.evaluatorVersion, 'rubric-v2');
  assert.equal(metadata.langSmithTraceId, 'trace-eval-read');
  assert.deepEqual(metadata.modelTrace, MODEL_TRACE);
  assert.notDeepEqual(metadata.modelTrace, MALICIOUS_MODEL_TRACE);
  assertNoTopLevelFields(metadata, FORBIDDEN_METADATA_FIELDS);
  validate.assertValid('objects/evaluation-metadata.schema.json', metadata);

  assert.throws(
    () => evaluationBoundary.readPersistedEvaluationMetadata({ ...row, run_id: null }),
    /missing canonical runId/,
  );
}

function testMapResult(validate) {
  const result = evaluationBoundary.mapResult({
    id: 'evaluation-result-1',
    case_id: 'case-1',
    conversation_id: 'conversation-1',
    run_id: RUN_ID,
    verdict: 'pass',
    bad_case_reason: null,
    human_note: 'Looks correct',
    actual_summary: JSON.stringify({ markdownText: 'ok' }),
    model_trace: JSON.stringify(MODEL_TRACE),
    tool_summary: JSON.stringify([]),
    rag_summary: JSON.stringify({ sourceCount: 0 }),
    report_summary: JSON.stringify({ reportId: 'report-1' }),
    metadata: JSON.stringify({
      ...createForbiddenRequestMetadata(),
      evaluatorVersion: 'rubric-v3',
      resultVersion: 3,
      langSmithTraceId: 'trace-eval-map',
      langSmithEvaluation: {
        status: 'submitted',
      },
    }),
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  });

  assert.equal(result.runId, RUN_ID);
  assert.deepEqual(result.metadata.modelTrace, MODEL_TRACE);
  assertNoTopLevelFields(result.metadata, FORBIDDEN_METADATA_FIELDS);
  validate.assertValid('objects/evaluation-metadata.schema.json', result.metadata);
  validate.assertValid('objects/evaluation-result.schema.json', result);
}

function testModelLayerPricingSource(validate) {
  const usageCostMetadata = modelLayer.createUsageCostMetadata({
    billingType: 'free',
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
  });

  assert.equal(usageCostMetadata.costEstimate.pricingSource, 'catalog');
  validate.assertValid('objects/model-trace.schema.json', {
    ...MODEL_TRACE,
    usage: usageCostMetadata.usage,
    costEstimate: usageCostMetadata.costEstimate,
  });
}

function createRunSnapshotFixture(status) {
  return {
    id: RUN_ID,
    conversationId: 'conversation-1',
    mode: 'agent',
    status,
    modelTrace: null,
    reportState: 'hidden',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function createEventEnvelope(type, payload) {
  return {
    type,
    runId: RUN_ID,
    conversationId: 'conversation-1',
    timestamp: CREATED_AT,
    payload,
  };
}

function createRunStartedEventFixture(status = 'running') {
  const run = createRunSnapshotFixture(status);
  return createEventEnvelope('run_started', { run });
}

function createRunReusedEventFixture() {
  return createEventEnvelope('run_reused', {
    duplicate: true,
    reused: true,
    reason: 'existing_run',
    status: 'running',
    reusedRun: {
      id: RUN_ID,
      status: 'running',
      conclusionSource: 'none',
      reportState: 'hidden',
      completedAt: null,
    },
  });
}

function createStepStartedEventFixture() {
  return createEventEnvelope('step_started', {
    step: {
      stepId: 'step_schema',
      title: '读取数据源 Schema',
      description: '通过 schema_inspect 读取允许访问的表和字段。',
      startedAt: CREATED_AT,
    },
  });
}

function createStepCompletedEventFixture() {
  return createEventEnvelope('step_completed', {
    stepDelta: {
      stepId: 'step_schema',
      completedAt: UPDATED_AT,
      elapsedMs: 123,
    },
  });
}

function createStepFailedEventFixture() {
  return createEventEnvelope('step_failed', {
    stepDelta: {
      stepId: 'step_knowledge_search',
      errorMessage: '知识检索失败。',
      completedAt: UPDATED_AT,
      elapsedMs: 123,
      fallbackReason: 'rag_query_failed',
    },
  });
}

function createToolStartedEventFixture() {
  return createEventEnvelope('tool_started', {
    toolInvocation: {
      id: 'schema_inspect',
      toolId: 'schema_inspect',
      toolName: 'schema_inspect',
      displayName: '数据源结构读取',
      status: 'running',
      inputSummary: 'includeColumns=true',
      outputSummary: '',
      startedAt: CREATED_AT,
    },
  });
}

function createToolCompletedEventFixture() {
  return createEventEnvelope('tool_completed', {
    toolDelta: {
      toolId: 'schema_inspect',
      outputSummary: '读取 1 张表',
      completedAt: UPDATED_AT,
      elapsedMs: 123,
    },
  });
}

function createToolFailedEventFixture() {
  return createEventEnvelope('tool_failed', {
    toolDelta: {
      toolId: 'knowledge_search',
      errorMessage: '知识检索失败。',
      fallbackReason: 'rag_query_failed',
      completedAt: UPDATED_AT,
      elapsedMs: 123,
    },
  });
}

function createChartReadyEventFixture() {
  return createEventEnvelope('chart_ready', {
    chartData: RUN_CHART_DATA,
  });
}

function createConclusionDeltaEventFixture() {
  return createEventEnvelope('conclusion_delta', {
    delta: '核心指标保持稳定。',
  });
}

function createConclusionCompletedEventFixture() {
  return createEventEnvelope('conclusion_completed', {
    conclusion: AGENT_CONCLUSION.markdownText,
    agentConclusion: AGENT_CONCLUSION,
    modelTrace: MODEL_TRACE,
  });
}

function createRagSourcesReadyEventFixture() {
  return createEventEnvelope('rag_sources_ready', {
    sources: [RUN_SOURCE],
  });
}

function createReportPendingEventFixture() {
  return createEventEnvelope('report_pending', {
    metadata: {
      runtime: 'langgraph',
      langGraphNode: 'processing',
    },
  });
}

function createRunCompletedEventFixture() {
  return createEventEnvelope('run_completed', {
    completedAt: UPDATED_AT,
    elapsedMs: 123,
    assistantMessageId: 'message-1',
    metadata: {
      langSmithTrace: {
        traceId: 'trace-1',
      },
    },
    modelTrace: MODEL_TRACE,
  });
}

function createRunFailedEventFixture() {
  return createEventEnvelope('run_failed', {
    errorMessage: 'Agent Run 执行失败，请检查数据源或模型配置。',
    metadata: {
      langSmithTrace: {
        traceId: 'trace-1',
      },
    },
    modelTrace: MODEL_TRACE,
  });
}

function assertRunStartedEventIdentity(event) {
  assert.equal(event.runId, event.payload.run.id);
  assert.equal(event.conversationId, event.payload.run.conversationId);
}

function assertRunEventRecordIdentity(record) {
  assert.equal(record.event_type, record.payload.type);
  assert.equal(record.run_id, record.payload.runId);
  assert.equal(record.conversation_id, record.payload.conversationId);
}

function createAgentRunMetadataFixture(overrides = {}) {
  return {
    source: 'cloudbase-agent-run-real',
    runtime: 'langgraph-agent-run-v1',
    langGraphThreadId: `agent-run:${RUN_ID}`,
    langGraphCheckpointId: null,
    langSmithTraceId: LANGSMITH_TRACE.traceId,
    langSmithRunId: LANGSMITH_TRACE.runId,
    langSmithTraceStatus: LANGSMITH_TRACE.status,
    langSmithProjectName: LANGSMITH_TRACE.projectName,
    langSmithTrace: LANGSMITH_TRACE,
    clientRunId: 'client-run-1',
    clientRunIdMissing: false,
    dataProvider: RUN_DATA_SOURCE.provider,
    modelTrace: MODEL_TRACE,
    agentConclusion: AGENT_CONCLUSION,
    assistantMessageId: 'message-1',
    ...overrides,
  };
}

function createAgentRunRecordFixture(overrides = {}) {
  return {
    id: RUN_ID,
    conversation_id: 'conversation-1',
    user_id: 'user-1',
    usage_id: 'usage-1',
    client_run_id: 'client-run-1',
    mode: 'agent',
    status: 'completed',
    intent: RUN_PLAN.intent,
    prompt: '分析本月教学质量数据，找出异常指标',
    plan: RUN_PLAN,
    data_source_snapshot: RUN_DATA_SOURCE,
    chart_data: RUN_CHART_DATA,
    conclusion: AGENT_CONCLUSION.plainText,
    report_state: 'generated',
    started_at: CREATED_AT,
    completed_at: UPDATED_AT,
    elapsed_ms: 123,
    error_message: null,
    metadata: createAgentRunMetadataFixture(),
    ...overrides,
  };
}

function createRunEventRecordFixture(event = createRunStartedEventFixture(), overrides = {}) {
  return {
    id: 'event-1',
    run_id: event.runId,
    conversation_id: event.conversationId,
    user_id: 'user-1',
    seq: 1,
    event_type: event.type,
    payload: event,
    created_at: event.timestamp,
    ...overrides,
  };
}

const SSE_EVENT_SCHEMA_CASES = [
  ['events/run-started-event.schema.json', 'run_started', createRunStartedEventFixture],
  ['events/run-reused-event.schema.json', 'run_reused', createRunReusedEventFixture],
  ['events/step-started-event.schema.json', 'step_started', createStepStartedEventFixture],
  ['events/step-completed-event.schema.json', 'step_completed', createStepCompletedEventFixture],
  ['events/step-failed-event.schema.json', 'step_failed', createStepFailedEventFixture],
  ['events/tool-started-event.schema.json', 'tool_started', createToolStartedEventFixture],
  ['events/tool-completed-event.schema.json', 'tool_completed', createToolCompletedEventFixture],
  ['events/tool-failed-event.schema.json', 'tool_failed', createToolFailedEventFixture],
  ['events/chart-ready-event.schema.json', 'chart_ready', createChartReadyEventFixture],
  ['events/conclusion-delta-event.schema.json', 'conclusion_delta', createConclusionDeltaEventFixture],
  ['events/conclusion-completed-event.schema.json', 'conclusion_completed', createConclusionCompletedEventFixture],
  ['events/rag-sources-ready-event.schema.json', 'rag_sources_ready', createRagSourcesReadyEventFixture],
  ['events/report-pending-event.schema.json', 'report_pending', createReportPendingEventFixture],
  ['events/run-completed-event.schema.json', 'run_completed', createRunCompletedEventFixture],
  ['events/run-failed-event.schema.json', 'run_failed', createRunFailedEventFixture],
];

const SSE_EVENT_ENVELOPE_SCHEMA_FILE = 'events/run-sse-event-envelope.schema.json';
const SSE_EVENT_ENVELOPE_REF = 'run-sse-event-envelope.schema.json';
const SSE_EVENT_ENVELOPE_FIELDS = ['type', 'runId', 'conversationId', 'timestamp', 'payload'];
const CHART_DATA_FIELD = 'chartData';
const PERSISTENCE_EMPTY_OBJECT_REF = '#/$defs/EmptyObject';
const SSE_EVENT_TOP_LEVEL_BUSINESS_FIELDS = [
  'run',
  'step',
  'stepDelta',
  'stepId',
  'tool',
  'toolInvocation',
  'toolDelta',
  'toolId',
  'chartData',
  'sources',
  'report',
  'reportState',
  'conclusion',
  'agentConclusion',
  'modelTrace',
  'metadata',
  'errorMessage',
  'completedAt',
  'elapsedMs',
];

function getSseEventSchemaFiles(validate) {
  return validate.getSchemaFiles().filter((file) =>
    file.startsWith('events/') &&
    file.endsWith('.schema.json') &&
    file !== SSE_EVENT_ENVELOPE_SCHEMA_FILE,
  );
}

function assertEnvelopeShellConvention(eventSchema, file) {
  if (eventSchema.properties === undefined) {
    return;
  }

  assert.deepEqual(
    Object.keys(eventSchema.properties).sort(),
    SSE_EVENT_ENVELOPE_FIELDS.toSorted(),
    `${file} root properties must contain only SSE envelope fields`,
  );

  if (eventSchema.required !== undefined) {
    assert.deepEqual(
      eventSchema.required.toSorted(),
      SSE_EVENT_ENVELOPE_FIELDS.toSorted(),
      `${file} root required must contain only SSE envelope fields`,
    );
  }

  for (const fieldName of SSE_EVENT_ENVELOPE_FIELDS) {
    assert.deepEqual(Object.keys(eventSchema.properties[fieldName]), ['$ref']);
    assert.equal(
      eventSchema.properties[fieldName].$ref,
      `${SSE_EVENT_ENVELOPE_REF}#/properties/${fieldName}`,
    );
  }

  for (const fieldName of SSE_EVENT_TOP_LEVEL_BUSINESS_FIELDS) {
    assert.equal(Object.hasOwn(eventSchema.properties, fieldName), false);
  }
}

function assertSseEventSchemaConvention(validate, file) {
  const eventSchema = validate.getSchema(file);
  const envelopeRef = eventSchema.allOf?.[0];
  const eventConstraints = eventSchema.allOf?.[1];
  const eventType = eventConstraints?.properties?.type?.const;
  const payload = eventConstraints?.properties?.payload;

  assert.ok(Array.isArray(eventSchema.allOf), `${file} must define allOf`);
  assert.equal(envelopeRef?.$ref, SSE_EVENT_ENVELOPE_REF);
  assert.equal(typeof eventType, 'string', `${file} must constrain event type with type.const`);
  assert.equal(eventConstraints?.required?.includes('payload'), true);
  assert.equal(payload?.type, 'object');
  assert.equal(payload?.additionalProperties, false);
  assertEnvelopeShellConvention(eventSchema, file);

  for (const fieldName of SSE_EVENT_TOP_LEVEL_BUSINESS_FIELDS) {
    assert.equal(Object.hasOwn(eventSchema, fieldName), false);
  }
}

function testRunSnapshotCoreObjectSchemas(validate) {
  const runSnapshotSchema = validate.getSchema('objects/run-snapshot.schema.json');
  assert.equal(runSnapshotSchema.properties.plan.$ref, 'run-plan.schema.json');
  assert.equal(runSnapshotSchema.properties.dataSource.$ref, 'run-data-source.schema.json');
  assert.equal(runSnapshotSchema.properties.chartData.$ref, 'run-chart-data.schema.json');

  validate.assertValid('objects/run-plan.schema.json', RUN_PLAN);
  validate.assertInvalid('objects/run-plan.schema.json', {
    ...RUN_PLAN,
    steps: [],
  });

  validate.assertValid('objects/run-data-source.schema.json', RUN_DATA_SOURCE);
  validate.assertInvalid('objects/run-data-source.schema.json', {
    ...RUN_DATA_SOURCE,
    provider: 'unknown',
  });

  validate.assertValid('objects/run-chart-data.schema.json', RUN_CHART_DATA);
  validate.assertInvalid('objects/run-chart-data.schema.json', {
    ...RUN_CHART_DATA,
    config: {
      ...RUN_CHART_DATA.config,
      unknown: true,
    },
  });

  validate.assertValid('objects/run-snapshot.schema.json', {
    ...createRunSnapshotFixture('completed'),
    plan: RUN_PLAN,
    dataSource: RUN_DATA_SOURCE,
    chartData: RUN_CHART_DATA,
  });
  validate.assertInvalid('objects/run-snapshot.schema.json', {
    ...createRunSnapshotFixture('completed'),
    plan: {
      ...RUN_PLAN,
      unknown: true,
    },
  });
  validate.assertInvalid('objects/run-snapshot.schema.json', {
    ...createRunSnapshotFixture('completed'),
    dataSource: {
      ...RUN_DATA_SOURCE,
      unknown: true,
    },
  });
  validate.assertInvalid('objects/run-snapshot.schema.json', {
    ...createRunSnapshotFixture('completed'),
    chartData: null,
  });
}

function testAgentRunPersistenceContracts(validate) {
  const agentRunRecordSchema = validate.getSchema('objects/agent-run-record.schema.json');
  assert.ok(agentRunRecordSchema.properties.plan.anyOf.some((entry) => entry.$ref === 'run-plan.schema.json'));
  assert.ok(agentRunRecordSchema.properties.plan.anyOf.some((entry) => entry.$ref === PERSISTENCE_EMPTY_OBJECT_REF));
  assert.equal(agentRunRecordSchema.properties.data_source_snapshot.$ref, 'run-data-source.schema.json');
  assert.ok(agentRunRecordSchema.properties.chart_data.anyOf.some((entry) => entry.$ref === 'run-chart-data.schema.json'));
  assert.ok(agentRunRecordSchema.properties.chart_data.anyOf.some((entry) => entry.$ref === PERSISTENCE_EMPTY_OBJECT_REF));
  assert.equal(agentRunRecordSchema.properties.metadata.$ref, 'agent-run-metadata.schema.json');

  validate.assertValid('objects/agent-run-metadata.schema.json', createAgentRunMetadataFixture());
  validate.assertValid(
    'objects/agent-run-metadata.schema.json',
    createAgentRunMetadataFixture({
      modelTrace: null,
      agentConclusion: null,
      assistantMessageId: null,
      errorCode: 'quota_consume_failed',
      errorMessage: 'Agent Run quota consume failed.',
    }),
  );

  for (const fieldName of FORBIDDEN_METADATA_FIELDS) {
    validate.assertInvalid('objects/agent-run-metadata.schema.json', {
      ...createAgentRunMetadataFixture(),
      [fieldName]: 'must-not-leak-at-top-level',
    });
  }

  validate.assertValid('objects/agent-run-record.schema.json', createAgentRunRecordFixture());
  validate.assertValid(
    'objects/agent-run-record.schema.json',
    createAgentRunRecordFixture({
      usage_id: null,
      client_run_id: null,
      status: 'pending',
      intent: 'unknown',
      plan: {},
      chart_data: {},
      conclusion: null,
      report_state: 'hidden',
      completed_at: null,
      elapsed_ms: null,
      metadata: createAgentRunMetadataFixture({
        clientRunId: null,
        clientRunIdMissing: true,
        modelTrace: null,
        agentConclusion: null,
        assistantMessageId: null,
      }),
    }),
  );
  validate.assertInvalid('objects/agent-run-record.schema.json', createAgentRunRecordFixture({ plan: null }));
  validate.assertInvalid('objects/agent-run-record.schema.json', createAgentRunRecordFixture({
    plan: {
      ...RUN_PLAN,
      steps: [],
    },
  }));
  validate.assertInvalid('objects/agent-run-record.schema.json', createAgentRunRecordFixture({
    data_source_snapshot: {
      ...RUN_DATA_SOURCE,
      provider: 'unknown',
    },
  }));
  validate.assertInvalid('objects/agent-run-record.schema.json', createAgentRunRecordFixture({
    chart_data: {
      ...RUN_CHART_DATA,
      config: {
        ...RUN_CHART_DATA.config,
        unknown: true,
      },
    },
  }));
  validate.assertInvalid('objects/agent-run-record.schema.json', createAgentRunRecordFixture({ chart_data: null }));
  validate.assertInvalid('objects/agent-run-record.schema.json', createAgentRunRecordFixture({
    metadata: createAgentRunMetadataFixture({
      provider: 'must-not-leak-at-top-level',
    }),
  }));
}

function testRunEventPersistenceContracts(validate) {
  const runEventRecordSchema = validate.getSchema('objects/run-event-record.schema.json');
  assert.equal(runEventRecordSchema.properties.run_id.type, 'string');
  assert.equal(runEventRecordSchema.properties.conversation_id.type, 'string');
  assert.equal(runEventRecordSchema.properties.seq.minimum, 1);
  assert.equal(runEventRecordSchema.properties.payload.$ref, '../events/run-sse-event-envelope.schema.json');

  const runStartedEvent = createRunStartedEventFixture();
  const runStartedRecord = createRunEventRecordFixture(runStartedEvent);
  validate.assertValid('objects/run-event-record.schema.json', runStartedRecord);
  validate.assertValid('events/run-started-event.schema.json', runStartedRecord.payload);
  assertRunEventRecordIdentity(runStartedRecord);

  const chartReadyEvent = createChartReadyEventFixture();
  const chartReadyRecord = createRunEventRecordFixture(chartReadyEvent, {
    id: 'event-chart-ready',
    seq: 2,
  });
  validate.assertValid('objects/run-event-record.schema.json', chartReadyRecord);
  validate.assertValid('events/chart-ready-event.schema.json', chartReadyRecord.payload);
  assertRunEventRecordIdentity(chartReadyRecord);

  validate.assertInvalid('objects/run-event-record.schema.json', {
    ...runStartedRecord,
    seq: 0,
  });
  validate.assertInvalid('objects/run-event-record.schema.json', {
    ...runStartedRecord,
    payload: {
      type: 'run_started',
      run: createRunSnapshotFixture('running'),
    },
  });
  validate.assertInvalid('objects/run-event-record.schema.json', {
    ...runStartedRecord,
    payload: {
      ...runStartedEvent,
      run: createRunSnapshotFixture('running'),
    },
  });
  validate.assertInvalid('events/run-started-event.schema.json', {
    ...runStartedEvent,
    payload: {
      run: {
        ...createRunSnapshotFixture('running'),
        steps: [],
      },
    },
  });
  assert.throws(() =>
    assertRunEventRecordIdentity({
      ...runStartedRecord,
      event_type: 'chart_ready',
    }),
  );
  assert.throws(() =>
    assertRunEventRecordIdentity({
      ...runStartedRecord,
      run_id: 'run-mismatch',
    }),
  );
  assert.throws(() =>
    assertRunEventRecordIdentity({
      ...runStartedRecord,
      conversation_id: 'conversation-mismatch',
    }),
  );
}

function testDemoSeedRunSnapshotContracts(validate) {
  const templates = demoConversations.demoConversationTemplates;
  let seedRunCount = 0;
  let chartDataSeedCount = 0;

  assert.equal(Array.isArray(templates), true);

  for (const template of templates) {
    for (const seedRun of template.seed_runs ?? []) {
      seedRunCount += 1;
      validate.assertValid('objects/run-snapshot.schema.json', seedRun);

      if (Object.hasOwn(seedRun, CHART_DATA_FIELD)) {
        chartDataSeedCount += 1;
        validate.assertValid('objects/run-chart-data.schema.json', seedRun.chartData);
      }
    }
  }

  assert.ok(seedRunCount > 0, 'demo seed must include RunSnapshot records');
  assert.ok(chartDataSeedCount > 0, 'demo seed must cover chartData RunSnapshot records');
}

function testRunSnapshotStatusContract(validate) {
  for (const status of ['pending', 'running', 'completed', 'failed', 'stopped']) {
    validate.assertValid('objects/run-snapshot.schema.json', createRunSnapshotFixture(status));
  }

  for (const status of ['idle', 'success', 'error', 'cancelled']) {
    validate.assertInvalid('objects/run-snapshot.schema.json', createRunSnapshotFixture(status));
  }

  for (const [fieldName, value] of [
    ['sessionId', 'session-1'],
    ['displayRunId', 'RUN-1'],
    ['conclusionSource', 'none'],
    ['steps', []],
    ['toolInvocations', []],
    ['sources', []],
  ]) {
    validate.assertInvalid('objects/run-snapshot.schema.json', {
      ...createRunSnapshotFixture('completed'),
      [fieldName]: value,
    });
  }

  const runWithoutChartData = createRunSnapshotFixture('running');
  assert.equal(Object.hasOwn(runWithoutChartData, 'chartData'), false);
  validate.assertInvalid('objects/run-snapshot.schema.json', {
    ...createRunSnapshotFixture('running'),
    [CHART_DATA_FIELD]: null,
  });
  validate.assertValid('objects/run-snapshot.schema.json', {
    ...createRunSnapshotFixture('running'),
    chartData: RUN_CHART_DATA,
  });
}

function testRunSseEventContracts(validate) {
  const discoveredEventSchemaFiles = getSseEventSchemaFiles(validate);
  const fixtureEventSchemaFiles = SSE_EVENT_SCHEMA_CASES.map(([file]) => file).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const file of discoveredEventSchemaFiles) {
    assertSseEventSchemaConvention(validate, file);
  }

  assert.deepEqual(
    discoveredEventSchemaFiles,
    fixtureEventSchemaFiles,
    'SSE event fixture cases must cover every discovered event schema',
  );

  for (const [file, eventType, createFixture] of SSE_EVENT_SCHEMA_CASES) {
    assert.equal(validate.getSchema(file).allOf[1].properties.type.const, eventType);
    validate.assertValid(file, createFixture());
    validate.assertInvalid(file, {
      ...createFixture(),
      type: 'unexpected_event',
    });
    validate.assertInvalid(file, {
      ...createFixture(),
      step: { stepId: 'top-level-business-field' },
    });
  }

  const runStartedConstraints = validate.getSchema('events/run-started-event.schema.json').allOf[1];
  assert.equal(runStartedConstraints.properties.payload.properties.run.$ref, '../objects/run-snapshot.schema.json');
  assert.equal(Object.hasOwn(runStartedConstraints.properties.payload.properties.run, 'properties'), false);
  const chartReadyConstraints = validate.getSchema('events/chart-ready-event.schema.json').allOf[1];
  assert.equal(
    chartReadyConstraints.properties.payload.properties.chartData.$ref,
    '../objects/run-chart-data.schema.json',
  );
  const runStartedEvent = createRunStartedEventFixture();
  assertRunStartedEventIdentity(runStartedEvent);
  assert.deepEqual(Object.keys(runStartedEvent).toSorted(), SSE_EVENT_ENVELOPE_FIELDS.toSorted());
  assert.equal(Object.hasOwn(runStartedEvent.payload.run, 'chartData'), false);
  assert.equal(Object.hasOwn(runStartedEvent.payload.run, 'sessionId'), false);
  assert.equal(Object.hasOwn(runStartedEvent.payload.run, 'displayRunId'), false);
  assert.equal(Object.hasOwn(runStartedEvent.payload.run, 'steps'), false);
  assert.equal(Object.hasOwn(runStartedEvent.payload.run, 'toolInvocations'), false);
  assert.equal(Object.hasOwn(runStartedEvent.payload.run, 'sources'), false);
  validate.assertInvalid('events/run-started-event.schema.json', {
    ...createRunStartedEventFixture(),
    run: createRunSnapshotFixture('running'),
  });
  validate.assertInvalid('events/run-started-event.schema.json', {
    ...createRunStartedEventFixture(),
    payload: {
      run: {
        ...createRunSnapshotFixture('running'),
        steps: [],
      },
    },
  });
  validate.assertValid('events/run-started-event.schema.json', {
    ...createRunStartedEventFixture(),
    payload: {
      run: {
        ...createRunSnapshotFixture('running'),
        chartData: RUN_CHART_DATA,
      },
    },
  });
  validate.assertInvalid('events/chart-ready-event.schema.json', {
    ...createChartReadyEventFixture(),
    payload: {
      [CHART_DATA_FIELD]: null,
    },
  });

  const conclusionCompletedConstraints = validate.getSchema('events/conclusion-completed-event.schema.json').allOf[1];
  assert.equal(
    conclusionCompletedConstraints.properties.payload.properties.agentConclusion.$ref,
    '../objects/agent-conclusion.schema.json',
  );
  assert.equal(
    conclusionCompletedConstraints.properties.payload.properties.modelTrace.$ref,
    '../objects/model-trace.schema.json',
  );
  const ragSourcesReadyConstraints = validate.getSchema('events/rag-sources-ready-event.schema.json').allOf[1];
  assert.equal(
    ragSourcesReadyConstraints.properties.payload.properties.sources.items.$ref,
    '../objects/run-source.schema.json',
  );
  const runCompletedConstraints = validate.getSchema('events/run-completed-event.schema.json').allOf[1];
  assert.equal(
    runCompletedConstraints.properties.payload.properties.modelTrace.$ref,
    '../objects/model-trace.schema.json',
  );
  const runFailedConstraints = validate.getSchema('events/run-failed-event.schema.json').allOf[1];
  assert.equal(
    runFailedConstraints.properties.payload.properties.modelTrace.$ref,
    '../objects/model-trace.schema.json',
  );

  assert.throws(() =>
    assertRunStartedEventIdentity({
      ...createRunStartedEventFixture(),
      runId: 'run-mismatch',
    }),
  );
  assert.throws(() =>
    assertRunStartedEventIdentity({
      ...createRunStartedEventFixture(),
      conversationId: 'conversation-mismatch',
    }),
  );
}

const validate = await createSchemaValidators();

testReportRequestMetadata();
testReportCreateMetadata(validate);
testReportPersistedRead(validate);
testMapReport(validate);
testEvaluationRequestMetadata();
testEvaluationCreateMetadata(validate);
testEvaluationPersistedRead(validate);
testMapResult(validate);
testModelLayerPricingSource(validate);
testRunSnapshotCoreObjectSchemas(validate);
testAgentRunPersistenceContracts(validate);
testRunEventPersistenceContracts(validate);
testDemoSeedRunSnapshotContracts(validate);
testRunSnapshotStatusContract(validate);
testRunSseEventContracts(validate);

console.log('Metadata boundary tests passed.');
