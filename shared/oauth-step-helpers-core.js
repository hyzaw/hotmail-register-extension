export function normalizeInlineText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function parseUrl(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function isLoopbackCallbackUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  return parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '::1'
    || parsed.hostname === '[::1]';
}

export function findLoopbackCallbackUrl(candidates = []) {
  for (const candidate of candidates) {
    if (isLoopbackCallbackUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function isCompletedLoopbackCallbackUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed || !isLoopbackCallbackUrl(url)) {
    return false;
  }

  return parsed.searchParams.has('code')
    || parsed.searchParams.has('error')
    || parsed.searchParams.has('state');
}

export function findCompletedLoopbackCallbackUrl(candidates = []) {
  for (const candidate of candidates) {
    if (isCompletedLoopbackCallbackUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findMatchingText(candidates = [], pattern) {
  for (const candidate of candidates) {
    const normalized = normalizeInlineText(candidate);
    if (normalized && pattern.test(normalized)) {
      return normalized;
    }
  }

  return '';
}

export function findStep9SuccessText(candidates = []) {
  return findMatchingText(
    candidates,
    /认证成功|authentication\s+successful|authenticated\s+successfully|success(?:!|$|\b)/i
  );
}

export function findStep9TimeoutText(candidates = []) {
  return findMatchingText(candidates, /认证失败:\s*Timeout waiting for OAuth callback/i);
}

export function isOAuthConsentUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  return /\/sign-in-with-chatgpt\/[^/]+\/consent(?:[/?#]|$)/i.test(parsed.pathname || '');
}

export function isSignupFlowUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  const pathname = parsed.pathname || '';
  const params = parsed.searchParams;
  return /\/u\/signup(?:[/?#]|$)|\/signup(?:[/?#]|$)|\/create-account(?:[/?#]|$)/i.test(pathname)
    || /signup/i.test(params.get('screen_hint') || '')
    || /signup/i.test(params.get('mode') || '')
    || /signup/i.test(params.get('action') || '');
}

export function isDefinitiveSignupUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  const pathname = parsed.pathname || '';
  return /\/u\/signup(?:[/?#]|$)|\/signup(?:[/?#]|$)|\/create-account(?:[/?#]|$)/i.test(pathname);
}

export function isLoginFlowUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  const pathname = parsed.pathname || '';
  const params = parsed.searchParams;
  return /\/u\/login(?:[/?#]|$)|\/log-in(?:[/?#]|$)/i.test(pathname)
    || /login/i.test(params.get('screen_hint') || '')
    || /login/i.test(params.get('mode') || '')
    || /login/i.test(params.get('action') || '');
}

export function buildSignupTransitionUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return '';
  }

  const next = new URL(parsed.toString());
  const pathname = next.pathname || '';
  if (/^\/u\/login(?:\/|$)/i.test(pathname)) {
    next.pathname = pathname.replace(/^\/u\/login/i, '/u/signup');
    return next.toString();
  }
  if (/^\/log-in(?:\/|$)/i.test(pathname)) {
    next.pathname = pathname.replace(/^\/log-in/i, '/create-account');
    return next.toString();
  }
  if (isLoginFlowUrl(url)) {
    next.searchParams.set('screen_hint', 'signup');
    return next.toString();
  }

  return '';
}

export function isEmailVerificationUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }

  return /\/email-verification(?:[/?#]|$)/i.test(parsed.pathname || '');
}

export function isStep8ActionText(text) {
  return /继续|continue|authorize|allow|同意|批准|approve|accept/i.test(normalizeInlineText(text));
}

export function getInteractionPacingProfile() {
  return {
    afterTyping: [450, 900],
    beforePrimaryClick: [350, 700],
    afterPrimarySubmit: [1400, 2200],
    betweenProfileFields: [250, 600],
    beforeProfileSubmit: [600, 1100],
    afterProfileSubmit: [1500, 2400],
    afterLoginSwitch: [1200, 1800],
  };
}

export function isSignupActionText(text) {
  return /sign\s*up|create\s+(?:an?\s+)?account|注册|创建账号|创建帐户|signup/i.test(normalizeInlineText(text));
}

export function isSignupPageText(text) {
  return /创建密码|create\s+(?:your\s+)?password|继续创建|继续注册|完成注册|first\s+name|last\s+name|given[-\s]*name|family[-\s]*name/i.test(normalizeInlineText(text));
}

export function isSignupPasswordValidationErrorText(text) {
  return /your\s+password\s+must\s+contain|password\s+must\s+contain|at\s+least\s+12\s+characters|密码必须包含|至少\s*12\s*个字符/i.test(normalizeInlineText(text));
}

export function isProfileSetupPageText(text) {
  return /\bfirst\s+name\b|\blast\s+name\b|\bfull\s+name\b|\bgiven[-\s]*name\b|\bfamily[-\s]*name\b|\bbirthday\b|\bbirth\s*date\b|\bage\b|出生日期|生日|年龄/i.test(normalizeInlineText(text));
}

export function isLoginPasswordPageText(text) {
  return /enter\s+your\s+password|incorrect\s+email\s+address\s+or\s+password|forgot\s+password|log\s+in\s+with\s+a\s+one[-\s]*time\s+code/i.test(normalizeInlineText(text));
}

export function shouldTreatPasswordPageAsSignup({ url = '', text = '', hasPasswordInput = false } = {}) {
  if (!hasPasswordInput) {
    return false;
  }

  const normalized = normalizeInlineText(text);
  if (isDefinitiveSignupUrl(url)) {
    return true;
  }

  if (isLoginFlowUrl(url)) {
    return false;
  }

  return isSignupPageText(normalized) && !isLoginPasswordPageText(normalized);
}

export function isExistingAccountSignalText(text) {
  return /account\s+associated\s+with\s+this\s+email\s+address\s+already\s+exists|email\s+address.*already\s+exists|this\s+email\s+address\s+is\s+already\s+in\s+use|与此电子邮件地址相关联的帐户已存在|与此电子邮件地址相关联的账户已存在|相关联的帐户已存在|相关联的账户已存在|该电子邮件地址已被使用|该邮箱已被使用|账户已存在|帐户已存在|已存在关联(?:账号|帐户|账户)|(?:该|此)?(?:邮箱|账号|账户|帐户)已(?:被)?注册|(?:该|此)?(?:邮箱|账号|账户|帐户)已存在|已被注册|已经注册|已注册/i.test(normalizeInlineText(text));
}

export function shouldTreatLoginFlowAsExistingAccount({ url = '', text = '', hasLoginAction = false } = {}) {
  const normalized = normalizeInlineText(text);
  if (!isExistingAccountSignalText(normalized)) {
    return false;
  }

  return Boolean(
    hasLoginAction
    || isLoginFlowUrl(url)
    || isLoginPasswordPageText(normalized)
  );
}

export function describeStep3LoginFlowState({ url = '', text = '', hasLoginAction = false } = {}) {
  const normalized = normalizeInlineText(text);
  return [
    `url=${url || ''}`,
    `loginFlowUrl=${isLoginFlowUrl(url)}`,
    `loginPasswordPage=${isLoginPasswordPageText(normalized)}`,
    `hasLoginAction=${Boolean(hasLoginAction)}`,
    `hasExistingAccountSignal=${isExistingAccountSignalText(normalized)}`,
  ].join('; ');
}

function pickFromList(values = [], randomFn = Math.random) {
  if (!values.length) {
    return '';
  }

  const index = Math.min(values.length - 1, Math.floor(randomFn() * values.length));
  return values[index];
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function buildRandomProfile(randomFn = Math.random) {
  const firstNames = ['Adrian', 'Blake', 'Calvin', 'Damian', 'Elliot', 'Felix', 'Gavin', 'Holden', 'Isaac', 'Julian', 'Kieran', 'Landon', 'Miles', 'Nolan', 'Oscar', 'Parker', 'Quentin', 'Rowan', 'Sawyer', 'Theo', 'Vincent', 'Wesley', 'Xavier', 'Wyatt'];
  const lastNames = ['Bennett', 'Caldwell', 'Dalton', 'Ellis', 'Fletcher', 'Griffin', 'Hawkins', 'Iverson', 'Jennings', 'Kensington', 'Lawson', 'Mitchell', 'North', 'Prescott', 'Quincy', 'Remington', 'Sullivan', 'Tatum', 'Underwood', 'Vaughn', 'Walker', 'Whitman', 'York', 'Winslow'];
  const numericAge = 19 + Math.floor(randomFn() * 24);
  const birthYear = new Date().getUTCFullYear() - numericAge;
  const birthMonth = 1 + Math.floor(randomFn() * 12);
  const birthDay = 1 + Math.floor(randomFn() * 28);
  const firstName = pickFromList(firstNames, randomFn);
  const lastName = pickFromList(lastNames, randomFn);

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    age: String(numericAge),
    birthday: `${birthYear}-${pad2(birthMonth)}-${pad2(birthDay)}`,
  };
}

export function isSignupLandingPageText(text) {
  return /create\s+an\s+account|continue\s+with\s+google|continue\s+with\s+apple|continue\s+with\s+microsoft|already\s+have\s+an\s+account\?\s*log\s*in|创建(?:帐户|账户|账号)|继续使用\s*(?:google|apple|microsoft)\s*登录|已经有(?:帐户|账户|账号)了？\s*请登录/i.test(normalizeInlineText(text));
}

export function isExplicitSignupFlowPageText(text) {
  const normalized = normalizeInlineText(text);
  if (!normalized || isLoginPasswordPageText(normalized)) {
    return false;
  }
  return isSignupLandingPageText(normalized)
    || isSignupPageText(normalized)
    || isProfileSetupPageText(normalized);
}

export function shouldUseStep8ContinueButton(state = {}) {
  const hasConsentAction = Boolean(state.hasContinueButton) || Boolean(state.hasActionButton);
  const isConsentPage = Boolean(state.isConsentUrl) || Boolean(state.isConsentText);

  return hasConsentAction
    && !Boolean(state.isVerificationPage)
    && !Boolean(state.isAddPhonePage)
    && isConsentPage;
}

export const oauthStepHelpers = {
  findCompletedLoopbackCallbackUrl,
  findLoopbackCallbackUrl,
  findStep9SuccessText,
  findStep9TimeoutText,
  buildRandomProfile,
  buildSignupTransitionUrl,
  getInteractionPacingProfile,
  isEmailVerificationUrl,
  isExistingAccountSignalText,
  isExplicitSignupFlowPageText,
  isDefinitiveSignupUrl,
  isLoginFlowUrl,
  isSignupFlowUrl,
  isCompletedLoopbackCallbackUrl,
  isLoginPasswordPageText,
  isLoopbackCallbackUrl,
  isOAuthConsentUrl,
  isProfileSetupPageText,
  isSignupActionText,
  isSignupLandingPageText,
  isSignupPasswordValidationErrorText,
  isSignupPageText,
  isStep8ActionText,
  normalizeInlineText,
  parseUrl,
  describeStep3LoginFlowState,
  shouldTreatPasswordPageAsSignup,
  shouldTreatLoginFlowAsExistingAccount,
  shouldUseStep8ContinueButton,
};
