import test from 'node:test';
import assert from 'node:assert/strict';

import { createDirectProxyFetch } from '../shared/direct-proxy-fetch.js';

test('createDirectProxyFetch bypasses proxy by switching to direct mode and restores prior settings', async () => {
  const calls = [];
  let currentValue = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: 'http',
        host: '127.0.0.1',
        port: 7890,
      },
    },
  };
  const directProxyFetch = createDirectProxyFetch({
    settleDelayMs: 0,
    sleep: async () => {},
    fetchFn: async (url, options) => {
      calls.push(['fetch', url, options?.method || 'GET']);
      return { ok: true, url };
    },
    proxySettingsApi: {
      async get(details) {
        calls.push(['get', details]);
        return {
          levelOfControl: 'controlled_by_this_extension',
          value: currentValue,
        };
      },
      async set(details) {
        calls.push(['set', details]);
        currentValue = details.value;
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
    ['get', { incognito: false }],
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
    ['get', { incognito: false }],
  ]);
});

test('createDirectProxyFetch clears proxy override when there was no prior config', async () => {
  const calls = [];
  let currentValue = {};
  const directProxyFetch = createDirectProxyFetch({
    settleDelayMs: 0,
    sleep: async () => {},
    fetchFn: async () => {
      calls.push(['fetch']);
      return { ok: true };
    },
    proxySettingsApi: {
      async get() {
        calls.push(['get']);
        return {
          levelOfControl: 'controlled_by_this_extension',
          value: currentValue,
        };
      },
      async set(details) {
        calls.push(['set', details]);
        currentValue = details.value;
      },
      async clear(details) {
        calls.push(['clear', details]);
        currentValue = {};
      },
    },
  });

  await directProxyFetch('http://47.243.10.54:8317/v0/management/codex-auth-url?is_webui=true');

  assert.deepEqual(calls, [
    ['get'],
    ['set', { value: { mode: 'direct' }, scope: 'regular' }],
    ['get'],
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

test('createDirectProxyFetch waits for direct mode to become observable before fetching', async () => {
  const calls = [];
  let currentMode = 'fixed_servers';
  let pendingMode = null;

  const directProxyFetch = createDirectProxyFetch({
    settleDelayMs: 0,
    sleep: async () => {
      calls.push(['sleep']);
    },
    fetchFn: async () => {
      calls.push(['fetch', currentMode]);
      return { ok: true };
    },
    proxySettingsApi: {
      async get() {
        if (pendingMode) {
          const nextMode = pendingMode;
          pendingMode = null;
          calls.push(['get', currentMode]);
          currentMode = nextMode;
          return {
            levelOfControl: 'controlled_by_this_extension',
            value: { mode: calls[calls.length - 1][1] },
          };
        }
        calls.push(['get', currentMode]);
        return {
          levelOfControl: 'controlled_by_this_extension',
          value: { mode: currentMode },
        };
      },
      async set(details) {
        calls.push(['set', details.value.mode]);
        pendingMode = details.value.mode;
      },
      async clear() {
        calls.push(['clear']);
      },
    },
  });

  await directProxyFetch('http://47.243.10.54:8317/v0/management/codex-auth-url?is_webui=true');

  assert.deepEqual(calls, [
    ['get', 'fixed_servers'],
    ['set', 'direct'],
    ['get', 'fixed_servers'],
    ['sleep'],
    ['get', 'direct'],
    ['fetch', 'direct'],
    ['set', 'fixed_servers'],
    ['get', 'direct'],
    ['sleep'],
    ['get', 'fixed_servers'],
  ]);
});
