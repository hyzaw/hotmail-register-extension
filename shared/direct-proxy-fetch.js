function cloneProxySettingsValue(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

async function defaultSleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProxyMode({
  proxySettingsApi,
  expectedMode,
  sleep = defaultSleep,
  maxAttempts = 10,
  intervalMs = 100,
} = {}) {
  const normalizedExpectedMode = String(expectedMode || '').trim();
  if (!normalizedExpectedMode || typeof proxySettingsApi?.get !== 'function') {
    return false;
  }

  const normalizedMaxAttempts = Math.max(1, Number(maxAttempts) || 1);
  const normalizedIntervalMs = Math.max(0, Number(intervalMs) || 0);

  for (let attempt = 1; attempt <= normalizedMaxAttempts; attempt += 1) {
    try {
      const details = await proxySettingsApi.get({ incognito: false });
      const currentMode = String(details?.value?.mode || '').trim();
      if (currentMode === normalizedExpectedMode) {
        return true;
      }
    } catch {
      return false;
    }

    if (attempt < normalizedMaxAttempts && normalizedIntervalMs > 0) {
      await sleep(normalizedIntervalMs);
    }
  }

  return false;
}

export function createDirectProxyFetch({
  fetchFn = fetch,
  proxySettingsApi = null,
  scope = 'regular',
  settleDelayMs = 150,
  sleep = defaultSleep,
} = {}) {
  let queue = Promise.resolve();

  function runSerial(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  return async function directProxyFetch(url, options) {
    if (typeof fetchFn !== 'function') {
      throw new Error('createDirectProxyFetch 需要 fetchFn 函数');
    }

    if (!proxySettingsApi?.get || !proxySettingsApi?.set || !proxySettingsApi?.clear) {
      return fetchFn(url, options);
    }

    return runSerial(async () => {
      let details = null;
      try {
        details = await proxySettingsApi.get({ incognito: false });
      } catch {
        return fetchFn(url, options);
      }

      if (String(details?.levelOfControl || '') === 'not_controllable') {
        return fetchFn(url, options);
      }

      const originalValue = cloneProxySettingsValue(details?.value);
      const hasOriginalValue = Boolean(originalValue && Object.keys(originalValue).length > 0);

      try {
        await proxySettingsApi.set({
          value: { mode: 'direct' },
          scope,
        });
      } catch {
        return fetchFn(url, options);
      }

      try {
        await waitForProxyMode({
          proxySettingsApi,
          expectedMode: 'direct',
          sleep,
        });
        if (settleDelayMs > 0) {
          await sleep(settleDelayMs);
        }
        return await fetchFn(url, options);
      } finally {
        if (hasOriginalValue) {
          await proxySettingsApi.set({
            value: originalValue,
            scope,
          }).catch(() => {});
          await waitForProxyMode({
            proxySettingsApi,
            expectedMode: originalValue.mode,
            sleep,
          }).catch(() => false);
        } else {
          await proxySettingsApi.clear({ scope }).catch(() => {});
        }
      }
    });
  };
}
