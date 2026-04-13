function cloneProxySettingsValue(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

export function createDirectProxyFetch({
  fetchFn = fetch,
  proxySettingsApi = null,
  scope = 'regular',
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
        return await fetchFn(url, options);
      } finally {
        if (hasOriginalValue) {
          await proxySettingsApi.set({
            value: originalValue,
            scope,
          }).catch(() => {});
        } else {
          await proxySettingsApi.clear({ scope }).catch(() => {});
        }
      }
    });
  };
}
