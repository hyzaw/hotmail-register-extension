import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_BROWSING_DATA_ORIGINS,
  getAuthBrowsingDataOptions,
  getAuthBrowsingDataRemovals,
} from '../shared/auth-browsing-data.js';

test('getAuthBrowsingDataOptions targets all auth origins from the beginning of time', () => {
  assert.deepEqual(getAuthBrowsingDataOptions(), {
    since: 0,
    origins: [...AUTH_BROWSING_DATA_ORIGINS],
  });
});

test('getAuthBrowsingDataRemovals clears cookies, cache, and storage buckets', () => {
  assert.deepEqual(getAuthBrowsingDataRemovals(), {
    cache: true,
    cacheStorage: true,
    cookies: true,
    fileSystems: true,
    indexedDB: true,
    localStorage: true,
    serviceWorkers: true,
    webSQL: true,
  });
});
