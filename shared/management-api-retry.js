function getErrorMessage(error) {
  return error?.message || String(error);
}

export function isRetriableManagementApiError(error) {
  return /^管理 API 请求失败：/u.test(getErrorMessage(error));
}

async function defaultSleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withManagementApiRetry({
  action,
  maxAttempts = 3,
  delayMs = 1000,
  shouldRetry = isRetriableManagementApiError,
  onRetry = async () => {},
  sleep = defaultSleep,
} = {}) {
  if (typeof action !== 'function') {
    throw new Error('withManagementApiRetry 需要 action 函数');
  }

  const normalizedMaxAttempts = Math.max(1, Number(maxAttempts) || 1);
  const normalizedDelayMs = Math.max(0, Number(delayMs) || 0);

  for (let attempt = 1; attempt <= normalizedMaxAttempts; attempt += 1) {
    try {
      return await action({ attempt, maxAttempts: normalizedMaxAttempts });
    } catch (error) {
      const canRetry = attempt < normalizedMaxAttempts
        && Boolean(shouldRetry(error, { attempt, maxAttempts: normalizedMaxAttempts }));

      if (!canRetry) {
        throw error;
      }

      await onRetry({
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: normalizedMaxAttempts,
        delayMs: normalizedDelayMs,
        error,
      });

      if (normalizedDelayMs > 0) {
        await sleep(normalizedDelayMs);
      }
    }
  }

  throw new Error('management api retry unexpectedly exhausted attempts');
}
