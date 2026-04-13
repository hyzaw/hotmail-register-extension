import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRetriableManagementApiError,
  withManagementApiRetry,
} from '../shared/management-api-retry.js';

test('isRetriableManagementApiError only retries request-level management api failures', () => {
  assert.equal(isRetriableManagementApiError(new Error('管理 API 请求失败：http://localhost:8317 - HTTP 500')), true);
  assert.equal(isRetriableManagementApiError(new Error('获取 Codex OAuth 链接失败：管理 API 未返回成功状态')), false);
});

test('withManagementApiRetry retries retriable management api failures and returns the later success', async () => {
  const calls = [];
  const sleeps = [];
  const retryEvents = [];

  const result = await withManagementApiRetry({
    action: async ({ attempt }) => {
      calls.push(attempt);
      if (attempt < 3) {
        throw new Error('管理 API 请求失败：http://localhost:8317/v0/management/codex-auth-url?is_webui=true - HTTP 502');
      }
      return { ok: true };
    },
    delayMs: 250,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onRetry: async (event) => {
      retryEvents.push(event);
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(sleeps, [250, 250]);
  assert.deepEqual(retryEvents.map(({ attempt, nextAttempt, maxAttempts, delayMs }) => ({
    attempt,
    nextAttempt,
    maxAttempts,
    delayMs,
  })), [
    { attempt: 1, nextAttempt: 2, maxAttempts: 3, delayMs: 250 },
    { attempt: 2, nextAttempt: 3, maxAttempts: 3, delayMs: 250 },
  ]);
});

test('withManagementApiRetry does not retry non-retriable failures', async () => {
  let calls = 0;

  await assert.rejects(
    () => withManagementApiRetry({
      action: async () => {
        calls += 1;
        throw new Error('请先填写管理地址');
      },
      sleep: async () => {},
    }),
    /请先填写管理地址/
  );

  assert.equal(calls, 1);
});
