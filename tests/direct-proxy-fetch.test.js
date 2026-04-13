import test from 'node:test';
import assert from 'node:assert/strict';

import { createDirectProxyFetch } from '../shared/direct-proxy-fetch.js';

test('createDirectProxyFetch bypasses proxy by switching to direct mode and restores prior settings', async () => {
  const calls = [];
  const directProxyFetch = createDirectProxyFetch({
    fetchFn: async (url, options) => {
      calls.push(['fetch', url, options?.method || 'GET']);
      return { ok: true, url };
    },
    proxySettingsApi: {
      async get(details) {
        calls.push(['get', details]);
        return {
          levelOfControl: 'controlled_by_this_extension',
          value: {
            mode: 'fixed_servers',
            rules: {
              singleProxy: {
                scheme: 'http',
                host: '127.0.0.1',
                port: 7890,
              },
            },
          },
        };
      },
      async set(details) {
        calls.push(['set', details]);
      },
      async clear(details) {
        calls.push(['clear', details]);
      },
    },
  });

  const result = await directProxyFetch('http://47.243.10.54:8317/v0/management/oauth-callback', {
    method: 'POST',
  });

  assert.deepEqual(result, {
    ok: true,
    url: 'http://47.243.10.54:8317/v0/management/oauth-callback',
  });
  assert.deepEqual(calls, [
    ['get', { incognito: false }],
    ['set', { value: { mode: 'direct' }, scope: 'regular' }],
    ['fetch', 'http://47.243.10.54:8317/v0/management/oauth-callback', 'POST'],
    ['set', {
      value: {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: 'http',
            host: '127.0.0.1',
            port: 7890,
          },
        },
      },
      scope: 'regular',
    }],
  ]);
});

test('createDirectProxyFetch clears proxy override when there was no prior config', async () => {
  const calls = [];
  const directProxyFetch = createDirectProxyFetch({
    fetchFn: async () => {
      calls.push(['fetch']);
      return { ok: true };
    },
    proxySettingsApi: {
      async get() {
        calls.push(['get']);
        return {
          levelOfControl: 'controlled_by_this_extension',
          value: {},
        };
      },
      async set(details) {
        calls.push(['set', details]);
      },
      async clear(details) {
        calls.push(['clear', details]);
      },
    },
  });

  await directProxyFetch('http://47.243.10.54:8317/v0/management/codex-auth-url?is_webui=true');

  assert.deepEqual(calls, [
    ['get'],
    ['set', { value: { mode: 'direct' }, scope: 'regular' }],
    ['fetch'],
    ['clear', { scope: 'regular' }],
  ]);
});

test('createDirectProxyFetch falls back to plain fetch when proxy settings are not controllable', async () => {
  const calls = [];
  const directProxyFetch = createDirectProxyFetch({
    fetchFn: async () => {
      calls.push(['fetch']);
      return { ok: true };
    },
    proxySettingsApi: {
      async get() {
        calls.push(['get']);
        return { levelOfControl: 'not_controllable' };
      },
      async set() {
        calls.push(['set']);
      },
      async clear() {
        calls.push(['clear']);
      },
    },
  });

  await directProxyFetch('http://47.243.10.54:8317/v0/management/get-auth-status?state=abc');

  assert.deepEqual(calls, [
    ['get'],
    ['fetch'],
  ]);
});
