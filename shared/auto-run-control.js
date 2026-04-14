export function createAutoRunPausedError(message = '自动流程已暂停') {
  const error = new Error(message);
  error.code = 'AUTO_RUN_PAUSED';
  return error;
}

export function isAutoRunPausedError(error) {
  return Boolean(error && (error.code === 'AUTO_RUN_PAUSED' || error.message === '自动流程已暂停'));
}

export function createAutoRunCooldownError(message = '自动流程冷却中', { resumeIndex = null, cooldownMs = null } = {}) {
  const error = new Error(message);
  error.code = 'AUTO_RUN_COOLDOWN';
  if (Number.isFinite(resumeIndex)) {
    error.resumeIndex = Number(resumeIndex);
  }
  if (Number.isFinite(cooldownMs)) {
    error.cooldownMs = Number(cooldownMs);
  }
  return error;
}

export function isAutoRunCooldownError(error) {
  return Boolean(error && error.code === 'AUTO_RUN_COOLDOWN');
}

