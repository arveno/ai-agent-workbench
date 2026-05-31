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

function requireTypeScriptFile(filePath, stubs = {}) {
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
  loadedModule.require = (request) => {
    if (Object.hasOwn(stubs, request)) {
      return stubs[request];
    }

    return Module.prototype.require.call(loadedModule, request);
  };
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
const ragSources = requireTypeScriptFile(path.join(rootDir, 'src/utils/ragSources.ts'));
const mockRun = requireTypeScriptFile(
  path.join(rootDir, 'src/utils/mockRun.ts'),
  {
    '@/domain/run/boundary': {
      createLocalRunStoppedEvent: (runId) => ({
        type: 'run_stopped',
        runId,
      }),
    },
    '@/domain/run/view-model': {
      RunViewModelFactory: {
        fromMockRun: (params) => ({
          id: params.runId,
          conversationId: params.conversationId,
          displayRunId: params.runId,
          mode: 'mock',
          status: 'running',
          intent: 'data_analysis',
          prompt: params.prompt,
          plan: params.plan,
          dataSource: params.dataSource,
          steps: params.steps,
          toolInvocations: [],
          sources: params.sources,
          modelTrace: params.modelTrace,
          reportState: 'hidden',
          createdAt: params.timestamp,
          updatedAt: params.timestamp,
        }),
      },
    },
    './ragSources': ragSources,
  },
);

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

const TOOL_INVOCATION_INPUT = {
  metric: 'warning_count',
  groupBy: 'subject',
  limit: 10,
  timeRange: { type: 'none' },
  comparison: 'none',
};

const TOOL_INVOCATION_OUTPUT = {
  metric: 'warning_count',
  groupBy: 'subject',
  totalRecords: 1,
  rowCount: 1,
  averages: {
    dimension: '未分组',
    recordCount: 1,
    avg_score: 88,
    attendance_rate: 98,
    homework_completion_rate: 96,
    warning_count: 1,
  },
  summaryByGrade: [],
  summaryBySubject: [],
  summaryByMonth: [],
  rows: [
    {
      dimension: '数学',
      recordCount: 1,
      avg_score: 88,
      attendance_rate: 98,
      homework_completion_rate: 96,
      warning_count: 1,
      value: 1,
    },
  ],
  elapsedMs: 12,
};

const TOOL_INVOCATION_FAILED_OUTPUT = {
  fallbackReason: 'data_tool_query_failed',
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

const TOOL_INVOCATION_METADATA_FORBIDDEN_FIELDS = [
  'runStatus',
  'reportState',
  'reportStatus',
  'artifactStatus',
  'sourceState',
  'sources',
  'runSources',
  'ragSources',
  'report',
];

const SOURCE_LINEAGE_METADATA_FORBIDDEN_FIELDS = [
  'runStatus',
  'toolInvocation',
  'toolInvocations',
  'reportState',
  'reportStatus',
  'artifactStatus',
  'evaluationStatus',
  'sourceState',
  'sources',
  'sourceList',
  'runSources',
  'ragSources',
  'report',
];

const USAGE_METADATA_FORMAL_STATE_FORBIDDEN_FIELDS = [
  'runStatus',
  'toolInvocation',
  'toolInvocations',
  'sourceState',
  'sources',
  'runSources',
  'ragSources',
  'reportState',
  'reportStatus',
  'artifactStatus',
  'evaluationStatus',
  'report',
];

const DEMO_SEED_RUN_UI_ONLY_FIELDS = [
  'sessionId',
  'displayRunId',
  'steps',
  'toolInvocations',
  'sources',
  'runSources',
  'ragSources',
];

const API_SCHEMA_FILES = [
  'api/agent-run-quota-consume-request.schema.json',
  'api/agent-run-quota-consume-response.schema.json',
  'api/agent-run-quota-finish-request.schema.json',
  'api/agent-run-quota-finish-response.schema.json',
  'api/agent-run-quota-response.schema.json',
  'api/agent-run-quota-status-response.schema.json',
  'api/agent-run-stream-request.schema.json',
  'api/conversation-create-request.schema.json',
  'api/conversation-list-query.schema.json',
  'api/conversation-list-response.schema.json',
  'api/conversation-response.schema.json',
  'api/conversation-update-request.schema.json',
  'api/evaluation-cases-query.schema.json',
  'api/evaluation-cases-response.schema.json',
  'api/evaluation-create-request.schema.json',
  'api/evaluation-create-response.schema.json',
  'api/evaluation-list-query.schema.json',
  'api/evaluation-list-response.schema.json',
  'api/message-create-request.schema.json',
  'api/message-list-query.schema.json',
  'api/message-list-response.schema.json',
  'api/message-response.schema.json',
  'api/report-query.schema.json',
  'api/report-generate-request.schema.json',
  'api/report-list-response.schema.json',
  'api/report-response.schema.json',
  'api/report-status-update-query.schema.json',
  'api/report-status-update-request.schema.json',
  'api/report-status-update-response.schema.json',
  'api/runs-restore-query.schema.json',
  'api/runs-restore-response.schema.json',
  'api/workbench-api-error-response.schema.json',
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

function assertRunSourceRetrievalLogRelation(sourceRecord, retrievalLogRecord) {
  assert.equal(sourceRecord.retrieval_log_id, retrievalLogRecord.id);
  assert.equal(sourceRecord.run_id, retrievalLogRecord.run_id);
  assert.equal(sourceRecord.conversation_id, retrievalLogRecord.conversation_id);
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

function createToolInvocationMetadataFixture(overrides = {}) {
  const metadata = {
    source: 'cloudbase-agent-run-real',
    runtimeToolId: 'aggregate_table',
    toolRuntime: 'langchain_structured_tool',
    langChainToolName: 'aggregate_table',
    runId: RUN_ID,
    ...overrides,
  };

  for (const [fieldName, fieldValue] of Object.entries(overrides)) {
    if (fieldValue === undefined) {
      delete metadata[fieldName];
    }
  }

  return metadata;
}

function createToolInvocationRecordFixture(overrides = {}) {
  return {
    id: 'tool-invocation-1',
    run_id: RUN_ID,
    conversation_id: 'conversation-1',
    user_id: 'user-1',
    tool_name: 'aggregate_table',
    display_name: '数据聚合分析',
    status: 'completed',
    input: TOOL_INVOCATION_INPUT,
    input_summary: JSON.stringify(TOOL_INVOCATION_INPUT),
    output: TOOL_INVOCATION_OUTPUT,
    output_summary: '读取 1 条记录，返回 1 条聚合结果',
    started_at: CREATED_AT,
    finished_at: UPDATED_AT,
    elapsed_ms: 123,
    error: null,
    metadata: createToolInvocationMetadataFixture(),
    ...overrides,
  };
}

function createRunSourceMetadataFixture(overrides = {}) {
  return {
    provider: 'knowledge_search',
    retrieverProvider: 'langchain_retriever',
    sourceName: 'CloudBase MySQL 知识库',
    documentTitle: '教学质量知识库',
    chunkTitle: '异常指标说明',
    category: '教学指标',
    rawScore: 18,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createRunSourceRecordFixture(overrides = {}) {
  return {
    id: 'run-source-1',
    run_id: RUN_ID,
    conversation_id: 'conversation-1',
    user_id: 'user-1',
    tool_invocation_id: 'tool-invocation-knowledge-search',
    retrieval_log_id: 'retrieval-log-1',
    document_id: 'knowledge-document-1',
    chunk_id: 'knowledge-chunk-1',
    citation_label: '[S1]',
    source_order: 1,
    title: '教学质量知识库',
    preview: '异常指标用于提示需要关注的教学质量波动。',
    score: 0.9,
    source_type: 'knowledge',
    used_in_answer: true,
    no_source_reason: null,
    created_at: CREATED_AT,
    metadata: createRunSourceMetadataFixture(),
    ...overrides,
  };
}

function createRetrievalLogMetadataFixture(overrides = {}) {
  return {
    source: 'cloudbase-agent-run-real',
    provider: 'knowledge_search',
    retrieverProvider: 'langchain_retriever',
    topK: 5,
    terms: ['异常指标', '教学质量'],
    totalMatches: 2,
    matchedChunkCount: 1,
    ...overrides,
  };
}

function createRetrievalLogRecordFixture(overrides = {}) {
  return {
    id: 'retrieval-log-1',
    run_id: RUN_ID,
    conversation_id: 'conversation-1',
    user_id: 'user-1',
    tool_invocation_id: 'tool-invocation-knowledge-search',
    query: '异常指标是什么',
    provider: 'knowledge_search',
    matched_chunk_count: 1,
    created_at: CREATED_AT,
    metadata: createRetrievalLogMetadataFixture(),
    ...overrides,
  };
}

function createAgentRunUsageMetadataFixture(overrides = {}) {
  const metadata = {
    source: 'cloudbase-agent-run-real',
    runId: RUN_ID,
    clientRunId: 'client-run-1',
    ...overrides,
  };

  for (const [fieldName, fieldValue] of Object.entries(overrides)) {
    if (fieldValue === undefined) {
      delete metadata[fieldName];
    }
  }

  return metadata;
}

function createAgentRunUsageRecordFixture(overrides = {}) {
  return {
    id: 'usage-1',
    user_id: 'user-1',
    run_id: RUN_ID,
    quota_type: 'agent_run',
    status: 'started',
    started_at: CREATED_AT,
    finished_at: null,
    error_code: null,
    metadata: createAgentRunUsageMetadataFixture(),
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function createAgentRunQuotaRecordFixture(overrides = {}) {
  return {
    id: 'quota-1',
    user_id: 'user-1',
    quota_type: 'agent_run',
    quota_limit: 20,
    quota_used: 1,
    period_start: '2026-05-01 00:00:00.000',
    period_end: '2026-06-01 00:00:00.000',
    metadata: {
      source: 'cloudbase-agent-run-real',
    },
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

function createConversationRecordFixture(overrides = {}) {
  return {
    id: 'conversation-1',
    user_id: 'user-1',
    title: '教学质量分析',
    summary: '本月教学质量分析会话',
    mode: 'agent',
    status: 'active',
    visibility: 'private',
    source_template_id: null,
    latest_run_id: RUN_ID,
    message_count: 2,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    archived_at: null,
    metadata: { source: 'contract-fixture' },
    ...overrides,
  };
}

function createMessageRecordFixture(overrides = {}) {
  return {
    id: 'message-1',
    conversation_id: 'conversation-1',
    user_id: 'user-1',
    role: 'user',
    kind: 'text',
    content: '分析本月教学质量数据',
    run_id: RUN_ID,
    client_message_id: 'client-message-1',
    status: 'completed',
    created_at: CREATED_AT,
    metadata: { source: 'contract-fixture' },
    ...overrides,
  };
}

function createReportArtifactFixture(overrides = {}) {
  return {
    id: 'report-1',
    conversation_id: 'conversation-1',
    runId: RUN_ID,
    user_id: 'user-1',
    title: '教学质量分析报告',
    content_markdown: '# 教学质量分析报告',
    status: 'generated',
    version: 1,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    metadata: {
      runId: RUN_ID,
      source: 'persisted',
      reportState: 'generated',
      toolNames: ['aggregate_table'],
      modelTrace: MODEL_TRACE,
      langSmithTraceId: 'trace-report-1',
    },
    sources: [RUN_SOURCE],
    sourceCount: 1,
    sourceLineage: 'run_sources',
    sourceNoSourceReason: null,
    ...overrides,
  };
}

function createDemoSeedReportFixture(overrides = {}) {
  return {
    artifact: createReportArtifactFixture(),
    ...overrides,
  };
}

function createEvaluationCaseFixture(overrides = {}) {
  return {
    id: 'case-1',
    title: '教学质量分析应答',
    question: '分析本月教学质量数据',
    category: 'data_analysis',
    expectedIntent: 'data_analysis',
    expectedTools: ['aggregate_table'],
    expectedRag: { required: false },
    expectedReport: { required: true },
    expectedConclusionPoints: ['指出异常指标'],
    metadata: { source: 'contract-fixture' },
    sortOrder: 1,
    ...overrides,
  };
}

function createEvaluationResultFixture(overrides = {}) {
  return {
    id: 'evaluation-result-1',
    caseId: 'case-1',
    conversationId: 'conversation-1',
    runId: RUN_ID,
    verdict: 'pass',
    badCaseReason: null,
    humanNote: 'Looks correct',
    actualSummary: { markdownText: 'ok' },
    modelTrace: MODEL_TRACE,
    toolSummary: [],
    ragSummary: { sourceCount: 1 },
    reportSummary: { reportId: 'report-1' },
    metadata: {
      runId: RUN_ID,
      source: 'workbench-evaluation',
      resultVersion: 1,
      modelTrace: MODEL_TRACE,
      evaluatorVersion: 'rubric-v1',
      langSmithTraceId: 'trace-eval-1',
      langSmithEvaluation: { status: 'submitted' },
    },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createAgentRunQuotaResponseFixture(overrides = {}) {
  return {
    quotaType: 'agent_run',
    quotaLimit: 20,
    quotaUsed: 1,
    remaining: 19,
    periodStart: '2026-05-01 00:00:00.000',
    periodEnd: '2026-06-01 00:00:00.000',
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

function testQuotaUsagePersistenceContracts(validate) {
  const usageRecordSchema = validate.getSchema('objects/agent-run-usage-record.schema.json');
  const usageMetadataSchema = validate.getSchema('objects/agent-run-usage-metadata.schema.json');
  const quotaRecordSchema = validate.getSchema('objects/agent-run-quota-record.schema.json');

  assert.equal(usageRecordSchema.properties.quota_type.const, 'agent_run');
  assert.deepEqual(usageRecordSchema.properties.status.enum.toSorted(), ['completed', 'failed', 'started', 'stopped']);
  assert.equal(usageRecordSchema.properties.metadata.$ref, 'agent-run-usage-metadata.schema.json');
  assert.equal(usageMetadataSchema.properties.modelTrace.anyOf[0].$ref, 'model-trace.schema.json');
  assert.equal(
    usageMetadataSchema.properties.langSmithTrace.anyOf[0].$ref,
    'agent-run-metadata.schema.json#/$defs/LangSmithTrace',
  );
  assert.equal(Object.hasOwn(usageMetadataSchema.properties, 'usage'), false);
  assert.equal(Object.hasOwn(usageMetadataSchema.properties, 'costEstimate'), false);
  assert.equal(quotaRecordSchema.properties.quota_type.const, 'agent_run');
  assert.equal(quotaRecordSchema.properties.quota_limit.minimum, 0);
  assert.equal(quotaRecordSchema.properties.quota_used.minimum, 0);
  assert.equal(Object.hasOwn(quotaRecordSchema.properties, 'remaining'), false);

  validate.assertValid('objects/agent-run-usage-metadata.schema.json', {});
  validate.assertValid('objects/agent-run-usage-metadata.schema.json', createAgentRunUsageMetadataFixture());
  validate.assertValid('objects/agent-run-usage-metadata.schema.json', createAgentRunUsageMetadataFixture({
    clientRunId: null,
  }));
  validate.assertValid('objects/agent-run-usage-metadata.schema.json', createAgentRunUsageMetadataFixture({
    clientRunId: undefined,
    assistantMessageId: 'message-1',
    langSmithTrace: LANGSMITH_TRACE,
    modelTrace: MODEL_TRACE,
  }));
  validate.assertValid('objects/agent-run-usage-metadata.schema.json', createAgentRunUsageMetadataFixture({
    clientRunId: undefined,
    langSmithTrace: LANGSMITH_TRACE,
    modelTrace: MODEL_TRACE,
  }));
  validate.assertValid('objects/model-trace.schema.json', MODEL_TRACE);

  for (const fieldName of FORBIDDEN_METADATA_FIELDS) {
    validate.assertInvalid('objects/agent-run-usage-metadata.schema.json', {
      ...createAgentRunUsageMetadataFixture({
        modelTrace: MODEL_TRACE,
      }),
      [fieldName]: 'must-not-leak-at-top-level',
    });
  }

  for (const fieldName of USAGE_METADATA_FORMAL_STATE_FORBIDDEN_FIELDS) {
    validate.assertInvalid('objects/agent-run-usage-metadata.schema.json', {
      ...createAgentRunUsageMetadataFixture(),
      [fieldName]: 'must-not-carry-formal-state',
    });
  }

  validate.assertValid('objects/agent-run-usage-record.schema.json', createAgentRunUsageRecordFixture());
  validate.assertValid('objects/agent-run-usage-record.schema.json', createAgentRunUsageRecordFixture({
    id: 'usage-completed',
    status: 'completed',
    finished_at: UPDATED_AT,
    metadata: createAgentRunUsageMetadataFixture({
      clientRunId: undefined,
      assistantMessageId: 'message-1',
      langSmithTrace: LANGSMITH_TRACE,
      modelTrace: MODEL_TRACE,
    }),
    updated_at: UPDATED_AT,
  }));
  validate.assertValid('objects/agent-run-usage-record.schema.json', createAgentRunUsageRecordFixture({
    id: 'usage-failed',
    status: 'failed',
    finished_at: UPDATED_AT,
    error_code: 'run_failed',
    metadata: createAgentRunUsageMetadataFixture({
      clientRunId: undefined,
      langSmithTrace: LANGSMITH_TRACE,
      modelTrace: MODEL_TRACE,
    }),
    updated_at: UPDATED_AT,
  }));
  validate.assertValid('objects/agent-run-usage-record.schema.json', createAgentRunUsageRecordFixture({
    id: 'usage-stopped',
    status: 'stopped',
    finished_at: UPDATED_AT,
    error_code: 'client_disconnected',
    metadata: createAgentRunUsageMetadataFixture({
      clientRunId: undefined,
      langSmithTrace: LANGSMITH_TRACE,
      modelTrace: MODEL_TRACE,
    }),
    updated_at: UPDATED_AT,
  }));

  validate.assertInvalid('objects/agent-run-usage-record.schema.json', createAgentRunUsageRecordFixture({
    status: 'running',
  }));
  validate.assertInvalid('objects/agent-run-usage-record.schema.json', createAgentRunUsageRecordFixture({
    quota_type: 'model_usage',
  }));
  validate.assertInvalid('objects/agent-run-usage-record.schema.json', createAgentRunUsageRecordFixture({
    metadata: createAgentRunUsageMetadataFixture({
      provider: 'must-not-leak-at-top-level',
    }),
  }));

  validate.assertValid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture());
  validate.assertValid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    id: 'quota-exhausted',
    quota_used: 20,
  }));
  validate.assertValid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    id: 'quota-zero-used',
    quota_used: 0,
  }));
  validate.assertValid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    id: 'quota-null-period-end',
    period_end: null,
    metadata: {},
  }));
  validate.assertInvalid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    quota_type: 'model_usage',
  }));
  validate.assertInvalid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    quota_limit: -1,
  }));
  validate.assertInvalid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    quota_used: -1,
  }));
  validate.assertInvalid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    runId: RUN_ID,
  }));
  validate.assertInvalid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    sources: [],
  }));
  validate.assertInvalid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    reportState: 'generated',
  }));
  validate.assertInvalid('objects/agent-run-quota-record.schema.json', createAgentRunQuotaRecordFixture({
    metadata: {
      source: 'cloudbase-agent-run-real',
      runId: RUN_ID,
    },
  }));

  // JSON Schema draft 2020-12 without $data cannot express quota_used <= quota_limit.
  // The runtime consume boundary enforces that check before the CAS quota update.
  const overLimitQuota = createAgentRunQuotaRecordFixture({ quota_limit: 1, quota_used: 2 });
  assert.equal(overLimitQuota.quota_used > overLimitQuota.quota_limit, true);
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

function testToolInvocationPersistenceContracts(validate) {
  const toolInvocationRecordSchema = validate.getSchema('objects/tool-invocation-record.schema.json');
  assert.equal(toolInvocationRecordSchema.properties.tool_name.$ref, '#/$defs/ToolName');
  assert.equal(toolInvocationRecordSchema.properties.metadata.$ref, 'tool-invocation-metadata.schema.json');
  assert.equal(toolInvocationRecordSchema.properties.output.$ref, '#/$defs/ToolInvocationOutput');
  assert.equal(Object.hasOwn(toolInvocationRecordSchema.properties, 'tool_id'), false);
  assert.equal(Object.hasOwn(toolInvocationRecordSchema.properties, 'completed_at'), false);

  validate.assertValid('objects/tool-invocation-metadata.schema.json', createToolInvocationMetadataFixture());
  validate.assertValid('objects/tool-invocation-metadata.schema.json', createToolInvocationMetadataFixture({
    runId: undefined,
  }));
  validate.assertValid('objects/tool-invocation-metadata.schema.json', createToolInvocationMetadataFixture({
    fallbackReason: 'data_tool_query_failed',
  }));

  for (const fieldName of TOOL_INVOCATION_METADATA_FORBIDDEN_FIELDS) {
    validate.assertInvalid('objects/tool-invocation-metadata.schema.json', {
      ...createToolInvocationMetadataFixture(),
      [fieldName]: 'must-not-carry-formal-state',
    });
  }

  validate.assertValid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture());
  validate.assertValid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    id: 'tool-invocation-running',
    tool_name: 'schema_inspect',
    display_name: '数据源结构读取',
    status: 'running',
    input: { includeColumns: true },
    input_summary: 'includeColumns=true',
    output: {},
    output_summary: null,
    finished_at: null,
    elapsed_ms: null,
    error: null,
    metadata: createToolInvocationMetadataFixture({
      runtimeToolId: 'schema_inspect',
      langChainToolName: 'schema_inspect',
      runId: undefined,
    }),
  }));
  validate.assertValid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    id: 'tool-invocation-failed',
    status: 'failed',
    output: TOOL_INVOCATION_FAILED_OUTPUT,
    output_summary: 'CloudBase MySQL teaching_metrics query failed.',
    error: 'CloudBase MySQL teaching_metrics query failed.',
    metadata: createToolInvocationMetadataFixture({
      fallbackReason: TOOL_INVOCATION_FAILED_OUTPUT.fallbackReason,
    }),
  }));

  validate.assertInvalid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    status: 'success',
  }));
  validate.assertInvalid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    metadata: createToolInvocationMetadataFixture({
      reportState: 'generated',
    }),
  }));
  validate.assertInvalid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    output: null,
  }));
  validate.assertInvalid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    output: [],
  }));
  validate.assertInvalid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    elapsed_ms: -1,
  }));
  validate.assertInvalid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    tool_id: 'aggregate_table',
  }));

  for (const requiredField of ['id', 'run_id', 'tool_name']) {
    const invalidRecord = createToolInvocationRecordFixture();
    delete invalidRecord[requiredField];
    validate.assertInvalid('objects/tool-invocation-record.schema.json', invalidRecord);
  }

  validate.assertInvalid('objects/tool-invocation-record.schema.json', createToolInvocationRecordFixture({
    metadata: {
      source: 'cloudbase-agent-run-real',
      toolRuntime: 'langchain_structured_tool',
      langChainToolName: 'aggregate_table',
      runId: RUN_ID,
    },
  }));
}

function testSourceRetrievalPersistenceContracts(validate) {
  const runSourceRecordSchema = validate.getSchema('objects/run-source-record.schema.json');
  const retrievalLogRecordSchema = validate.getSchema('objects/retrieval-log-record.schema.json');
  const canonicalRunSourceSchema = validate.getSchema('objects/run-source.schema.json');

  assert.equal(runSourceRecordSchema.properties.metadata.$ref, 'run-source-metadata.schema.json');
  assert.equal(retrievalLogRecordSchema.properties.metadata.$ref, 'retrieval-log-metadata.schema.json');
  assert.equal(runSourceRecordSchema.properties.run_id.type, 'string');
  assert.equal(Object.hasOwn(runSourceRecordSchema.properties, 'runId'), false);
  assert.equal(canonicalRunSourceSchema.properties.runId.type, 'string');
  assert.equal(Object.hasOwn(canonicalRunSourceSchema.properties, 'run_id'), false);
  assert.equal(retrievalLogRecordSchema.properties.matched_chunk_count.minimum, 0);
  assert.equal(Object.hasOwn(retrievalLogRecordSchema.properties, 'result_count'), false);
  assert.equal(Object.hasOwn(retrievalLogRecordSchema.properties, 'top_k'), false);
  assert.equal(Object.hasOwn(retrievalLogRecordSchema.properties, 'no_source_reason'), false);

  validate.assertValid('objects/run-source-metadata.schema.json', createRunSourceMetadataFixture());
  validate.assertValid('objects/run-source-metadata.schema.json', createRunSourceMetadataFixture({
    documentTitle: null,
    chunkTitle: null,
    category: null,
    rawScore: null,
    updatedAt: null,
  }));
  validate.assertValid('objects/retrieval-log-metadata.schema.json', createRetrievalLogMetadataFixture());
  validate.assertValid('objects/retrieval-log-metadata.schema.json', createRetrievalLogMetadataFixture({
    topK: null,
    totalMatches: 0,
    matchedChunkCount: 0,
    terms: [],
  }));

  for (const fieldName of SOURCE_LINEAGE_METADATA_FORBIDDEN_FIELDS) {
    validate.assertInvalid('objects/run-source-metadata.schema.json', {
      ...createRunSourceMetadataFixture(),
      [fieldName]: 'must-not-carry-formal-state',
    });
    validate.assertInvalid('objects/retrieval-log-metadata.schema.json', {
      ...createRetrievalLogMetadataFixture(),
      [fieldName]: 'must-not-carry-formal-state',
    });
  }

  const retrievalLogRecord = createRetrievalLogRecordFixture();
  const runSourceRecord = createRunSourceRecordFixture({
    retrieval_log_id: retrievalLogRecord.id,
  });
  validate.assertValid('objects/retrieval-log-record.schema.json', retrievalLogRecord);
  validate.assertValid('objects/run-source-record.schema.json', runSourceRecord);
  validate.assertValid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    used_in_answer: true,
  }));
  validate.assertValid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    used_in_answer: 1,
  }));
  validate.assertValid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    used_in_answer: 0,
  }));
  assertRunSourceRetrievalLogRelation(runSourceRecord, retrievalLogRecord);

  validate.assertValid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    id: 'run-source-no-source',
    tool_invocation_id: null,
    retrieval_log_id: null,
    document_id: null,
    chunk_id: null,
    citation_label: null,
    title: '无匹配来源',
    preview: '本次检索未命中可引用来源。',
    score: null,
    used_in_answer: false,
    no_source_reason: 'no_relevant_chunk',
    metadata: createRunSourceMetadataFixture({
      documentTitle: null,
      chunkTitle: null,
      category: null,
      rawScore: null,
      updatedAt: null,
    }),
  }));
  validate.assertValid('objects/retrieval-log-record.schema.json', createRetrievalLogRecordFixture({
    id: 'retrieval-log-no-result',
    matched_chunk_count: 0,
    metadata: createRetrievalLogMetadataFixture({
      totalMatches: 0,
      matchedChunkCount: 0,
      terms: [],
    }),
  }));

  validate.assertInvalid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    source_type: 'ui_source',
  }));
  validate.assertInvalid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    score: '0.9',
  }));
  validate.assertInvalid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    score: -1,
  }));
  validate.assertInvalid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    metadata: {
      ...createRunSourceMetadataFixture(),
      reportState: 'generated',
    },
  }));
  validate.assertInvalid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    sources: [],
  }));
  validate.assertInvalid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    used_in_answer: 2,
  }));
  validate.assertInvalid('objects/run-source-record.schema.json', createRunSourceRecordFixture({
    used_in_answer: '1',
  }));
  validate.assertInvalid('objects/retrieval-log-record.schema.json', createRetrievalLogRecordFixture({
    matched_chunk_count: -1,
  }));
  validate.assertInvalid('objects/retrieval-log-record.schema.json', createRetrievalLogRecordFixture({
    metadata: createRetrievalLogMetadataFixture({
      topK: -1,
    }),
  }));
  validate.assertInvalid('objects/retrieval-log-record.schema.json', createRetrievalLogRecordFixture({
    metadata: createRetrievalLogMetadataFixture({
      matchedChunkCount: -1,
    }),
  }));
  validate.assertInvalid('objects/retrieval-log-record.schema.json', createRetrievalLogRecordFixture({
    metadata: {
      ...createRetrievalLogMetadataFixture(),
      sources: [RUN_SOURCE],
    },
  }));

  for (const requiredField of ['id', 'run_id', 'conversation_id', 'title', 'preview']) {
    const invalidRecord = createRunSourceRecordFixture();
    delete invalidRecord[requiredField];
    validate.assertInvalid('objects/run-source-record.schema.json', invalidRecord);
  }

  assert.throws(() =>
    assertRunSourceRetrievalLogRelation({
      ...runSourceRecord,
      retrieval_log_id: 'retrieval-log-mismatch',
    }, retrievalLogRecord),
  );
  assert.throws(() =>
    assertRunSourceRetrievalLogRelation({
      ...runSourceRecord,
      run_id: 'run-mismatch',
    }, retrievalLogRecord),
  );
  assert.throws(() =>
    assertRunSourceRetrievalLogRelation({
      ...runSourceRecord,
      conversation_id: 'conversation-mismatch',
    }, retrievalLogRecord),
  );
}

function testHttpApiBoundaryContracts(validate) {
  const schemaFiles = validate.getSchemaFiles();
  const generatedTypes = readFileSync(
    path.join(rootDir, 'contracts/generated/workbench-contract.ts'),
    'utf8',
  );

  for (const file of API_SCHEMA_FILES) {
    assert.ok(schemaFiles.includes(file), `${file} must be discovered by schema tooling`);
  }

  for (const interfaceName of [
    'AgentRunStreamRequest',
    'RunsRestoreResponse',
    'ConversationCreateRequest',
    'ConversationRecord',
    'MessageCreateRequest',
    'MessageRecord',
    'ReportGenerateRequest',
    'ReportStatusUpdateQuery',
    'EvaluationCreateRequest',
    'EvaluationCase',
    'AgentRunQuotaResponse',
    'WorkbenchApiErrorResponse',
  ]) {
    assert.match(generatedTypes, new RegExp(`export interface ${interfaceName}\\b`));
  }

  for (const exportName of ['ReportQuery']) {
    assert.match(generatedTypes, new RegExp(`export (?:interface|type) ${exportName}\\b`));
  }

  validate.assertValid('api/workbench-api-error-response.schema.json', {
    ok: false,
    errorCode: 'validation_error',
    message: 'Invalid request.',
  });
  validate.assertInvalid('api/workbench-api-error-response.schema.json', {
    ok: true,
    errorCode: 'validation_error',
    message: 'Invalid request.',
  });

  validate.assertValid('api/agent-run-stream-request.schema.json', {
    conversationId: 'conversation-1',
    prompt: '分析本月教学质量数据',
    selectedModelId: MODEL_TRACE.selectedModelId,
    clientRunId: 'client-run-1',
    provider: RUN_DATA_SOURCE.provider,
  });
  validate.assertValid('api/agent-run-stream-request.schema.json', {
    conversationId: 'conversation-1',
  });
  validate.assertInvalid('api/agent-run-stream-request.schema.json', {
    prompt: '分析本月教学质量数据',
    selectedModelId: MODEL_TRACE.selectedModelId,
  });
  validate.assertInvalid('api/agent-run-stream-request.schema.json', {
    conversationId: 'conversation-1',
    prompt: '分析本月教学质量数据',
    selectedModelId: 7,
  });
  validate.assertInvalid('api/agent-run-stream-request.schema.json', {
    conversationId: 'conversation-1',
    prompt: '分析本月教学质量数据',
    selectedModelId: MODEL_TRACE.selectedModelId,
    displayRunId: RUN_ID,
  });

  const runsRestoreSchema = validate.getSchema('api/runs-restore-response.schema.json');
  assert.equal(runsRestoreSchema.properties.data.properties.run.anyOf[0].$ref, '../objects/agent-run-record.schema.json');
  assert.equal(runsRestoreSchema.properties.data.properties.events.items.$ref, '../objects/run-event-record.schema.json');
  assert.equal(
    runsRestoreSchema.properties.data.properties.toolInvocations.items.$ref,
    '../objects/tool-invocation-record.schema.json',
  );
  assert.equal(runsRestoreSchema.properties.data.properties.sources.items.$ref, '../objects/run-source-record.schema.json');
  validate.assertValid('api/runs-restore-query.schema.json', { conversationId: 'conversation-1', latest: 1 });
  validate.assertValid('api/runs-restore-response.schema.json', {
    ok: true,
    data: {
      run: createAgentRunRecordFixture(),
      events: [createRunEventRecordFixture()],
      toolInvocations: [createToolInvocationRecordFixture()],
      sources: [createRunSourceRecordFixture()],
    },
  });
  validate.assertInvalid('api/runs-restore-response.schema.json', {
    ok: true,
    data: {
      run: {
        ...createAgentRunRecordFixture(),
        displayRunId: RUN_ID,
      },
      events: [createRunEventRecordFixture()],
      toolInvocations: [createToolInvocationRecordFixture()],
      sources: [createRunSourceRecordFixture()],
    },
  });

  validate.assertValid('api/conversation-create-request.schema.json', {
    title: '教学质量分析',
    summary: '本月教学质量分析',
    mode: 'agent',
    metadata: { source: 'manual' },
  });
  validate.assertInvalid('api/conversation-create-request.schema.json', {
    title: '教学质量分析',
    runsById: {},
  });
  validate.assertValid('api/conversation-update-request.schema.json', { title: '新标题' });
  validate.assertInvalid('api/conversation-update-request.schema.json', {
    title: '新标题',
    status: 'archived',
  });
  validate.assertValid('api/conversation-list-response.schema.json', {
    ok: true,
    data: {
      conversations: [createConversationRecordFixture()],
      nextCursor: null,
    },
  });
  validate.assertInvalid('api/conversation-list-response.schema.json', {
    ok: true,
    data: {
      conversations: [{ ...createConversationRecordFixture(), latestRunId: RUN_ID }],
      nextCursor: null,
    },
  });

  validate.assertValid('api/message-create-request.schema.json', {
    conversationId: 'conversation-1',
    role: 'user',
    kind: 'text',
    content: '分析本月教学质量数据',
    runId: RUN_ID,
    clientMessageId: 'client-message-1',
    status: 'completed',
    metadata: { source: 'manual' },
  });
  validate.assertInvalid('api/message-create-request.schema.json', {
    role: 'user',
    content: '分析本月教学质量数据',
  });
  validate.assertInvalid('api/message-create-request.schema.json', {
    conversationId: 'conversation-1',
    role: 'user',
    content: '分析本月教学质量数据',
    runViewModel: {},
  });
  validate.assertValid('api/message-list-response.schema.json', {
    ok: true,
    data: {
      messages: [createMessageRecordFixture()],
      nextCursor: null,
    },
  });
  validate.assertInvalid('api/message-list-response.schema.json', {
    ok: true,
    data: {
      messages: [{ ...createMessageRecordFixture(), displayRunId: RUN_ID }],
      nextCursor: null,
    },
  });

  const reportResponseSchema = validate.getSchema('api/report-response.schema.json');
  assert.equal(reportResponseSchema.properties.data.$ref, '../objects/report-artifact.schema.json');
  validate.assertValid('api/report-query.schema.json', { id: 'report-1' });
  validate.assertValid('api/report-query.schema.json', { conversationId: 'conversation-1' });
  validate.assertInvalid('api/report-query.schema.json', {
    id: 'report-1',
    data: createReportArtifactFixture(),
  });
  validate.assertInvalid('api/report-query.schema.json', {
    conversationId: 'conversation-1',
    response: { ok: true },
  });
  validate.assertValid('api/report-generate-request.schema.json', {
    conversationId: 'conversation-1',
    runId: RUN_ID,
    title: '教学质量分析报告',
    contentMarkdown: '# 教学质量分析报告',
    status: 'generated',
    metadata: {
      source: 'manual',
      runId: RUN_ID,
      reportState: 'generated',
      toolNames: ['aggregate_table'],
    },
  });
  validate.assertInvalid('api/report-generate-request.schema.json', {
    conversationId: 'conversation-1',
    runId: RUN_ID,
    contentMarkdown: '# 教学质量分析报告',
    metadata: { modelTrace: MODEL_TRACE },
  });
  validate.assertInvalid('api/report-generate-request.schema.json', {
    conversationId: 'conversation-1',
    runId: RUN_ID,
    contentMarkdown: '# 教学质量分析报告',
    metadata: { sources: [RUN_SOURCE] },
  });
  validate.assertValid('api/report-response.schema.json', {
    ok: true,
    data: createReportArtifactFixture(),
  });
  validate.assertValid('api/report-list-response.schema.json', {
    ok: true,
    data: {
      reports: [createReportArtifactFixture()],
    },
  });
  validate.assertValid('api/report-status-update-query.schema.json', {
    action: 'run-report-state',
  });
  validate.assertInvalid('api/report-status-update-query.schema.json', {
    action: 'generate-report',
  });
  validate.assertInvalid('api/report-status-update-query.schema.json', {
    action: 'run-report-state',
    data: { runId: RUN_ID, reportState: 'skipped' },
  });
  const reportStatusUpdateResponseSchema = validate.getSchema('api/report-status-update-response.schema.json');
  assert.equal(Object.hasOwn(reportStatusUpdateResponseSchema.properties.data, '$ref'), false);
  assert.deepEqual(
    Object.keys(reportStatusUpdateResponseSchema.properties.data.properties).sort(),
    ['reportState', 'runId'],
  );
  validate.assertValid('api/report-status-update-response.schema.json', {
    ok: true,
    data: {
      runId: RUN_ID,
      reportState: 'skipped',
    },
  });

  const evaluationListSchema = validate.getSchema('api/evaluation-list-response.schema.json');
  assert.equal(evaluationListSchema.properties.data.properties.results.items.$ref, '../objects/evaluation-result.schema.json');
  validate.assertValid('api/evaluation-create-request.schema.json', {
    resource: 'results',
    caseId: 'case-1',
    conversationId: 'conversation-1',
    runId: RUN_ID,
    verdict: 'pass',
    badCaseReason: null,
    humanNote: 'Looks correct',
    actualSummary: { markdownText: 'ok' },
    toolSummary: [],
    ragSummary: { sourceCount: 1 },
    reportSummary: { reportId: 'report-1' },
    metadata: { evaluatorVersion: 'rubric-v1' },
  });
  validate.assertInvalid('api/evaluation-create-request.schema.json', {
    caseId: 'case-1',
    runId: RUN_ID,
    verdict: 'pass',
    actualSummary: { markdownText: 'ok' },
    toolSummary: [],
    ragSummary: { sourceCount: 1 },
    reportSummary: { reportId: 'report-1' },
    metadata: { modelTrace: MODEL_TRACE },
  });
  validate.assertInvalid('api/evaluation-create-request.schema.json', {
    caseId: 'case-1',
    runId: RUN_ID,
    verdict: 'pass',
    actualSummary: { markdownText: 'ok' },
    toolSummary: [],
    ragSummary: { sourceCount: 1 },
    reportSummary: { reportId: 'report-1' },
    rawToolInput: {},
  });
  validate.assertValid('api/evaluation-cases-response.schema.json', {
    ok: true,
    data: {
      cases: [createEvaluationCaseFixture()],
    },
  });
  validate.assertValid('api/evaluation-list-response.schema.json', {
    ok: true,
    data: {
      results: [createEvaluationResultFixture()],
    },
  });
  validate.assertValid('api/evaluation-create-response.schema.json', {
    ok: true,
    data: {
      result: createEvaluationResultFixture(),
    },
  });

  const quotaStatusSchema = validate.getSchema('api/agent-run-quota-status-response.schema.json');
  assert.equal(quotaStatusSchema.properties.data.properties.quota.$ref, 'agent-run-quota-response.schema.json');
  validate.assertValid('api/agent-run-quota-status-response.schema.json', {
    ok: true,
    data: {
      quota: createAgentRunQuotaResponseFixture(),
    },
  });
  validate.assertInvalid('api/agent-run-quota-response.schema.json', {
    ...createAgentRunQuotaResponseFixture(),
    quota_type: 'agent_run',
  });
  validate.assertInvalid('api/agent-run-quota-response.schema.json', createAgentRunQuotaRecordFixture());
  validate.assertValid('api/agent-run-quota-consume-response.schema.json', {
    ok: true,
    data: {
      usageId: 'usage-1',
      quota: createAgentRunQuotaResponseFixture(),
    },
  });
  validate.assertValid('api/agent-run-quota-finish-response.schema.json', {
    ok: true,
    data: {
      usage: createAgentRunUsageRecordFixture({ status: 'completed', finished_at: UPDATED_AT }),
    },
  });
}

function testDemoFixtureContracts(validate) {
  const templates = demoConversations.demoConversationTemplates;
  let seedRunCount = 0;
  let chartDataSeedCount = 0;
  let seedMessageCount = 0;

  assert.equal(Array.isArray(templates), true);
  const demoTemplateSchema = validate.getSchema('objects/demo-conversation-template.schema.json');
  const demoSeedMessageSchema = validate.getSchema('objects/demo-seed-message.schema.json');
  const demoSeedReportSchema = validate.getSchema('objects/demo-seed-report.schema.json');

  assert.equal(demoTemplateSchema.properties.seed_runs.items.$ref, 'run-snapshot.schema.json');
  assert.equal(demoTemplateSchema.properties.seed_messages.items.$ref, 'demo-seed-message.schema.json');
  assert.equal(demoTemplateSchema.properties.seed_reports.items.$ref, 'demo-seed-report.schema.json');
  assert.equal(demoSeedMessageSchema.properties.metadata.additionalProperties, false);
  assert.equal(demoSeedReportSchema.properties.artifact.$ref, 'report-artifact.schema.json');

  for (const template of templates) {
    validate.assertValid('objects/demo-conversation-template.schema.json', template);

    for (const seedMessage of template.seed_messages ?? []) {
      seedMessageCount += 1;
      validate.assertValid('objects/demo-seed-message.schema.json', seedMessage);
    }

    for (const seedRun of template.seed_runs ?? []) {
      seedRunCount += 1;
      validate.assertValid('objects/run-snapshot.schema.json', seedRun);

      for (const field of DEMO_SEED_RUN_UI_ONLY_FIELDS) {
        assert.equal(Object.hasOwn(seedRun, field), false, `${field} must not exist on demo seed RunSnapshot`);
      }

      if (Object.hasOwn(seedRun, CHART_DATA_FIELD)) {
        chartDataSeedCount += 1;
        validate.assertValid('objects/run-chart-data.schema.json', seedRun.chartData);
      }
    }

    for (const seedReport of template.seed_reports ?? []) {
      validate.assertValid('objects/demo-seed-report.schema.json', seedReport);
    }
  }

  assert.ok(seedRunCount > 0, 'demo seed must include RunSnapshot records');
  assert.ok(seedMessageCount > 0, 'demo seed must include seed messages');
  assert.ok(chartDataSeedCount > 0, 'demo seed must cover chartData RunSnapshot records');

  const templateWithUiOnlyRun = JSON.parse(JSON.stringify(templates[0]));
  templateWithUiOnlyRun.seed_runs = [
    {
      ...templateWithUiOnlyRun.seed_runs[0],
      displayRunId: 'RUN-demo',
    },
  ];
  validate.assertInvalid('objects/demo-conversation-template.schema.json', templateWithUiOnlyRun);

  for (const field of ['runtimeRunId', 'sessionId', 'run_id']) {
    validate.assertInvalid('objects/demo-seed-message.schema.json', {
      role: 'assistant',
      kind: 'text',
      content: 'demo message',
      status: 'completed',
      metadata: {
        runId: RUN_ID,
        [field]: 'legacy-run',
      },
    });
  }

  validate.assertValid('objects/demo-seed-report.schema.json', createDemoSeedReportFixture());
  validate.assertInvalid('objects/demo-seed-report.schema.json', {
    ...createDemoSeedReportFixture(),
    reportState: 'generated',
  });
  validate.assertInvalid('objects/demo-seed-report.schema.json', {
    artifact: {
      ...createReportArtifactFixture(),
      displayRunId: 'RUN-demo',
    },
  });
}

function testMockFixtureClassification(validate) {
  const mockRunViewModel = mockRun.createMockRunViewModel({
    runId: RUN_ID,
    prompt: 'mock prompt',
    conversationId: 'conversation-1',
    timestamp: CREATED_AT,
  });

  assert.equal(Object.hasOwn(mockRunViewModel, 'displayRunId'), true);
  assert.equal(Object.hasOwn(mockRunViewModel, 'steps'), true);
  assert.equal(Object.hasOwn(mockRunViewModel, 'toolInvocations'), true);
  assert.equal(Object.hasOwn(mockRunViewModel, 'sources'), true);
  validate.assertInvalid('objects/run-snapshot.schema.json', mockRunViewModel);

  const mockStartedEvent = mockRun.createMockRunStartedEvent({
    runId: RUN_ID,
    prompt: 'mock prompt',
    conversationId: 'conversation-1',
  });
  validate.assertInvalid('events/run-started-event.schema.json', mockStartedEvent);
  assert.equal(Object.hasOwn(mockStartedEvent, 'payload'), false);
  assert.equal(Object.hasOwn(mockStartedEvent, 'timestamp'), false);

  const mockSources = ragSources.createMockRagSources({
    runId: RUN_ID,
    conversationId: 'conversation-1',
  });
  assert.equal(mockSources.length > 0, true);

  for (const source of mockSources) {
    assert.equal(source.runId, RUN_ID);
    assert.equal(source.conversationId, 'conversation-1');
    validate.assertValid('objects/run-source.schema.json', source);
  }
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
    ['runSources', []],
    ['ragSources', []],
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
testQuotaUsagePersistenceContracts(validate);
testRunEventPersistenceContracts(validate);
testToolInvocationPersistenceContracts(validate);
testSourceRetrievalPersistenceContracts(validate);
testHttpApiBoundaryContracts(validate);
testDemoFixtureContracts(validate);
testMockFixtureClassification(validate);
testRunSnapshotStatusContract(validate);
testRunSseEventContracts(validate);

console.log('Metadata boundary tests passed.');
