import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DISCOGS_RATE_LIMIT_INTERVAL_MS,
  DISCOGS_RATE_LIMIT_MAX_REQUESTS,
  getDiscogsPersonalAccessToken
} from '../discogsAuth';

describe('Discogs provider configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the trimmed token when configured', () => {
    vi.stubEnv('MAIN_VITE_DISCOGS_PERSONAL_ACCESS_TOKEN', '  abc-123-token  ');

    expect(getDiscogsPersonalAccessToken()).toBe('abc-123-token');
  });

  it('returns undefined when the token is missing, empty, or whitespace', () => {
    vi.stubEnv('MAIN_VITE_DISCOGS_PERSONAL_ACCESS_TOKEN', '');
    expect(getDiscogsPersonalAccessToken()).toBeUndefined();

    vi.stubEnv('MAIN_VITE_DISCOGS_PERSONAL_ACCESS_TOKEN', '   ');
    expect(getDiscogsPersonalAccessToken()).toBeUndefined();

    delete (import.meta.env as { MAIN_VITE_DISCOGS_PERSONAL_ACCESS_TOKEN?: string })
      .MAIN_VITE_DISCOGS_PERSONAL_ACCESS_TOKEN;
    expect(getDiscogsPersonalAccessToken()).toBeUndefined();
  });

  it('keeps the documented rate limit at 60 requests per minute', () => {
    expect(DISCOGS_RATE_LIMIT_MAX_REQUESTS).toBe(1);
    expect(DISCOGS_RATE_LIMIT_INTERVAL_MS).toBe(1000);
  });
});
