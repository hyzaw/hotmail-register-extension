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

function hasAddPhoneRequirement(result) {
  return Boolean(result?.addPhoneRequired);
}

function hasProfileCompletionRequirement(result) {
  return Boolean(result?.needsProfileCompletion);
}

function wasVerificationShortCircuited(result) {
  return Boolean(result?.skippedForProfile || result?.reachedConsent || result?.addPhoneRequired);
}

async function loginWithProfileCompletion({
  addLog,
  checkAutoControl,
  executeSignupStep,
  pollVerificationCode,
  fillLastCode,
  maxProfileAttempts = 3,
} = {}) {
  const normalizedMaxProfileAttempts = Math.max(1, Number(maxProfileAttempts) || 1);
  let profileAttempts = 0;

  while (true) {
    await checkAutoControl();
    const loginStep6Result = await executeSignupStep(6);
    if (hasReachedConsent(loginStep6Result)) {
      return loginStep6Result;
    }

    if (loginStep6Result?.needsProfileCompletion) {
      profileAttempts += 1;
      await addLog('步骤 6：检测到资料页，返回步骤 5 补全资料');
      await checkAutoControl();
      await executeSignupStep(5);

      if (profileAttempts >= normalizedMaxProfileAttempts) {
        return { needsProfileCompletion: true, profileLoopExceeded: true };
      }
      // Requirement: whenever step 5 happens, always rerun step 6 (refresh OAuth) next.
      continue;
    }

    if (loginStep6Result?.needsOTP === false) {
      await addLog('步骤 6：已通过密码登录，跳过登录验证码阶段');
      return loginStep6Result;
    }

    await checkAutoControl();
    const loginPollResult = await pollVerificationCode('login');
    if (wasVerificationShortCircuited(loginPollResult)) {
      if (loginPollResult?.skippedForProfile) {
        profileAttempts += 1;
        await addLog('步骤 7：检测到资料页（轮询期间跳转），返回步骤 5 补全资料');
        await checkAutoControl();
        await executeSignupStep(5);
        if (profileAttempts >= normalizedMaxProfileAttempts) {
          return { ...(loginPollResult || {}), needsProfileCompletion: true, profileLoopExceeded: true };
        }
        continue;
      }
      return loginPollResult;
    }
    await checkAutoControl();
    const loginCodeResult = await fillLastCode('login');
    if (hasAddPhoneRequirement(loginCodeResult)) {
      return loginCodeResult;
    }
    if (hasProfileCompletionRequirement(loginCodeResult)) {
      profileAttempts += 1;
      await addLog('步骤 7：检测到资料页，返回步骤 5 补全资料');
      await checkAutoControl();
      await executeSignupStep(5);

      if (profileAttempts >= normalizedMaxProfileAttempts) {
        return { ...(loginCodeResult || {}), needsProfileCompletion: true, profileLoopExceeded: true };
      }
      continue;
    }
    return loginCodeResult;
  }
}

async function refreshOauthAndLogin({ addLog, checkAutoControl, executeSignupStep, pollVerificationCode, fillLastCode } = {}) {
  await checkAutoControl();
  const loginStep6Result = await executeSignupStep(6);
  if (hasReachedConsent(loginStep6Result) || hasProfileCompletionRequirement(loginStep6Result)) {
    return loginStep6Result;
  }
  if (loginStep6Result?.needsOTP === false) {
    return loginStep6Result;
  }

  await checkAutoControl();
  const loginPollResult = await pollVerificationCode('login');
  if (wasVerificationShortCircuited(loginPollResult)) {
    return loginPollResult;
  }
  await checkAutoControl();
  return fillLastCode('login');
}

async function finalizeFromConsent({ addLog, checkAutoControl, executeSignupStep, executeFinalVerifyStep, completeCurrentAccount, completionMessage = '单轮自动流程完成，当前邮箱已标记为已使用' } = {}) {
  await addLog('检测到页面已提前进入 OAuth 授权页，直接进入步骤 8。');
  await checkAutoControl();
  const step8Result = await executeSignupStep(8);
  if (hasAddPhoneRequirement(step8Result)) {
    return abandonAccountForAddPhone({
      addLog,
      checkAutoControl,
      completeCurrentAccount,
      completionMessage,
    });
  }
  await checkAutoControl();
  await executeFinalVerifyStep();
  await checkAutoControl();
  const result = await completeCurrentAccount();
  await addLog(completionMessage);
  return result;
}

async function abandonAccountForAddPhone({ addLog, checkAutoControl, completeCurrentAccount, step = 8, completionMessage = '单轮自动流程完成，当前邮箱已标记为已使用' } = {}) {
  await addLog(`步骤 ${step}：检测到需要添加电话号码，当前账号将放弃并标记为已注册。`);
  await checkAutoControl();
  const result = await completeCurrentAccount();
  await addLog(completionMessage);
  return { ...(result || {}), abandonedForAddPhone: true, addPhoneStep: step };
}

async function continueFromLoginAfterStep3({ addLog, checkAutoControl, executeSignupStep, pollVerificationCode, fillLastCode } = {}) {
  await addLog('步骤 3：检测到当前邮箱已存在关联账号，切换到登录流程并跳过注册验证码与资料填写');
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
    const loginPollResult = await pollVerificationCode('login');
    if (wasVerificationShortCircuited(loginPollResult)) {
      return loginPollResult;
    }
    await checkAutoControl();
    const loginCodeResult = await fillLastCode('login');
    if (hasAddPhoneRequirement(loginCodeResult)) {
      return { addPhoneRequired: true };
    }
    if (hasProfileCompletionRequirement(loginCodeResult)) {
      await addLog('步骤 7：检测到资料页，返回步骤 5 补全资料');
      return { needsProfileCompletion: true };
    }
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
  let skipSignupVerification = Boolean(signupStep3Result?.skipSignupVerification);
  let skipSignupVerificationViaUrlProbe = false;
  const switchToLoginFlow = Boolean(signupStep3Result?.switchToLoginFlow);
  const markAccountRegistered = Boolean(signupStep3Result?.markAccountRegistered);

  // Guard: if the tab already landed on /about-you, do not start polling signup OTP (it may never have been sent).
  if (!skipSignupVerification && !switchToLoginFlow && !markAccountRegistered && typeof actions.getAuthTabUrl === 'function') {
    try {
      const currentUrl = String(await actions.getAuthTabUrl() || '');
      if (/\/about-you(?:[/?#]|$)/i.test(currentUrl)) {
        skipSignupVerification = true;
        skipSignupVerificationViaUrlProbe = true;
        await addLog('步骤 3：检测到已落到 about-you 资料页（URL 探测），跳过注册码阶段', 'warn');
      }
    } catch {}
  }
  if (switchToLoginFlow || markAccountRegistered) {
    if (markAccountRegistered && !switchToLoginFlow) {
      await addLog('步骤 3：检测到当前邮箱已存在关联账号，改为继续 OAuth 登录流程（不再放弃该账号）');
    }
    await addLog('步骤 3：检测到当前邮箱已存在关联账号，切换到登录流程并跳过注册验证码与资料填写');

    const loginResult = await loginWithProfileCompletion({
      addLog,
      checkAutoControl,
      executeSignupStep,
      pollVerificationCode,
      fillLastCode,
    });
    if (hasAddPhoneRequirement(loginResult)) {
      return abandonAccountForAddPhone({
        addLog,
        checkAutoControl,
        completeCurrentAccount,
        step: 7,
      });
    }
    if (hasReachedConsent(loginResult)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
      });
    }
  } else {
    if (skipSignupVerification) {
      if (!skipSignupVerificationViaUrlProbe) {
        await addLog('步骤 3：检测到当前邮箱已进入资料页，跳过注册码阶段');
      }
    } else {
      await checkAutoControl();
      const signupPollResult = await pollVerificationCode('signup');
      if (hasAddPhoneRequirement(signupPollResult)) {
        return abandonAccountForAddPhone({
          addLog,
          checkAutoControl,
          completeCurrentAccount,
          step: 4,
        });
      }
      if (hasReachedConsent(signupPollResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
        });
      }
      if (!signupPollResult?.skippedForProfile) {
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
      } else {
        await addLog('步骤 4：轮询期间检测到已进入资料页，跳过注册码阶段', 'warn');
      }
    }
    await checkAutoControl();
    await executeSignupStep(5);

    const loginResult = await loginWithProfileCompletion({
      addLog,
      checkAutoControl,
      executeSignupStep,
      pollVerificationCode,
      fillLastCode,
    });
    if (hasAddPhoneRequirement(loginResult)) {
      return abandonAccountForAddPhone({
        addLog,
        checkAutoControl,
        completeCurrentAccount,
        step: 7,
      });
    }
    if (hasReachedConsent(loginResult)) {
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
  const step8Result = await executeSignupStep(8);
  if (hasAddPhoneRequirement(step8Result)) {
    return abandonAccountForAddPhone({
      addLog,
      checkAutoControl,
      completeCurrentAccount,
    });
  }
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
    let skipSignupVerification = Boolean(signupStep3Result?.skipSignupVerification);
    let skipSignupVerificationViaUrlProbe = false;
    if (!skipSignupVerification && !signupStep3Result?.switchToLoginFlow && !signupStep3Result?.markAccountRegistered && typeof actions.getAuthTabUrl === 'function') {
      try {
        const currentUrl = String(await actions.getAuthTabUrl() || '');
        if (/\/about-you(?:[/?#]|$)/i.test(currentUrl)) {
          skipSignupVerification = true;
          skipSignupVerificationViaUrlProbe = true;
          await addLog('步骤 3：检测到已落到 about-you 资料页（URL 探测），跳过注册码阶段', 'warn');
        }
      } catch {}
    }
    if (signupStep3Result?.switchToLoginFlow || signupStep3Result?.markAccountRegistered) {
      if (signupStep3Result?.markAccountRegistered && !signupStep3Result?.switchToLoginFlow) {
        await addLog('步骤 3：检测到当前邮箱已注册，改为继续 OAuth 登录流程（不再放弃该账号）');
      }

      const loginResult = await loginWithProfileCompletion({
        addLog,
        checkAutoControl,
        executeSignupStep,
        pollVerificationCode,
        fillLastCode,
      });
      if (hasAddPhoneRequirement(loginResult)) {
        return abandonAccountForAddPhone({
          addLog,
          checkAutoControl,
          completeCurrentAccount,
          step: 7,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (hasReachedConsent(loginResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }

      await checkAutoControl();
      const step8Result = await executeSignupStep(8);
      if (hasAddPhoneRequirement(step8Result)) {
        return abandonAccountForAddPhone({
          addLog,
          checkAutoControl,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      await checkAutoControl();
      await executeFinalVerifyStep();
      await checkAutoControl();
      const result = await completeCurrentAccount();
      await addLog('自动流程继续完成，当前邮箱已标记为已使用');
       return result;
    } else if (skipSignupVerification) {
      if (!skipSignupVerificationViaUrlProbe) {
        await addLog('步骤 3：检测到当前邮箱已进入资料页，跳过注册码阶段');
      }
    } else {
      await checkAutoControl();
      const signupPollResult = await pollVerificationCode('signup');
      if (hasAddPhoneRequirement(signupPollResult)) {
        return abandonAccountForAddPhone({
          addLog,
          checkAutoControl,
          completeCurrentAccount,
          step: 4,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (hasReachedConsent(signupPollResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (!signupPollResult?.skippedForProfile) {
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
      } else {
        await addLog('步骤 4：轮询期间检测到已进入资料页，跳过注册码阶段', 'warn');
      }
    }
  } else if (startStep === 4) {
    if (typeof actions.getAuthTabUrl === 'function') {
      try {
        const currentUrl = String(await actions.getAuthTabUrl() || '');
        if (/\/about-you(?:[/?#]|$)/i.test(currentUrl)) {
          await addLog('步骤 4：检测到已落到 about-you 资料页（URL 探测），跳过注册码阶段', 'warn');
        } else {
          await checkAutoControl();
          const signupPollResult = await pollVerificationCode('signup');
          if (hasAddPhoneRequirement(signupPollResult)) {
            return abandonAccountForAddPhone({
              addLog,
              checkAutoControl,
              completeCurrentAccount,
              step: 4,
              completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
            });
          }
          if (hasReachedConsent(signupPollResult)) {
            return finalizeFromConsent({
              addLog,
              checkAutoControl,
              executeSignupStep,
              executeFinalVerifyStep,
              completeCurrentAccount,
              completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
            });
          }
          if (!signupPollResult?.skippedForProfile) {
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
          } else {
            await addLog('步骤 4：轮询期间检测到已进入资料页，跳过注册码阶段', 'warn');
          }
        }
      } catch {
        await checkAutoControl();
        const signupPollResult = await pollVerificationCode('signup');
        if (hasAddPhoneRequirement(signupPollResult)) {
          return abandonAccountForAddPhone({
            addLog,
            checkAutoControl,
            completeCurrentAccount,
            step: 4,
            completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
          });
        }
        if (hasReachedConsent(signupPollResult)) {
          return finalizeFromConsent({
            addLog,
            checkAutoControl,
            executeSignupStep,
            executeFinalVerifyStep,
            completeCurrentAccount,
            completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
          });
        }
        if (!signupPollResult?.skippedForProfile) {
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
        } else {
          await addLog('步骤 4：轮询期间检测到已进入资料页，跳过注册码阶段', 'warn');
        }
      }
    } else {
      await checkAutoControl();
      const signupPollResult = await pollVerificationCode('signup');
      if (hasAddPhoneRequirement(signupPollResult)) {
        return abandonAccountForAddPhone({
          addLog,
          checkAutoControl,
          completeCurrentAccount,
          step: 4,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (hasReachedConsent(signupPollResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (!signupPollResult?.skippedForProfile) {
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
      } else {
        await addLog('步骤 4：轮询期间检测到已进入资料页，跳过注册码阶段', 'warn');
      }
    }
  }

  if (startStep <= 5) {
    await checkAutoControl();
    await executeSignupStep(5);
  }

  if (startStep <= 6) {
    const loginResult = await loginWithProfileCompletion({
      addLog,
      checkAutoControl,
      executeSignupStep,
      pollVerificationCode,
      fillLastCode,
    });
    if (hasAddPhoneRequirement(loginResult)) {
      return abandonAccountForAddPhone({
        addLog,
        checkAutoControl,
        completeCurrentAccount,
        step: 7,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
    if (hasReachedConsent(loginResult)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
  } else if (startStep === 7) {
    await checkAutoControl();
    const loginPollResult = await pollVerificationCode('login');
    if (hasAddPhoneRequirement(loginPollResult)) {
      return abandonAccountForAddPhone({
        addLog,
        checkAutoControl,
        completeCurrentAccount,
        step: 7,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
    if (hasReachedConsent(loginPollResult)) {
      return finalizeFromConsent({
        addLog,
        checkAutoControl,
        executeSignupStep,
        executeFinalVerifyStep,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
    if (loginPollResult?.skippedForProfile) {
      await addLog('步骤 7：轮询期间检测到资料页，返回步骤 5 补全资料', 'warn');
      await checkAutoControl();
      await executeSignupStep(5);

      const recoveredLoginResult = await loginWithProfileCompletion({
        addLog,
        checkAutoControl,
        executeSignupStep,
        pollVerificationCode,
        fillLastCode,
      });
      if (hasAddPhoneRequirement(recoveredLoginResult)) {
        return abandonAccountForAddPhone({
          addLog,
          checkAutoControl,
          completeCurrentAccount,
          step: 7,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (hasReachedConsent(recoveredLoginResult)) {
        return finalizeFromConsent({
          addLog,
          checkAutoControl,
          executeSignupStep,
          executeFinalVerifyStep,
          completeCurrentAccount,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      // In this branch we do not have an OTP to submit; continue to the next steps.
    } else {
      await checkAutoControl();
      const loginCodeResult = await fillLastCode('login');
      if (hasAddPhoneRequirement(loginCodeResult)) {
        return abandonAccountForAddPhone({
          addLog,
          checkAutoControl,
          completeCurrentAccount,
          step: 7,
          completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
        });
      }
      if (hasProfileCompletionRequirement(loginCodeResult)) {
        await addLog('步骤 7：检测到资料页，返回步骤 5 补全资料');
        await checkAutoControl();
        await executeSignupStep(5);

        const recoveredLoginResult = await loginWithProfileCompletion({
          addLog,
          checkAutoControl,
          executeSignupStep,
          pollVerificationCode,
          fillLastCode,
        });
        if (hasAddPhoneRequirement(recoveredLoginResult)) {
          return abandonAccountForAddPhone({
            addLog,
            checkAutoControl,
            completeCurrentAccount,
            step: 7,
            completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
          });
        }
        if (hasReachedConsent(recoveredLoginResult)) {
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
  }

  if (startStep <= 8) {
    await checkAutoControl();
    const step8Result = await executeSignupStep(8);
    if (hasAddPhoneRequirement(step8Result)) {
      return abandonAccountForAddPhone({
        addLog,
        checkAutoControl,
        completeCurrentAccount,
        completionMessage: '自动流程继续完成，当前邮箱已标记为已使用',
      });
    }
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
  let authRetryErrorStreak = 0;

  const isAuthRetryErrorScreen = (error) => {
    const message = error?.message || String(error || '');
    return message.includes('[AUTH_ERROR_SCREEN:retry_page]');
  };

  const maybeAbandonAfterAuthRetryError = async (error) => {
    if (!isAuthRetryErrorScreen(error)) {
      authRetryErrorStreak = 0;
      return false;
    }

    authRetryErrorStreak += 1;
    if (authRetryErrorStreak < 3) {
      return false;
    }

    await checkAutoControl();
    await addLog(`检测到当前账号连续 ${authRetryErrorStreak} 次出现“糟糕，出错了 / Operation timed out”错误页，放弃该账号并标记为已使用。`, 'warn');
    const result = await actions.completeCurrentAccount?.();
    await addLog('单轮自动流程完成，当前邮箱已标记为已使用');
    return { abandoned: true, result };
  };

  while (flowAttempt <= normalizedMaxFlowAttempts) {
    try {
      return await runSingleAutoFlow({ actions });
    } catch (error) {
      if (isAutoRunPausedError(error)) {
        throw error;
      }

      const abandoned = await maybeAbandonAfterAuthRetryError(error);
      if (abandoned) {
        return abandoned.result || { status: 'completed', abandoned: true };
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
            const oauthAbandoned = await maybeAbandonAfterAuthRetryError(oauthError);
            if (oauthAbandoned) {
              return oauthAbandoned.result || { status: 'completed', abandoned: true };
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
  retrySameAttemptOnError = false,
  restOnConsecutiveErrorsMs = 0,
  restConsecutiveThreshold = 2,
  sleepFn = async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
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
  const shouldRetrySameAttempt = Boolean(retrySameAttemptOnError);
  const normalizedRestMs = Math.max(0, Number(restOnConsecutiveErrorsMs) || 0);
  const normalizedRestThreshold = Math.max(2, Number(restConsecutiveThreshold) || 2);
  let consecutiveErrors = 0;

  let attempt = safeStartIndex;
  while (attempt < totalRuns) {
    try {
      results.push(await runFlow(attempt));
      consecutiveErrors = 0;
      attempt += 1;
    } catch (error) {
      if (isAutoRunPausedError(error)) {
        await onPaused(attempt, error);
        return { results, failures, pausedAt: attempt };
      }

      consecutiveErrors += 1;
      failures.push({ attempt, error });

      const willRetry = shouldRetrySameAttempt;
      const shouldRest = normalizedRestMs > 0 && consecutiveErrors >= normalizedRestThreshold;
      await onAttemptError(error, attempt, {
        consecutiveErrors,
        willRetry,
        willRest: shouldRest,
        restMs: shouldRest ? normalizedRestMs : 0,
      });

      if (shouldRest) {
        await sleepFn(normalizedRestMs);
      }

      if (!shouldRetrySameAttempt) {
        if (!continueOnError) {
          throw error;
        }
        attempt += 1;
      }
    }
  }

  return { results, failures, pausedAt: null };
}
