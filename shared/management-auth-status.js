function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollManagementAuthStatus({
  getAuthStatus,
  state = '',
  timeoutMs = 30000,
  intervalMs = 1000,
  sleep = defaultSleep,
  onWait = async () => {},
} = {}) {
  if (typeof getAuthStatus !== 'function') {
    throw new Error('pollManagementAuthStatus 需要 getAuthStatus 函数');
  }

  const normalizedState = String(state || '').trim();
  if (!normalizedState) {
    throw new Error('缺少 OAuth state，请先重新执行步骤 1。');
  }

  const startedAt = Date.now();
  let attempt = 0;

  while ((Date.now() - startedAt) < timeoutMs) {
    attempt += 1;
    const result = await getAuthStatus({ state: normalizedState });
    const status = String(result?.status || '').trim().toLowerCase();

    if (status === 'ok') {
      return result;
    }

    if (status === 'error') {
      throw new Error(result?.error || 'Authentication failed');
    }

    if (status !== 'wait') {
      throw new Error(`管理 API 返回未知状态：${result?.status || '(empty)'}`);
    }

    await onWait({
      attempt,
      elapsedMs: Date.now() - startedAt,
      result,
    });
    await sleep(intervalMs);
  }

  throw new Error(`等待 OAuth 完成超时，state=${normalizedState}`);
}
