/**
 * Resolves the Discogs personal access token from build-time environment.
 *
 * Discogs' `/database/search` requires authentication; without a token every request receives 401.
 * When no token is configured the provider must be gracefully disabled instead of issuing doomed
 * requests.
 *
 * Personal access tokens authenticate via `Authorization: Bearer <token>`.
 */
export const getDiscogsPersonalAccessToken = (): string | undefined => {
  const token = import.meta.env.MAIN_VITE_DISCOGS_PERSONAL_ACCESS_TOKEN;
  if (typeof token !== 'string') return undefined;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const DISCOGS_RATE_LIMIT_MAX_REQUESTS = 1;
export const DISCOGS_RATE_LIMIT_INTERVAL_MS = 1000;
