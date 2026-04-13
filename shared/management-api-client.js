function normalizeText(value) {
  return String(value || '').trim();
}

export function resolveManagementApiBaseUrl(input = '') {
  const raw = normalizeText(input);
  if (!raw) {
    throw new Error('缺少管理地址');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`管理地址无效：${raw}`);
  }

  let pathname = parsed.pathname || '';
  pathname = pathname.replace(/\/management\.html$/i, '/');
  pathname = pathname.replace(/\/+$/, '');

  return `${parsed.origin}${pathname}`;
}

export function buildManagementApiUrl(baseUrl, endpointPath, searchParams = {}) {
  const normalizedBaseUrl = resolveManagementApiBaseUrl(baseUrl);
  const normalizedEndpointPath = String(endpointPath || '').replace(/^\/+/, '');
  const requestUrl = new URL(
    normalizedEndpointPath,
    normalizedBaseUrl.endsWith('/') ? normalizedBaseUrl : `${normalizedBaseUrl}/`
  );

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    requestUrl.searchParams.set(key, String(value));
  });

  return requestUrl.toString();
}

async function readResponsePayload(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function extractPayloadMessage(payload = {}) {
  return normalizeText(payload.message || payload.error || payload.status || '');
}

export function createManagementApiClient({
  baseUrl = '',
  managementKey = '',
  fetchFn = fetch,
} = {}) {
  const normalizedBaseUrl = resolveManagementApiBaseUrl(baseUrl);
  const normalizedManagementKey = String(managementKey || '').trim();

  if (!normalizedManagementKey) {
    throw new Error('请先填写管理密钥');
  }

  async function requestJson(endpointPath, { searchParams = {} } = {}) {
    const requestUrl = buildManagementApiUrl(normalizedBaseUrl, endpointPath, searchParams);
    let response;

    try {
      response = await fetchFn(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${normalizedManagementKey}`,
        },
      });
    } catch (error) {
      throw new Error(`管理 API 请求失败：${requestUrl} - ${error?.message || String(error)}`);
    }

    const payload = await readResponsePayload(response);
    if (!response.ok) {
      const errorMessage = extractPayloadMessage(payload) || `HTTP ${response.status}`;
      throw new Error(`管理 API 请求失败：${requestUrl} - ${errorMessage}`);
    }

    return payload;
  }

  return {
    buildUrl(endpointPath, searchParams = {}) {
      return buildManagementApiUrl(normalizedBaseUrl, endpointPath, searchParams);
    },
    async getCodexAuthUrl({ isWebUi = false } = {}) {
      const payload = await requestJson('v0/management/codex-auth-url', {
        searchParams: isWebUi ? { is_webui: 'true' } : {},
      });

      const status = normalizeText(payload.status).toLowerCase();
      if (status !== 'ok') {
        throw new Error(`获取 Codex OAuth 链接失败：${extractPayloadMessage(payload) || '管理 API 未返回成功状态'}`);
      }

      const url = normalizeText(payload.url);
      const state = normalizeText(payload.state);
      if (!url || !state) {
        throw new Error('获取 Codex OAuth 链接失败：管理 API 返回缺少 url 或 state');
      }

      return { url, state };
    },
    async getAuthStatus({ state } = {}) {
      const normalizedState = normalizeText(state);
      if (!normalizedState) {
        throw new Error('缺少 OAuth state，请先重新执行步骤 1。');
      }

      const payload = await requestJson('v0/management/get-auth-status', {
        searchParams: { state: normalizedState },
      });

      return {
        status: normalizeText(payload.status).toLowerCase(),
        error: normalizeText(payload.error),
        raw: payload,
      };
    },
  };
}
