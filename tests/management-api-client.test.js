import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManagementApiUrl,
  createManagementApiClient,
  resolveManagementApiBaseUrl,
} from '../shared/management-api-client.js';

test('resolveManagementApiBaseUrl strips management.html from a web ui url', () => {
  assert.equal(
    resolveManagementApiBaseUrl('http://localhost:8317/management.html#/oauth'),
    'http://localhost:8317'
  );
});

test('buildManagementApiUrl appends management endpoints relative to the base path', () => {
  assert.equal(
    buildManagementApiUrl('http://localhost:8317/management.html#/oauth', 'v0/management/codex-auth-url', { is_webui: 'true' }),
    'http://localhost:8317/v0/management/codex-auth-url?is_webui=true'
  );
});

test('createManagementApiClient fetches codex auth url with bearer auth and is_webui flag', async () => {
  const calls = [];
  const client = createManagementApiClient({
    baseUrl: 'http://localhost:8317/management.html#/oauth',
    managementKey: 'secret-key',
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        status: 'ok',
        url: 'https://accounts.openai.com/oauth/authorize',
        state: 'codex-123',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await client.getCodexAuthUrl({ isWebUi: true });
  assert.deepEqual(result, {
    url: 'https://accounts.openai.com/oauth/authorize',
    state: 'codex-123',
  });

  assert.deepEqual(calls, [{
    url: 'http://localhost:8317/v0/management/codex-auth-url?is_webui=true',
    options: {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer secret-key',
      },
    },
  }]);
});

test('createManagementApiClient surfaces api errors with request url context', async () => {
  const client = createManagementApiClient({
    baseUrl: 'http://localhost:8317',
    managementKey: 'secret-key',
    fetchFn: async () => new Response(JSON.stringify({
      error: 'invalid management key',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(
    () => client.getCodexAuthUrl({ isWebUi: true }),
    /管理 API 请求失败：http:\/\/localhost:8317\/v0\/management\/codex-auth-url\?is_webui=true - invalid management key/
  );
});

test('createManagementApiClient normalizes get-auth-status responses', async () => {
  const client = createManagementApiClient({
    baseUrl: 'http://localhost:8317',
    managementKey: 'secret-key',
    fetchFn: async () => new Response(JSON.stringify({
      status: 'wait',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  const result = await client.getAuthStatus({ state: 'codex-123' });
  assert.deepEqual(result, {
    status: 'wait',
    error: '',
    raw: { status: 'wait' },
  });
});
