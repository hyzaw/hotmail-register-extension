export const AUTH_BROWSING_DATA_ORIGINS = Object.freeze([
  'https://auth0.openai.com',
  'https://auth.openai.com',
  'https://accounts.openai.com',
]);

export function getAuthBrowsingDataOptions() {
  return {
    since: 0,
    origins: [...AUTH_BROWSING_DATA_ORIGINS],
  };
}

export function getAuthBrowsingDataRemovals() {
  return {
    cache: true,
    cacheStorage: true,
    cookies: true,
    fileSystems: true,
    indexedDB: true,
    localStorage: true,
    serviceWorkers: true,
    webSQL: true,
  };
}
