import test from 'node:test';
import assert from 'node:assert/strict';

import { pollManagementAuthStatus } from '../shared/management-auth-status.js';

test('pollManagementAuthStatus resolves after wait states turn into ok', async () => {
  const seen = [];
  const statuses = [
    { status: 'wait' },
    { status: 'wait' },
    { status: 'ok', raw: { status: 'ok' } },
  ];

  const result = await pollManagementAuthStatus({
    state: 'codex-123',
    getAuthStatus: async () => statuses.shift(),
    sleep: async () => {},
    onWait: async ({ attempt }) => {
      seen.push(attempt);
    },
  });

  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(result, { status: 'ok', raw: { status: 'ok' } });
});

test('pollManagementAuthStatus throws when api returns an error state', async () => {
  await assert.rejects(
    () => pollManagementAuthStatus({
      state: 'codex-123',
      getAuthStatus: async () => ({ status: 'error', error: 'Authentication failed' }),
      sleep: async () => {},
    }),
    /Authentication failed/
  );
});

test('pollManagementAuthStatus times out when api keeps returning wait', async () => {
  let now = 0;
  const realDateNow = Date.now;
  Date.now = () => now;

  try {
    await assert.rejects(
      () => pollManagementAuthStatus({
        state: 'codex-123',
        timeoutMs: 3000,
        intervalMs: 1000,
        getAuthStatus: async () => ({ status: 'wait' }),
        sleep: async (ms) => {
          now += ms;
        },
      }),
      /等待 OAuth 完成超时，state=codex-123/
    );
  } finally {
    Date.now = realDateNow;
  }
});
