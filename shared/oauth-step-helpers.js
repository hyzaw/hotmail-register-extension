(function attachHelpers(globalScope) {
  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect?.();
    const style = globalScope.getComputedStyle?.(element);
    if (!rect || !style) return false;
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  }

  function queryFirst(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function isLikelyOtpInput(element) {
    if (!element || element.tagName !== 'INPUT' || !isVisible(element)) {
      return false;
    }

    const type = String(element.getAttribute('type') || element.type || '').toLowerCase();
    if (type === 'hidden' || type === 'password' || type === 'email' || type === 'date') {
      return false;
    }

    const hintText = [
      element.getAttribute('name'),
      element.getAttribute('id'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.getAttribute('autocomplete'),
      element.getAttribute('data-testid'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const hasOtpHint = /(^|[\s_-])(code|otp|passcode|pin|verification)([\s_-]|$)|验证码|校验码|一次性/.test(hintText);

    const autocomplete = String(element.getAttribute('autocomplete') || '').toLowerCase();
    if (autocomplete === 'one-time-code') {
      return true;
    }

    if (hasOtpHint) {
      return true;
    }

    const maxLength = Number(element.getAttribute('maxlength') || element.maxLength || 0);
    const inputMode = String(element.getAttribute('inputmode') || element.inputMode || '').toLowerCase();
    const pattern = String(element.getAttribute('pattern') || element.pattern || '').toLowerCase();
    if (maxLength === 6 && (inputMode === 'numeric' || /\\d|[0-9]/.test(pattern))) {
      return true;
    }

    return false;
  }

  function getCodeInput() {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.find((element) => isLikelyOtpInput(element)) || null;
  }

  function getEmailInput() {
    return queryFirst(['input[type="email"]', 'input[name="email"]']);
  }

  function getPasswordInput() {
    return queryFirst(['input[type="password"]', 'input[name="password"]']);
  }

  const api = {
    getCodeInput,
    getEmailInput,
    getPasswordInput,
    queryFirst,
  };

  globalScope.HotmailRegisterHelpers = {
    ...api,
    ...(globalScope.HotmailRegisterOAuthHelpers || {}),
  };
})(globalThis);
