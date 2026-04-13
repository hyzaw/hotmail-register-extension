import { isAutoRunPausedError } from './auto-run-control.js';

const STEP_TITLES = Object.freeze({
  1: '获取 OAuth 链接',
  2: '进入注册流程',
  3: '填写邮箱和密码',
  4: '获取注册验证码',
  5: '填写基础资料',
  6: '刷新 OAuth 并登录',
  7: '获取登录验证码',
  8: '确认 OAuth 授权',
  9: '管理 API 校验',
});

function getStepLabel(step) {
  const title = STEP_TITLES[step];
  return title ? `步骤 ${step}：${title}` : `步骤 ${step}`;
}

function findProblemStep(stepStatuses = {}) {
  for (const status of ['failed', 'running']) {
    for (let step = 1; step <= 9; step += 1) {
      if (stepStatuses[step] === status) {
        return step;
      }
    }
  }
  return null;
}

function isOauthStep(step) {
  return step === 8 || step === 9;
}

function hasReachedConsent(result) {
  return Boolean(result?.reachedConsent);
}

async function finalizeFromConsent({ addLog, checkAutoControl, executeSignupStep, executeFinalVerifyStep, completeCurrentAccount, completionMessage = '单轮自动流程完成，当前邮箱已标记为已使用' } = {}) {
  await addLog('检测到页面已提前进入 OAuth 授权页，直接进入步骤 8。');
  await checkAutoControl();
  await executeSignupStep(8);
  await checkAutoControl();
  await executeFinalVerifyStep();
  await checkAutoControl();
  const result = await completeCurrentAccount();
  await addLog(completionMessage);
  return result;
}

async function continueFromLoginAfterStep3({ addLog, checkAutoControl, executeSignupStep, pollVerificationCode, fillLastCode } = {}) {
  await addLog('步骤 3：检测到当前邮箱已注册，切换到登录流程并跳过注册验证码与资料填写');
  await checkAutoControl();
  const loginStep6Result = await executeSignupStep(6);
  if (hasReachedConsent(loginStep6Result)) {
    return { reachedConsent: true, needsProfileCompletion: false };
  }
  if (loginStep6Result?.needsProfileCompletion) {
    await addLog('步骤 6：检测到资料页，返回步骤 5 补全资料');
    return { needsProfileCompletion: true };
  }
  if (loginStep6Result?.needsOTP !== false) {
    await checkAutoControl();
    await pollVerificationCode('login');
    await checkAutoControl();
    const loginCodeResult = await fillLastCode('login');
    if (hasReachedConsent(loginCodeResult)) {
      return { reachedConsent: true, needsProfileCompletion: false };
    }
  } else {
    await addLog('步骤 6：已通过密码登录，跳过登录验证码阶段');
  }
  return { needsProfileCompletion: false };
}

async function completeRegisteredAccountAfterStep3({ addLog, completeCurrentAccount } = {}) {
  await addLog('步骤 3：检测到当前邮箱已存在关联账号，当前账号将直接标记为已注册并跳过后续流程');
  const result = await completeCurrentAccount();
  await addLog('单轮自动流程完成，当前邮箱已标记为已使用');
  return result;
}

export async function runSingleAutoFlow({ actions = {} } = {}) {
  const {
    addLog = async () => {},
    checkAutoControl = async () => {},
    prepareNextAccount,
    refreshOauthFromVps = async () => {},
    findCurrentEmailRecord,
    openOauthUrl,
    executeSignupStep,
    executeFinalVerifyStep = async () => {},
    pollVerificationCode,
    fillLastCode,
    completeCurrentAccount,
  } = actions;

  await checkAutoControl();
  await prepareNextAccount();
  await addLog('单轮自动流程开始');

  await checkAutoControl();
  await addLog('阶段 1：刷新 CPA 并重新获取 OAuth 链接');
  await refreshOauthFromVps();

  await checkAutoControl();
  await findCurrentEmailRecord();
  await addLog('阶段 2：打开认证页面并进入注册流程');
  await openOauthUrl();
  await checkAutoControl();
  const signupStep2Result = await executeSignupStep(2);
  if (hasReachedConsent(signupStep2Result)) {
    return finalizeFromConsent({
      addLog,
      checkAutoControl,
      executeSignupStep,
      executeFinalVerifyStep,
      completeCurrentAccount,
    });
  }
  await checkAutoControl();
  const signupStep3Result = await executeSignupStep(3);
  if (hasReachedConsent(signupStep3Result)) {
    return finalizeFromConsent({
      addLog,
      checkAutoControl,
      executeSignupStep,
      executeFinalVerifyStep,
      completeCurrentAccount,
    });
  }
  const skipSignupVerification = Boolean(signupStep3Result?.skipSignupVerification);
  const switchToLoginFlow = Boolean(signupStep3Result?.switchToLoginFlow);
  const markAccountRegistered = Boolean(signupStep3Result?.markAccountRegistered);
  if (switchToLoginFlow || markAccountRegistered) {
    if (markAccountRegistered && !switchToLoginFlow) {
      await addLog('步骤 3：检测到当前邮箱已注册，改为继续 OAuth 登录流程（不再放弃该账号）');
    }
    const loginResult = await continueFromLoginAfterStep3({
      addLog,
      checkAutoControl,
      executeSignupStep,
      pollVerificationCode,
      fillLastCode,
    });
    if (loginResult?.reachedConsent) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
      });
    }
    if (loginResult?.needsProfileCompletion) {
      const recoveredProfileResult = await executeSignupStep(5);
      if (hasReachedConsent(recoveredProfileResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
        });
      }
      if (recoveredProfileResult?.needsOTP === false) {
        await addLog('步骤 6：资料页已补全，直接进入授权阶段');
      } else {
        await checkAutoControl();
        await pollVerificationCode('login');
        await checkAutoControl();
        const recoveredLoginCodeResult = await fillLastCode('login');
        if (hasReachedConsent(recoveredLoginCodeResult)) {
          return finalizeFromConsent({
            addLog,
            checkAutoControl,
            executeSignupStep,
            executeFinalVerifyStep,
            completeCurrentAccount,
          });
        }
      }
    }
  } else {
    if (skipSignupVerification) {
      await addLog('步骤 3：检测到当前邮箱已进入资料页，跳过注册码阶段');
    } else {
      await checkAutoControl();
      await pollVerificationCode('signup');
      await checkAutoControl();
      const signupCodeResult = await fillLastCode('signup');
      if (hasReachedConsent(signupCodeResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
        });
      }
    }
    await checkAutoControl();
    const step5Result = await executeSignupStep(5);
    if (hasReachedConsent(step5Result)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
      });
    }
    await checkAutoControl();
    const loginStep6Result = await executeSignupStep(6);
    if (hasReachedConsent(loginStep6Result)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
      });
    }
    if (loginStep6Result?.needsProfileCompletion) {
      await addLog('步骤 6：检测到资料页，返回步骤 5 补全资料');
      const recoveredProfileResult = await executeSignupStep(5);
      if (hasReachedConsent(recoveredProfileResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
        });
      }
      if (recoveredProfileResult?.needsOTP === false) {
        await addLog('步骤 6：资料页已补全，直接进入授权阶段');
      } else {
        await checkAutoControl();
        await pollVerificationCode('login');
        await checkAutoControl();
        const recoveredLoginCodeResult = await fillLastCode('login');
        if (hasReachedConsent(recoveredLoginCodeResult)) {
          return finalizeFromConsent({
            addLog,
            checkAutoControl,
            executeSignupStep,
            executeFinalVerifyStep,
            completeCurrentAccount,
          });
        }
      }
    } else if (loginStep6Result?.needsOTP !== false) {
      await checkAutoControl();
      await pollVerificationCode('login');
      await checkAutoControl();
      const loginCodeResult = await fillLastCode('login');
      if (hasReachedConsent(loginCodeResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
        });
      }
    } else {
      await addLog('步骤 6：已通过密码登录，跳过登录验证码阶段');
    }
  }
  await checkAutoControl();
  await executeSignupStep(8);
  await checkAutoControl();
  await executeFinalVerifyStep();
  await checkAutoControl();
  const result = await completeCurrentAccount();
  await addLog('单轮自动流程完成，当前邮箱已标记为已使用');

  return result;
}

function getFirstIncompleteStep(stepStatuses = {}) {
  let highestCompletedStep = 0;

  for (let step = 1; step <= 9; step += 1) {
    if (stepStatuses[step] === 'completed' && step > highestCompletedStep) {
      highestCompletedStep = step;
    }
  }

  const nextStep = highestCompletedStep + 1;
  if (nextStep > 9) {
    return null;
  }
  return nextStep;
}

export async function continueSingleAutoFlow({ state = {}, actions = {} } = {}) {
  const {
    addLog = async () => {},
    checkAutoControl = async () => {},
    refreshOauthFromVps = async () => {},
    findCurrentEmailRecord,
    openOauthUrl,
    executeSignupStep,
    executeFinalVerifyStep = async () => {},
    pollVerificationCode,
    fillLastCode,
    completeCurrentAccount,
  } = actions;

  const startStep = getFirstIncompleteStep(state.stepStatuses || {});
  if (!startStep) {
    await addLog('当前流程已全部完成，无需继续');
    return { status: 'completed', continuedFrom: null };
  }

  await checkAutoControl();
  await addLog(`继续自动流程：从步骤 ${startStep} 开始`);

  if (startStep <= 1) {
    await addLog('阶段 1：刷新 CPA 并重新获取 OAuth 链接');
    await refreshOauthFromVps();
    await checkAutoControl();
    await findCurrentEmailRecord();
    await addLog('阶段 2：打开认证页面并进入注册流程');
    await openOauthUrl();
  }

  if (startStep === 2) {
    await checkAutoControl();
    const signupStep2Result = await executeSignupStep(2);
    if (hasReachedConsent(signupStep2Result)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
  }

  if (startStep <= 3) {
    await checkAutoControl();
    const signupStep3Result = await executeSignupStep(3);
    if (hasReachedConsent(signupStep3Result)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
    if (signupStep3Result?.switchToLoginFlow || signupStep3Result?.markAccountRegistered) {
      if (signupStep3Result?.markAccountRegistered && !signupStep3Result?.switchToLoginFlow) {
        await addLog('步骤 3：检测到当前邮箱已注册，改为继续 OAuth 登录流程（不再放弃该账号）');
      }
      const loginResult = await continueFromLoginAfterStep3({
        addLog,
        checkAutoControl,
        executeSignupStep,
        pollVerificationCode,
        fillLastCode,
      });
      if (loginResult?.reachedConsent) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (loginResult?.needsProfileCompletion) {
        const recoveredProfileResult = await executeSignupStep(5);
        if (hasReachedConsent(recoveredProfileResult)) {
          return finalizeFromConsent({
            addLog,
            checkAutoControl,
            executeSignupStep,
            executeFinalVerifyStep,
            completeCurrentAccount,
            completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
          });
        }
        if (recoveredProfileResult?.needsOTP === false) {
          await addLog('步骤 6：资料页已补全，直接进入授权阶段');
        } else {
          await checkAutoControl();
          await pollVerificationCode('login');
          await checkAutoControl();
          const recoveredLoginCodeResult = await fillLastCode('login');
          if (hasReachedConsent(recoveredLoginCodeResult)) {
            return finalizeFromConsent({
              addLog,
              checkAutoControl,
              executeSignupStep,
              executeFinalVerifyStep,
              completeCurrentAccount,
              completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
            });
          }
        }
      }
      await checkAutoControl();
      await executeSignupStep(8);
      await checkAutoControl();
      await executeFinalVerifyStep();
      await checkAutoControl();
      const result = await completeCurrentAccount();
      await addLog('自动流程继续完成，当前邮箱已标记为已使用');
      return result;
    } else if (signupStep3Result?.skipSignupVerification) {
      await addLog('步骤 3：检测到当前邮箱已进入资料页，跳过注册码阶段');
    } else {
      await checkAutoControl();
      await pollVerificationCode('signup');
      await checkAutoControl();
      const signupCodeResult = await fillLastCode('signup');
      if (hasReachedConsent(signupCodeResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
    }
  } else if (startStep === 4) {
    await checkAutoControl();
    await pollVerificationCode('signup');
    await checkAutoControl();
    const signupCodeResult = await fillLastCode('signup');
    if (hasReachedConsent(signupCodeResult)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
  }

  if (startStep <= 5) {
    await checkAutoControl();
    const step5Result = await executeSignupStep(5);
    if (hasReachedConsent(step5Result)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
  }

  if (startStep <= 6) {
    await checkAutoControl();
    const loginStep6Result = await executeSignupStep(6);
    if (hasReachedConsent(loginStep6Result)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
    if (loginStep6Result?.needsProfileCompletion) {
      await addLog('步骤 6：检测到资料页，返回步骤 5 补全资料');
      const recoveredProfileResult = await executeSignupStep(5);
      if (hasReachedConsent(recoveredProfileResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (recoveredProfileResult?.needsOTP === false) {
        await addLog('步骤 6：资料页已补全，直接进入授权阶段');
      } else {
        await checkAutoControl();
        await pollVerificationCode('login');
        await checkAutoControl();
        const recoveredLoginCodeResult = await fillLastCode('login');
        if (hasReachedConsent(recoveredLoginCodeResult)) {
          return finalizeFromConsent({
            addLog,
            checkAutoControl,
            executeSignupStep,
            executeFinalVerifyStep,
            completeCurrentAccount,
            completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
          });
        }
      }
    } else if (loginStep6Result?.needsOTP !== false) {
      await checkAutoControl();
      await pollVerificationCode('login');
      await checkAutoControl();
      const loginCodeResult = await fillLastCode('login');
      if (hasReachedConsent(loginCodeResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
    } else {
      await addLog('步骤 6：已通过密码登录，跳过登录验证码阶段');
    }
  } else if (startStep === 7) {
    await checkAutoControl();
    await pollVerificationCode('login');
    await checkAutoControl();
    const loginCodeResult = await fillLastCode('login');
    if (hasReachedConsent(loginCodeResult)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
  }

  if (startStep <= 8) {
    await checkAutoControl();
    await executeSignupStep(8);
  }

  if (startStep <= 9) {
    await checkAutoControl();
    await executeFinalVerifyStep();
  }

  await checkAutoControl();
  const result = await completeCurrentAccount();
  await addLog('自动流程继续完成，当前邮箱已标记为已使用');
  return result;
}

export async function runSingleAutoFlowWithAutoRetry({
  state = {},
  getState = async () => state,
  actions = {},
  maxFlowAttempts = 3,
  maxOauthAttempts = 3,
} = {}) {
  const {
    addLog = async () => {},
    checkAutoControl = async () => {},
  } = actions;

  const normalizedMaxFlowAttempts = Math.max(1, Number(maxFlowAttempts) || 1);
  const normalizedMaxOauthAttempts = Math.max(1, Number(maxOauthAttempts) || 1);
  let flowAttempt = 1;

  while (flowAttempt <= normalizedMaxFlowAttempts) {
    try {
      return await runSingleAutoFlow({ actions });
    } catch (error) {
      if (isAutoRunPausedError(error)) {
        throw error;
      }

      let latestState = await getState();
      let problemStep = findProblemStep(latestState.stepStatuses || {});

      if (isOauthStep(problemStep)) {
        let oauthAttempt = 1;
        let latestError = error;

        while (oauthAttempt < normalizedMaxOauthAttempts) {
          oauthAttempt += 1;
          await checkAutoControl();
          await addLog(`${getStepLabel(problemStep)} 失败，正在自动重试 OAuth（第 ${oauthAttempt}/${normalizedMaxOauthAttempts} 次尝试）`);

          try {
            return await continueSingleAutoFlow({
              state: await getState(),
              actions,
            });
          } catch (oauthError) {
            if (isAutoRunPausedError(oauthError)) {
              throw oauthError;
            }
            latestError = oauthError;
            latestState = await getState();
            problemStep = findProblemStep(latestState.stepStatuses || {});
            if (!isOauthStep(problemStep)) {
              break;
            }
          }
        }

        if (flowAttempt >= normalizedMaxFlowAttempts) {
          throw latestError;
        }

        await checkAutoControl();
        await addLog(`OAuth 自动重试未成功，当前账号将自动重试整轮流程（第 ${flowAttempt + 1}/${normalizedMaxFlowAttempts} 次尝试）`);
      } else {
        if (flowAttempt >= normalizedMaxFlowAttempts) {
          throw error;
        }

        await checkAutoControl();
        await addLog(`注册成功前出现错误，当前账号将自动重试整轮流程（第 ${flowAttempt + 1}/${normalizedMaxFlowAttempts} 次尝试）`);
      }

      flowAttempt += 1;
    }
  }

  throw new Error('自动重试逻辑异常退出');
}

export async function runAutoFlowBatch({
  runCount = 1,
  startIndex = 0,
  continueOnError = false,
  runFlow,
  onAttemptError = async () => {},
  onPaused = async () => {},
} = {}) {
  if (typeof runFlow !== 'function') {
    throw new Error('runAutoFlowBatch 需要 runFlow 函数');
  }

  const results = [];
  const failures = [];
  const totalRuns = Math.max(1, Number(runCount) || 1);
  const safeStartIndex = Math.max(0, Math.min(totalRuns, Number(startIndex) || 0));

  for (let attempt = safeStartIndex; attempt < totalRuns; attempt += 1) {
    try {
      results.push(await runFlow(attempt));
    } catch (error) {
      if (isAutoRunPausedError(error)) {
        await onPaused(attempt, error);
        return { results, failures, pausedAt: attempt };
      }
      failures.push({ attempt, error });
      await onAttemptError(error, attempt);
      if (!continueOnError) {
        throw error;
      }
    }
  }

  return { results, failures, pausedAt: null };
}
