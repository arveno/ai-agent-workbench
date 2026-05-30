/// <reference types="node" />

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import type { RunSnapshot } from '../../../../contracts/generated/workbench-contract';
import { demoConversationTemplates } from '../../../mocks/demoConversations.ts';
import { createLocalRunStoppedEvent, normalizeRunEvent } from './runEventBoundary.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const schemaDir = path.join(rootDir, 'contracts/schemas');

const CANONICAL_RUN_SNAPSHOT_UI_ONLY_FIELDS = [
  'displayRunId',
  'steps',
  'toolInvocations',
  'sources',
  'sessionId',
  'conclusionSource',
] as const;

function listSchemaFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listSchemaFiles(entryPath);
    }

    return entry.name.endsWith('.schema.json') ? [entryPath] : [];
  });
}

function toSchemaRelativePath(filePath: string): string {
  return path.relative(schemaDir, filePath).split(path.sep).join('/');
}

function createSchemaValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    validateSchema: true,
  });
  const schemasByFile = new Map<string, Record<string, unknown>>();

  const schemaFiles = listSchemaFiles(schemaDir).sort((a, b) =>
    toSchemaRelativePath(a).localeCompare(toSchemaRelativePath(b)),
  );

  for (const file of schemaFiles) {
    const schema = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    schemasByFile.set(toSchemaRelativePath(file), schema);
    ajv.addSchema(schema);
  }

  return {
    assertValid(file: string, data: unknown) {
      const schema = schemasByFile.get(file);
      assert.ok(schema, `Missing schema fixture: ${file}`);

      const validate = ajv.compile(schema);
      const isValid = validate(data);

      if (!isValid) {
        throw new Error(`${file} validation failed: ${ajv.errorsText(validate.errors, { separator: '\n' })}`);
      }
    },
    assertInvalid(file: string, data: unknown) {
      const schema = schemasByFile.get(file);
      assert.ok(schema, `Missing schema fixture: ${file}`);

      const validate = ajv.compile(schema);
      assert.equal(validate(data), false, `${file} should reject invalid fixture`);
    },
  };
}

function createRunStartedEnvelope(run: RunSnapshot) {
  return {
    type: 'run_started',
    runId: run.id,
    conversationId: run.conversationId,
    timestamp: run.createdAt,
    payload: {
      run,
    },
  };
}

function getDemoSeedRunCases(): Array<{ templateId: string; run: RunSnapshot }> {
  return demoConversationTemplates.flatMap((template) =>
    template.seed_runs.map((run) => ({
      templateId: template.id,
      run,
    })),
  );
}

function getFirstDemoSeedRun(): RunSnapshot {
  const [firstCase] = getDemoSeedRunCases();
  assert.ok(firstCase, 'demo seed run fixtures must not be empty');
  return firstCase.run;
}

function assertCanonicalRunSnapshotHasNoUiOnlyFields(run: RunSnapshot): void {
  const record = run as unknown as Record<string, unknown>;

  for (const fieldName of CANONICAL_RUN_SNAPSHOT_UI_ONLY_FIELDS) {
    assert.equal(Object.hasOwn(record, fieldName), false, `${fieldName} must not exist on canonical RunSnapshot seed`);
  }

  assert.notEqual(record.chartData, null, 'chartData must be omitted when empty, not set to null');
}

const schemaValidator = createSchemaValidators();

describe('RunEventBoundary', () => {
  it('rejects runtime flat run_started after runtime envelope cutover', () => {
    const event = normalizeRunEvent(
      {
        type: 'run_started',
        runId: 'run_canonical',
        clientRunId: 'run_pending',
        conversationId: 'conversation_1',
        timestamp: '2026-05-29T00:00:00.000Z',
        run: {
          id: 'run_pending',
          clientRunId: 'run_pending',
          displayRunId: 'RUN-1',
          mode: 'agent',
          status: 'running',
          prompt: 'flat run',
        },
      },
      { source: 'runtime' },
    );

    assert.equal(event, null);
  });

  it('keeps flat run_started compatibility limited to persistence source', () => {
    const event = normalizeRunEvent(
      {
        type: 'run_started',
        runId: 'run_canonical',
        clientRunId: 'run_pending',
        conversationId: 'conversation_1',
        timestamp: '2026-05-29T00:00:00.000Z',
        run: {
          id: 'run_pending',
          clientRunId: 'run_pending',
          displayRunId: 'RUN-1',
          mode: 'agent',
          status: 'running',
          prompt: 'flat restored run',
        },
      },
      { source: 'persistence' },
    );

    assert.equal(event?.type, 'run_started');
    assert.equal(event.runId, 'run_canonical');
    assert.equal(event.clientRunId, 'run_pending');
    assert.equal(event.conversationId, 'conversation_1');
    assert.equal(event.run.id, 'run_canonical');
    assert.equal(event.run.displayRunId, 'RUN-1');
  });

  it('normalizes runtime envelope run_started canonical RunSnapshot into a ViewModel payload', () => {
    const canonicalRun = {
      id: 'run_envelope',
      conversationId: 'conversation_1',
      clientRunId: 'run_pending',
      mode: 'agent',
      status: 'completed',
      prompt: 'envelope run',
      modelTrace: null,
      reportState: 'hidden',
      createdAt: '2026-05-29T00:00:00.000Z',
      updatedAt: '2026-05-29T00:00:00.000Z',
    };
    const event = normalizeRunEvent({
      type: 'run_started',
      runId: 'run_envelope',
      conversationId: 'conversation_1',
      timestamp: '2026-05-29T00:00:00.000Z',
      payload: {
        run: canonicalRun,
      },
    }, { source: 'runtime' });

    assert.equal(event?.type, 'run_started');
    assert.equal(event.runId, 'run_envelope');
    assert.equal(event.conversationId, 'conversation_1');
    assert.equal(event.run.id, 'run_envelope');
    assert.equal(event.run.conversationId, 'conversation_1');
    assert.equal(event.run.status, 'success');
    assert.equal(event.run.displayRunId, 'run_envelope');
    assert.deepEqual(event.run.steps, []);
    assert.deepEqual(event.run.toolInvocations, []);
    assert.deepEqual(event.run.sources, []);
    assert.equal(Object.hasOwn(event.run, 'chartData'), false);
    assert.equal(Object.hasOwn(canonicalRun, 'steps'), false);
    assert.equal(Object.hasOwn(canonicalRun, 'toolInvocations'), false);
    assert.equal(Object.hasOwn(canonicalRun, 'sources'), false);
    assert.equal(Object.hasOwn(canonicalRun, 'displayRunId'), false);
    assert.equal(Object.hasOwn(canonicalRun, 'sessionId'), false);
  });

  it('validates actual demo seed runs as canonical RunSnapshot fixtures', () => {
    const demoSeedRuns = getDemoSeedRunCases();

    assert.ok(demoSeedRuns.length > 0, 'demo seed run fixtures must not be empty');

    for (const { templateId, run } of demoSeedRuns) {
      assert.equal(run.conversationId, `demo_${templateId}`);
      assertCanonicalRunSnapshotHasNoUiOnlyFields(run);
      schemaValidator.assertValid('objects/run-snapshot.schema.json', run);
      schemaValidator.assertValid('events/run-started-event.schema.json', createRunStartedEnvelope(run));
    }
  });

  it('maps actual demo seed run_started envelopes into RunViewModel payloads', () => {
    for (const { run } of getDemoSeedRunCases()) {
      const event = normalizeRunEvent(createRunStartedEnvelope(run), { source: 'runtime' });

      assert.equal(event?.type, 'run_started');
      assert.equal(event.runId, run.id);
      assert.equal(event.conversationId, run.conversationId);
      assert.equal(event.run.id, run.id);
      assert.equal(event.run.conversationId, run.conversationId);
      assert.equal(event.run.displayRunId, run.id);
      assert.deepEqual(event.run.steps, []);
      assert.deepEqual(event.run.toolInvocations, []);
      assert.deepEqual(event.run.sources, []);
      assert.equal(Array.isArray(event.run.steps), true);
      assert.equal(Array.isArray(event.run.toolInvocations), true);
      assert.equal(Array.isArray(event.run.sources), true);
      assertCanonicalRunSnapshotHasNoUiOnlyFields(run);

      if (Object.hasOwn(run, 'chartData')) {
        assert.deepEqual(event.run.chartData, run.chartData);
      } else {
        assert.equal(Object.hasOwn(event.run, 'chartData'), false);
      }
    }
  });

  it('rejects UI-only fields on canonical RunSnapshot schema', () => {
    const run = getFirstDemoSeedRun();
    const invalidFields: Array<[string, unknown]> = [
      ['displayRunId', run.id],
      ['steps', []],
      ['toolInvocations', []],
      ['sources', []],
      ['sessionId', run.conversationId],
      ['conclusionSource', 'fallback'],
      ['chartData', null],
    ];

    for (const [fieldName, value] of invalidFields) {
      schemaValidator.assertInvalid('objects/run-snapshot.schema.json', {
        ...run,
        [fieldName]: value,
      });
    }
  });

  it('normalizes canonical persistence run_started records into RunViewModel payloads', () => {
    const run = getFirstDemoSeedRun();
    const event = normalizeRunEvent(createRunStartedEnvelope(run), { source: 'persistence' });

    assert.equal(event?.type, 'run_started');
    assert.equal(event.runId, run.id);
    assert.equal(event.conversationId, run.conversationId);
    assert.equal(event.run.id, run.id);
    assert.equal(event.run.conversationId, run.conversationId);
    assert.equal(event.run.displayRunId, run.id);
    assert.deepEqual(event.run.steps, []);
    assert.deepEqual(event.run.toolInvocations, []);
    assert.deepEqual(event.run.sources, []);
  });

  it('uses persistence context to supply event-level identity', () => {
    const event = normalizeRunEvent(
      {
        type: 'step_completed',
        stepId: 'step_1',
        completedAt: '2026-05-29T00:00:01.000Z',
        elapsedMs: 100,
      },
      {
        source: 'persistence',
        runId: 'run_from_record',
        conversationId: 'conversation_from_record',
        timestamp: '2026-05-29T00:00:01.000Z',
      },
    );

    assert.equal(event?.type, 'step_completed');
    assert.equal(event.runId, 'run_from_record');
    assert.equal(event.conversationId, 'conversation_from_record');
    assert.equal(event.timestamp, '2026-05-29T00:00:01.000Z');
  });

  it('rejects unknown input, unknown event type, and malformed envelope payload', () => {
    assert.equal(normalizeRunEvent(null), null);
    assert.equal(normalizeRunEvent([]), null);
    assert.equal(normalizeRunEvent({ type: 'unknown_event' }), null);
    assert.equal(
      normalizeRunEvent({
        type: 'run_completed',
        runId: 'run_1',
        conversationId: 'conversation_1',
        payload: null,
      }),
      null,
    );
    assert.equal(
      normalizeRunEvent(
        {
          type: 'run_started',
          conversationId: 'conversation_1',
          payload: {
            run: {
              id: 'run_payload_only',
              conversationId: 'conversation_1',
              mode: 'agent',
              status: 'running',
              modelTrace: null,
              reportState: 'hidden',
              createdAt: '2026-05-29T00:00:00.000Z',
              updatedAt: '2026-05-29T00:00:00.000Z',
            },
          },
        },
        { source: 'runtime' },
      ),
      null,
    );
  });

  it('treats run_stopped as local action only', () => {
    assert.equal(
      normalizeRunEvent(
        {
          type: 'run_stopped',
          runId: 'run_1',
        },
        { source: 'runtime' },
      ),
      null,
    );

    const event = createLocalRunStoppedEvent('run_1');
    assert.equal(event.type, 'run_stopped');
    assert.equal(event.runId, 'run_1');
    assert.equal(event.source, 'local');
  });

  it('normalizes completed and failed backend statuses at the boundary', () => {
    const reusedCompleted = normalizeRunEvent({
      type: 'run_reused',
      runId: 'run_1',
      conversationId: 'conversation_1',
      payload: {
        duplicate: true,
        reused: true,
        reason: 'existing_run',
        status: 'completed',
      },
    });
    const reusedFailed = normalizeRunEvent({
      type: 'run_reused',
      runId: 'run_2',
      conversationId: 'conversation_1',
      payload: {
        duplicate: true,
        reused: true,
        reason: 'existing_run',
        status: 'failed',
      },
    });

    assert.equal(reusedCompleted?.type, 'run_reused');
    assert.equal(reusedCompleted.status, 'success');
    assert.equal(reusedFailed?.type, 'run_reused');
    assert.equal(reusedFailed.status, 'error');
  });

  it('keeps clientRunId and displayRunId out of canonical event identity', () => {
    const event = normalizeRunEvent({
      type: 'run_started',
      runId: 'run_canonical',
      conversationId: 'conversation_1',
      timestamp: '2026-05-29T00:00:00.000Z',
      payload: {
        run: {
          id: 'run_canonical',
          conversationId: 'conversation_1',
          clientRunId: 'run_pending',
          mode: 'agent',
          status: 'running',
          prompt: 'identity test',
          modelTrace: null,
          reportState: 'hidden',
          createdAt: '2026-05-29T00:00:00.000Z',
          updatedAt: '2026-05-29T00:00:00.000Z',
        },
      },
    }, { source: 'runtime' });

    assert.equal(event?.type, 'run_started');
    assert.equal(event.runId, 'run_canonical');
    assert.equal(event.clientRunId, 'run_pending');
    assert.equal(event.run.id, 'run_canonical');
    assert.equal(event.run.clientRunId, 'run_pending');
    assert.equal(event.run.displayRunId, 'run_canonical');
  });
});
