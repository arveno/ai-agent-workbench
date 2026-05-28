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

const reportBoundary = require(path.join(rootDir, 'tencent/functions/workbench-reports/metadata-boundary.js'));
const evaluationBoundary = require(path.join(rootDir, 'tencent/functions/workbench-evaluations/metadata-boundary.js'));
const modelLayer = requireCommonJsFile(
  path.join(rootDir, 'tencent/functions/_shared/langchainModelLayer.js'),
  { '@langchain/openai': { ChatOpenAI: class ChatOpenAI {} } },
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
  const schemaFiles = (await readdir(schemaDir))
    .filter((file) => file.endsWith('.schema.json'))
    .sort();
  const schemasByFile = new Map();

  for (const file of schemaFiles) {
    const schemaPath = path.join(schemaDir, file);
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    schemasByFile.set(file, schema);
    ajv.addSchema(schema);
  }

  return {
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
  validate.assertValid('report-metadata.schema.json', metadata);
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
  validate.assertValid('report-metadata.schema.json', metadata);
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
  validate.assertValid('report-metadata.schema.json', report.metadata);
  validate.assertValid('report-artifact.schema.json', report);
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
  validate.assertValid('evaluation-metadata.schema.json', metadata);
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
  validate.assertValid('evaluation-metadata.schema.json', metadata);

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
  validate.assertValid('evaluation-metadata.schema.json', result.metadata);
  validate.assertValid('evaluation-result.schema.json', result);
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
  validate.assertValid('model-trace.schema.json', {
    ...MODEL_TRACE,
    usage: usageCostMetadata.usage,
    costEstimate: usageCostMetadata.costEstimate,
  });
}

function createRunSnapshotFixture(status, overrides = {}) {
  const fixture = {
    id: RUN_ID,
    clientRunId: REQUEST_RUN_ID,
    displayRunId: RUN_ID,
    sessionId: 'conversation-1',
    mode: 'agent',
    status,
    intent: 'knowledge_qa',
    prompt: 'Explain warning_count with sources.',
    plan: {
      intent: 'knowledge_qa',
      shouldUseDataAnalysis: false,
      reason: 'Use knowledge_search for the explanation.',
    },
    dataSource: {
      provider: 'cloudbase_mysql',
      name: 'CloudBase MySQL / knowledge_documents',
      typeLabel: 'CloudBase MySQL',
    },
    steps: [
      {
        id: 'step_knowledge_search',
        title: 'Search knowledge base',
        status: 'success',
      },
    ],
    toolInvocations: [
      {
        id: 'tool_knowledge_search',
        toolId: 'knowledge_search',
        toolName: 'knowledge_search',
        displayName: 'Knowledge search',
        status: 'success',
        inputSummary: 'warning_count',
        outputSummary: '2 sources',
      },
    ],
    sources: [
      {
        id: 'source-1',
        runId: RUN_ID,
        conversationId: 'conversation-1',
        sourceOrder: 1,
        title: 'Warning count guide',
        preview: 'warning_count describes risk signals.',
        sourceType: 'knowledge',
        createdAt: CREATED_AT,
      },
    ],
    chartData: {
      title: 'Warnings',
      chartType: 'bar',
      labels: ['A'],
      series: [{ name: 'warning_count', values: [1] }],
    },
    conclusion: 'warning_count describes risk signals.',
    conclusionSource: MODEL_TRACE.conclusionSource,
    agentConclusion: {
      markdownText: 'warning_count describes risk signals.',
      plainText: 'warning_count describes risk signals.',
    },
    modelTrace: MODEL_TRACE,
    reportState: 'generated',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    startedAt: CREATED_AT,
    completedAt: UPDATED_AT,
    elapsedMs: 1000,
    ...overrides,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete fixture[key];
    }
  }

  return fixture;
}

function createModelTraceWithConclusionSource(conclusionSource) {
  return {
    ...MODEL_TRACE,
    conclusionSource,
  };
}

function testRunSnapshotStatusContract(validate) {
  for (const status of ['idle', 'pending', 'running', 'success', 'error', 'stopped']) {
    validate.assertValid('run-snapshot.schema.json', createRunSnapshotFixture(status));
  }

  for (const status of ['completed', 'failed', 'cancelled']) {
    validate.assertInvalid('run-snapshot.schema.json', createRunSnapshotFixture(status));
  }
}

function testRunSnapshotViewModelContract(validate) {
  validate.assertValid('run-snapshot.schema.json', createRunSnapshotFixture('success'));

  validate.assertValid(
    'run-snapshot.schema.json',
    createRunSnapshotFixture('success', {
      modelTrace: undefined,
      conclusionSource: 'none',
      reportState: 'pending',
    }),
  );

  validate.assertInvalid(
    'run-snapshot.schema.json',
    createRunSnapshotFixture('success', {
      conversationId: 'conversation-1',
    }),
  );
}

function testRunSnapshotSourceContract(validate) {
  validate.assertValid('run-snapshot.schema.json', createRunSnapshotFixture('success'));

  validate.assertInvalid(
    'run-snapshot.schema.json',
    createRunSnapshotFixture('success', {
      sources: [{}],
    }),
  );
}

function testRunSnapshotConclusionSourceContract(validate) {
  validate.assertValid(
    'run-snapshot.schema.json',
    createRunSnapshotFixture('success', {
      conclusionSource: 'none',
      modelTrace: undefined,
    }),
  );

  for (const conclusionSource of ['model', 'fallback', 'mock']) {
    validate.assertInvalid(
      'run-snapshot.schema.json',
      createRunSnapshotFixture('success', {
        conclusionSource,
        modelTrace: undefined,
      }),
    );

    validate.assertValid(
      'run-snapshot.schema.json',
      createRunSnapshotFixture('success', {
        conclusionSource,
        modelTrace: createModelTraceWithConclusionSource(conclusionSource),
      }),
    );
  }

  validate.assertInvalid(
    'run-snapshot.schema.json',
    createRunSnapshotFixture('success', {
      conclusionSource: 'fallback',
      modelTrace: createModelTraceWithConclusionSource('model'),
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
testRunSnapshotStatusContract(validate);
testRunSnapshotViewModelContract(validate);
testRunSnapshotSourceContract(validate);
testRunSnapshotConclusionSourceContract(validate);

console.log('Metadata boundary tests passed.');
