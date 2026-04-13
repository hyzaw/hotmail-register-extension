import test from 'node:test';
import assert from 'node:assert/strict';

import { runSingleAutoFlow, runSingleAutoFlowWithAutoRetry } from '../shared/auto-flow.js';

test('runSingleAutoFlow executes the happy path in order and marks account completed', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: phase === 'signup' ? '123456' : '654321' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'pollVerificationCode:signup',
    'fillLastCode:signup',
    'executeSignupStep:5',
    'executeSignupStep:6',
    'pollVerificationCode:login',
    'fillLastCode:login',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow skips signup verification when step 3 lands directly on the profile page', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 3) {
          return { skipSignupVerification: true };
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: '654321' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'log:步骤 3：检测到当前邮箱已进入资料页，跳过注册码阶段',
    'executeSignupStep:5',
    'executeSignupStep:6',
    'pollVerificationCode:login',
    'fillLastCode:login',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow jumps to login flow when step 3 detects existing account login path', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 3) {
          return { switchToLoginFlow: true };
        }
        if (step === 6) {
          return { needsOTP: true };
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: '654321' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'log:步骤 3：检测到当前邮箱已存在关联账号，切换到登录流程并跳过注册验证码与资料填写',
    'executeSignupStep:6',
    'pollVerificationCode:login',
    'fillLastCode:login',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow continues OAuth login flow when signup password page reports existing account', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 3) {
          return { markAccountRegistered: true, existingAccountOnSignup: true };
        }
        if (step === 6) {
          return { needsOTP: false };
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'log:步骤 3：检测到当前邮箱已存在关联账号，改为继续 OAuth 登录流程（不再放弃该账号）',
    'log:步骤 3：检测到当前邮箱已存在关联账号，切换到登录流程并跳过注册验证码与资料填写',
    'executeSignupStep:6',
    'log:步骤 6：已通过密码登录，跳过登录验证码阶段',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow jumps straight to OAuth when step 2 already lands on the consent page', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 2) {
          return { reachedConsent: true };
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'log:检测到页面已提前进入 OAuth 授权页，直接进入步骤 8。',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow skips login verification when step 6 completes without OTP', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 6) {
          return { needsOTP: false };
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: '123456' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'pollVerificationCode:signup',
    'fillLastCode:signup',
    'executeSignupStep:5',
    'executeSignupStep:6',
    'log:步骤 6：已通过密码登录，跳过登录验证码阶段',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow returns to step 5 when step 6 lands on the profile page', async () => {
  const calls = [];
  let profilePass = 0;

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 6) {
          return { needsProfileCompletion: true };
        }
        if (step === 5) {
          profilePass += 1;
          if (profilePass === 2) {
            return { needsOTP: false };
          }
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: '123456' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'pollVerificationCode:signup',
    'fillLastCode:signup',
    'executeSignupStep:5',
    'executeSignupStep:6',
    'log:步骤 6：检测到资料页，返回步骤 5 补全资料',
    'executeSignupStep:5',
    'log:步骤 6：资料页已补全，直接进入授权阶段',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow returns to step 5 when step 7 lands on the profile page', async () => {
  const calls = [];
  let profilePass = 0;

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 6) {
          return { needsOTP: true };
        }
        if (step === 5) {
          profilePass += 1;
          if (profilePass === 2) {
            return { reachedConsent: true };
          }
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: phase === 'signup' ? '123456' : '654321' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
        if (phase === 'login') {
          return { needsProfileCompletion: true };
        }
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'pollVerificationCode:signup',
    'fillLastCode:signup',
    'executeSignupStep:5',
    'executeSignupStep:6',
    'pollVerificationCode:login',
    'fillLastCode:login',
    'log:步骤 7：检测到资料页，返回步骤 5 补全资料',
    'executeSignupStep:5',
    'log:检测到页面已提前进入 OAuth 授权页，直接进入步骤 8。',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow does not mark account completed when a step fails', async () => {
  const calls = [];

  await assert.rejects(
    () => runSingleAutoFlow({
      autoImport: false,
      actions: {
        async prepareNextAccount() {
          calls.push('prepareNextAccount');
          return { address: 'user@hotmail.com' };
        },
        async findCurrentEmailRecord() {
          calls.push('findCurrentEmailRecord');
          return { id: 1, address: 'user@hotmail.com' };
        },
        async refreshOauthFromVps() {
          calls.push('refreshOauthFromVps');
        },
        async openOauthUrl() {
          calls.push('openOauthUrl');
        },
        async executeSignupStep(step) {
          calls.push(`executeSignupStep:${step}`);
        },
        async pollVerificationCode() {
          calls.push('pollVerificationCode:signup');
          throw new Error('轮询失败');
        },
        async fillLastCode() {
          calls.push('fillLastCode:signup');
        },
        async completeCurrentAccount() {
          calls.push('completeCurrentAccount');
        },
        async addLog(message) {
          calls.push(`log:${message}`);
        },
      },
    }),
    /轮询失败/
  );

  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'pollVerificationCode:signup',
  ]);
});

test('runSingleAutoFlow does not mark account completed when step 8 fails', async () => {
  const calls = [];

  await assert.rejects(
    () => runSingleAutoFlow({
      autoImport: false,
      actions: {
        async prepareNextAccount() {
          calls.push('prepareNextAccount');
        },
        async findCurrentEmailRecord() {
          calls.push('findCurrentEmailRecord');
        },
        async refreshOauthFromVps() {
          calls.push('refreshOauthFromVps');
        },
        async openOauthUrl() {
          calls.push('openOauthUrl');
        },
        async executeSignupStep(step) {
          calls.push(`executeSignupStep:${step}`);
          if (step === 8) {
            throw new Error('consent click failed');
          }
        },
        async executeFinalVerifyStep() {
          calls.push('executeFinalVerifyStep');
        },
        async pollVerificationCode(phase) {
          calls.push(`pollVerificationCode:${phase}`);
          return { code: '123456' };
        },
        async fillLastCode(phase) {
          calls.push(`fillLastCode:${phase}`);
        },
        async completeCurrentAccount() {
          calls.push('completeCurrentAccount');
        },
        async addLog(message) {
          calls.push(`log:${message}`);
        },
      },
    }),
    /consent click failed/
  );

  assert.equal(calls.includes('completeCurrentAccount'), false);
});

test('runSingleAutoFlow abandons account and marks completed when step 8 requires adding phone number', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 8) {
          return { addPhoneRequired: true };
        }
        if (step === 6) {
          return { needsOTP: false };
        }
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(calls.includes('executeFinalVerifyStep'), false);
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'pollVerificationCode:signup',
    'fillLastCode:signup',
    'executeSignupStep:5',
    'executeSignupStep:6',
    'log:步骤 6：已通过密码登录，跳过登录验证码阶段',
    'executeSignupStep:8',
    'log:步骤 8：检测到需要添加电话号码，当前账号将放弃并标记为已注册。',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow abandons account when step 7 lands on add-phone after OTP submit', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    autoImport: false,
    actions: {
      async prepareNextAccount() { calls.push('prepareNextAccount'); },
      async findCurrentEmailRecord() { calls.push('findCurrentEmailRecord'); },
      async refreshOauthFromVps() { calls.push('refreshOauthFromVps'); },
      async openOauthUrl() { calls.push('openOauthUrl'); },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 3) return { skipSignupVerification: true };
        if (step === 6) return { needsOTP: true };
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: '123456' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
        if (phase === 'login') {
          return { addPhoneRequired: true };
        }
      },
      async executeFinalVerifyStep() { calls.push('executeFinalVerifyStep'); },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) { calls.push(`log:${message}`); },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(calls.includes('executeFinalVerifyStep'), false);
  assert.equal(calls.includes('executeSignupStep:8'), false);
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'log:步骤 3：检测到当前邮箱已进入资料页，跳过注册码阶段',
    'executeSignupStep:5',
    'executeSignupStep:6',
    'pollVerificationCode:login',
    'fillLastCode:login',
    'log:步骤 7：检测到需要添加电话号码，当前账号将放弃并标记为已注册。',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow does not mark account completed when final verify fails', async () => {
  const calls = [];

  await assert.rejects(
    () => runSingleAutoFlow({
      autoImport: false,
      actions: {
        async prepareNextAccount() { calls.push('prepareNextAccount'); },
        async findCurrentEmailRecord() { calls.push('findCurrentEmailRecord'); },
        async refreshOauthFromVps() { calls.push('refreshOauthFromVps'); },
        async openOauthUrl() { calls.push('openOauthUrl'); },
        async executeSignupStep(step) { calls.push(`executeSignupStep:${step}`); },
        async executeFinalVerifyStep() {
          calls.push('executeFinalVerifyStep');
          throw new Error('verify failed');
        },
        async pollVerificationCode(phase) {
          calls.push(`pollVerificationCode:${phase}`);
          return { code: '123456' };
        },
        async fillLastCode(phase) { calls.push(`fillLastCode:${phase}`); },
        async completeCurrentAccount() { calls.push('completeCurrentAccount'); },
        async addLog(message) { calls.push(`log:${message}`); },
      },
    }),
    /verify failed/
  );

  assert.equal(calls.includes('completeCurrentAccount'), false);
});

test('runSingleAutoFlowWithAutoRetry retries the whole flow before account completion', async () => {
  const calls = [];
  const state = { stepStatuses: {} };
  let flowRun = 0;

  const result = await runSingleAutoFlowWithAutoRetry({
    state,
    getState: async () => state,
    maxFlowAttempts: 3,
    actions: {
      async prepareNextAccount() {
        flowRun += 1;
        state.stepStatuses = {};
        calls.push(`prepareNextAccount:${flowRun}`);
      },
      async refreshOauthFromVps() {
        calls.push(`refreshOauthFromVps:${flowRun}`);
      },
      async findCurrentEmailRecord() {
        calls.push(`findCurrentEmailRecord:${flowRun}`);
      },
      async openOauthUrl() {
        calls.push(`openOauthUrl:${flowRun}`);
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${flowRun}:${step}`);
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${flowRun}:${phase}`);
        if (flowRun === 1 && phase === 'signup') {
          state.stepStatuses = {
            1: 'completed',
            2: 'completed',
            3: 'completed',
            4: 'failed',
          };
          throw new Error('轮询失败');
        }
        return { code: '123456' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${flowRun}:${phase}`);
      },
      async executeFinalVerifyStep() {
        calls.push(`executeFinalVerifyStep:${flowRun}`);
      },
      async completeCurrentAccount() {
        calls.push(`completeCurrentAccount:${flowRun}`);
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount:1',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps:1',
    'findCurrentEmailRecord:1',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl:1',
    'executeSignupStep:1:2',
    'executeSignupStep:1:3',
    'pollVerificationCode:1:signup',
    'log:注册成功前出现错误，当前账号将自动重试整轮流程（第 2/3 次尝试）',
    'prepareNextAccount:2',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps:2',
    'findCurrentEmailRecord:2',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl:2',
    'executeSignupStep:2:2',
    'executeSignupStep:2:3',
    'pollVerificationCode:2:signup',
    'fillLastCode:2:signup',
    'executeSignupStep:2:5',
    'executeSignupStep:2:6',
    'pollVerificationCode:2:login',
    'fillLastCode:2:login',
    'executeSignupStep:2:8',
    'executeFinalVerifyStep:2',
    'completeCurrentAccount:2',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlow skips remaining signup steps when signup verification already lands on consent', async () => {
  const calls = [];

  const result = await runSingleAutoFlow({
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
        if (phase === 'signup') {
          return { reachedConsent: true };
        }
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps',
    'findCurrentEmailRecord',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl',
    'executeSignupStep:2',
    'executeSignupStep:3',
    'pollVerificationCode:signup',
    'fillLastCode:signup',
    'log:检测到页面已提前进入 OAuth 授权页，直接进入步骤 8。',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:单轮自动流程完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlowWithAutoRetry retries OAuth without restarting the whole flow', async () => {
  const calls = [];
  const state = { stepStatuses: {} };
  let flowRun = 0;
  let consentAttempts = 0;

  const result = await runSingleAutoFlowWithAutoRetry({
    state,
    getState: async () => state,
    maxFlowAttempts: 3,
    maxOauthAttempts: 3,
    actions: {
      async prepareNextAccount() {
        flowRun += 1;
        calls.push(`prepareNextAccount:${flowRun}`);
      },
      async refreshOauthFromVps() {
        calls.push(`refreshOauthFromVps:${flowRun}`);
      },
      async findCurrentEmailRecord() {
        calls.push(`findCurrentEmailRecord:${flowRun}`);
      },
      async openOauthUrl() {
        calls.push(`openOauthUrl:${flowRun}`);
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${flowRun}:${step}`);
        if (step === 8) {
          consentAttempts += 1;
          if (consentAttempts === 1) {
            state.stepStatuses = {
              1: 'completed',
              2: 'completed',
              3: 'completed',
              4: 'completed',
              5: 'completed',
              6: 'completed',
              7: 'completed',
              8: 'failed',
            };
            throw new Error('consent click failed');
          }
        }
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${flowRun}:${phase}`);
        return { code: phase === 'signup' ? '123456' : '654321' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${flowRun}:${phase}`);
      },
      async executeFinalVerifyStep() {
        calls.push(`executeFinalVerifyStep:${flowRun}`);
      },
      async completeCurrentAccount() {
        calls.push(`completeCurrentAccount:${flowRun}`);
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'prepareNextAccount:1',
    'log:单轮自动流程开始',
    'log:阶段 1：刷新 CPA 并重新获取 OAuth 链接',
    'refreshOauthFromVps:1',
    'findCurrentEmailRecord:1',
    'log:阶段 2：打开认证页面并进入注册流程',
    'openOauthUrl:1',
    'executeSignupStep:1:2',
    'executeSignupStep:1:3',
    'pollVerificationCode:1:signup',
    'fillLastCode:1:signup',
    'executeSignupStep:1:5',
    'executeSignupStep:1:6',
    'pollVerificationCode:1:login',
    'fillLastCode:1:login',
    'executeSignupStep:1:8',
    'log:步骤 8：确认 OAuth 授权 失败，正在自动重试 OAuth（第 2/3 次尝试）',
    'log:继续自动流程：从步骤 8 开始',
    'executeSignupStep:1:8',
    'executeFinalVerifyStep:1',
    'completeCurrentAccount:1',
    'log:自动流程继续完成，当前邮箱已标记为已使用',
  ]);
});

test('runSingleAutoFlowWithAutoRetry abandons account after 3 consecutive auth retry error screens', async () => {
  const calls = [];
  const state = { stepStatuses: {} };
  let flowRun = 0;
  let step8Attempts = 0;

  const result = await runSingleAutoFlowWithAutoRetry({
    state,
    getState: async () => state,
    maxFlowAttempts: 3,
    maxOauthAttempts: 5,
    actions: {
      async prepareNextAccount() {
        flowRun += 1;
        calls.push(`prepareNextAccount:${flowRun}`);
      },
      async refreshOauthFromVps() { calls.push(`refreshOauthFromVps:${flowRun}`); },
      async findCurrentEmailRecord() { calls.push(`findCurrentEmailRecord:${flowRun}`); },
      async openOauthUrl() { calls.push(`openOauthUrl:${flowRun}`); },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${flowRun}:${step}`);
        if (step === 3) {
          return { skipSignupVerification: true };
        }
        if (step === 8) {
          step8Attempts += 1;
          state.stepStatuses = {
            1: 'completed',
            2: 'completed',
            3: 'completed',
            4: 'completed',
            5: 'completed',
            6: 'completed',
            7: 'completed',
            8: 'failed',
          };
          throw new Error('[AUTH_ERROR_SCREEN:retry_page] Operation timed out');
        }
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${flowRun}:${phase}`);
        return { code: '654321' };
      },
      async fillLastCode(phase) { calls.push(`fillLastCode:${flowRun}:${phase}`); },
      async executeFinalVerifyStep() { calls.push(`executeFinalVerifyStep:${flowRun}`); },
      async completeCurrentAccount() {
        calls.push(`completeCurrentAccount:${flowRun}`);
        return { status: 'completed' };
      },
      async addLog(message) { calls.push(`log:${message}`); },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(step8Attempts, 3);
  assert.equal(calls.some((value) => value.includes('检测到当前账号连续 3 次出现')), true);
  assert.equal(calls.includes('executeFinalVerifyStep:1'), false);
  assert.deepEqual(
    calls.filter((value) => value.includes('executeSignupStep:1:8')),
    ['executeSignupStep:1:8', 'executeSignupStep:1:8', 'executeSignupStep:1:8']
  );
});

test('runSingleAutoFlowWithAutoRetry throws after automatic retries are exhausted', async () => {
  const calls = [];
  const state = { stepStatuses: {} };
  let flowRun = 0;

  await assert.rejects(
    () => runSingleAutoFlowWithAutoRetry({
      state,
      getState: async () => state,
      maxFlowAttempts: 2,
      maxOauthAttempts: 2,
      actions: {
        async prepareNextAccount() {
          flowRun += 1;
          calls.push(`prepareNextAccount:${flowRun}`);
        },
        async refreshOauthFromVps() {
          calls.push(`refreshOauthFromVps:${flowRun}`);
        },
        async findCurrentEmailRecord() {
          calls.push(`findCurrentEmailRecord:${flowRun}`);
        },
        async openOauthUrl() {
          calls.push(`openOauthUrl:${flowRun}`);
        },
        async executeSignupStep(step) {
          calls.push(`executeSignupStep:${flowRun}:${step}`);
          if (step === 8) {
            state.stepStatuses = {
              1: 'completed',
              2: 'completed',
              3: 'completed',
              4: 'completed',
              5: 'completed',
              6: 'completed',
              7: 'completed',
              8: 'failed',
            };
            throw new Error('consent click failed');
          }
        },
        async pollVerificationCode(phase) {
          calls.push(`pollVerificationCode:${flowRun}:${phase}`);
          return { code: '123456' };
        },
        async fillLastCode(phase) {
          calls.push(`fillLastCode:${flowRun}:${phase}`);
        },
        async executeFinalVerifyStep() {
          calls.push(`executeFinalVerifyStep:${flowRun}`);
        },
        async completeCurrentAccount() {
          calls.push(`completeCurrentAccount:${flowRun}`);
        },
        async addLog(message) {
          calls.push(`log:${message}`);
        },
      },
    }),
    /consent click failed/
  );

  assert.equal(calls.includes('completeCurrentAccount:1'), false);
  assert.equal(calls.includes('completeCurrentAccount:2'), false);
  assert.deepEqual(
    calls.filter((entry) => entry.startsWith('log:步骤 8：确认 OAuth 授权 失败，正在自动重试 OAuth')),
    [
      'log:步骤 8：确认 OAuth 授权 失败，正在自动重试 OAuth（第 2/2 次尝试）',
      'log:步骤 8：确认 OAuth 授权 失败，正在自动重试 OAuth（第 2/2 次尝试）',
    ]
  );
  assert.equal(
    calls.includes('log:OAuth 自动重试未成功，当前账号将自动重试整轮流程（第 2/2 次尝试）'),
    true
  );
});
