import test from 'node:test';
import assert from 'node:assert/strict';

import { runAutoFlowBatch } from '../shared/auto-flow.js';
import { createAutoRunPausedError } from '../shared/auto-run-control.js';

test('runAutoFlowBatch repeats successful runs up to runCount', async () => {
  const calls = [];

  const result = await runAutoFlowBatch({
    runCount: 2,
    continueOnError: false,
    runFlow: async (attempt) => {
      calls.push(`run:${attempt}`);
      return { status: 'completed', attempt };
    },
  });

  assert.deepEqual(calls, ['run:0', 'run:1']);
  assert.equal(result.results.length, 2);
  assert.equal(result.failures.length, 0);
});

test('runAutoFlowBatch continues after failure when continueOnError is enabled', async () => {
  const calls = [];

  const result = await runAutoFlowBatch({
    runCount: 3,
    continueOnError: true,
    runFlow: async (attempt) => {
      calls.push(`run:${attempt}`);
      if (attempt === 1) {
        throw new Error('step failed');
      }
      return { status: 'completed', attempt };
    },
    onAttemptError: async (error, attempt) => {
      calls.push(`error:${attempt}:${error.message}`);
    },
  });

  assert.deepEqual(calls, [
    'run:0',
    'run:1',
    'error:1:step failed',
    'run:2',
  ]);
  assert.equal(result.results.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].attempt, 1);
});

test('runAutoFlowBatch can resume from a start index', async () => {
  const calls = [];

  const result = await runAutoFlowBatch({
    runCount: 3,
    startIndex: 1,
    runFlow: async (attempt) => {
      calls.push(`run:${attempt}`);
      return { status: 'completed', attempt };
    },
  });

  assert.deepEqual(calls, ['run:1', 'run:2']);
  assert.deepEqual(result.results.map((item) => item.attempt), [1, 2]);
  assert.equal(result.failures.length, 0);
});

test('runAutoFlowBatch stops cleanly and reports the resume cursor when paused', async () => {
  const calls = [];
  let pauseCursor = null;

  const result = await runAutoFlowBatch({
    runCount: 3,
    runFlow: async (attempt) => {
      calls.push(`run:${attempt}`);
      if (attempt === 1) {
        throw createAutoRunPausedError('pause now');
      }
      return { status: 'completed', attempt };
    },
    onPaused: async (resumeIndex, error) => {
      pauseCursor = resumeIndex;
      calls.push(`paused:${resumeIndex}:${error.message}`);
    },
  });

  assert.deepEqual(calls, [
    'run:0',
    'run:1',
    'paused:1:pause now',
  ]);
  assert.equal(pauseCursor, 1);
  assert.deepEqual(result.results.map((item) => item.attempt), [0]);
  assert.equal(result.failures.length, 0);
  assert.equal(result.pausedAt, 1);
});

test('runAutoFlowBatch can retry the same attempt when retrySameAttemptOnError is enabled', async () => {
  const calls = [];
  let failures = 0;

  const result = await runAutoFlowBatch({
    runCount: 1,
    continueOnError: true,
    retrySameAttemptOnError: true,
    runFlow: async (attempt) => {
      calls.push(`run:${attempt}`);
      if (failures < 2) {
        failures += 1;
        throw new Error(`fail:${failures}`);
      }
      return { status: 'completed', attempt };
    },
    onAttemptError: async (error, attempt, context) => {
      calls.push(`error:${attempt}:${error.message}:${context?.consecutiveErrors}`);
    },
  });

  assert.deepEqual(calls, [
    'run:0',
    'error:0:fail:1:1',
    'run:0',
    'error:0:fail:2:2',
    'run:0',
  ]);
  assert.equal(result.results.length, 1);
  assert.equal(result.failures.length, 2);
  assert.equal(result.pausedAt, null);
});

test('runAutoFlowBatch rests after consecutive errors when configured', async () => {
  const calls = [];
  let failures = 0;
  const sleeps = [];

  const result = await runAutoFlowBatch({
    runCount: 1,
    continueOnError: true,
    retrySameAttemptOnError: true,
    restOnConsecutiveErrorsMs: 5,
    restConsecutiveThreshold: 2,
    sleepFn: async (ms) => {
      sleeps.push(ms);
    },
    runFlow: async (attempt) => {
      calls.push(`run:${attempt}`);
      if (failures < 2) {
        failures += 1;
        throw new Error(`fail:${failures}`);
      }
      return { status: 'completed', attempt };
    },
    onAttemptError: async (_error, attempt, context) => {
      calls.push(`ctx:${attempt}:${context?.consecutiveErrors}:${context?.willRest ? 1 : 0}`);
    },
  });

  assert.deepEqual(calls, [
    'run:0',
    'ctx:0:1:0',
    'run:0',
    'ctx:0:2:1',
    'run:0',
  ]);
  assert.deepEqual(sleeps, [5]);
  assert.equal(result.results.length, 1);
  assert.equal(result.failures.length, 2);
});
