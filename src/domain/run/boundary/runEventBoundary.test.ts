/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLocalRunStoppedEvent, normalizeRunEvent } from './runEventBoundary.ts';

describe('RunEventBoundary', () => {
  it('normalizes runtime flat run_started into a normalized event', () => {
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

    assert.equal(event?.type, 'run_started');
    assert.equal(event.runId, 'run_canonical');
    assert.equal(event.clientRunId, 'run_pending');
    assert.equal(event.conversationId, 'conversation_1');
    assert.equal(event.run.id, 'run_canonical');
    assert.equal(event.run.displayRunId, 'RUN-1');
  });

  it('normalizes future envelope run_started into the same event shape', () => {
    const event = normalizeRunEvent({
      type: 'run_started',
      runId: 'run_envelope',
      conversationId: 'conversation_1',
      timestamp: '2026-05-29T00:00:00.000Z',
      payload: {
        run: {
          id: 'run_envelope',
          displayRunId: 'RUN-2',
          mode: 'agent',
          status: 'completed',
          prompt: 'envelope run',
        },
      },
    });

    assert.equal(event?.type, 'run_started');
    assert.equal(event.runId, 'run_envelope');
    assert.equal(event.conversationId, 'conversation_1');
    assert.equal(event.run.id, 'run_envelope');
    assert.equal(event.run.status, 'success');
    assert.equal(event.run.displayRunId, 'RUN-2');
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
      clientRunId: 'run_pending',
      conversationId: 'conversation_1',
      payload: {
        run: {
          id: 'run_pending',
          clientRunId: 'run_pending',
          displayRunId: 'display_run',
          mode: 'agent',
          status: 'running',
          prompt: 'identity test',
        },
      },
    });

    assert.equal(event?.type, 'run_started');
    assert.equal(event.runId, 'run_canonical');
    assert.equal(event.clientRunId, 'run_pending');
    assert.equal(event.run.id, 'run_canonical');
    assert.equal(event.run.clientRunId, 'run_pending');
    assert.equal(event.run.displayRunId, 'display_run');
  });
});
