import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import logger from '../../logger';
import fetchLyricsFromLrclib from '../fetchLyricsFromLrclib';

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

const mockTrackInfo = {
  track_name: 'Into You',
  artist_name: 'Ariana Grande',
  album_name: 'Dangerous Woman',
  duration: '244'
};

describe('fetchLyricsFromLrclib HTTP status and error classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should parse and return lyrics on HTTP 200 OK', async () => {
    const mockApiResponse = {
      id: 12345,
      trackName: 'Into You',
      artistName: 'Ariana Grande',
      albumName: 'Dangerous Woman',
      duration: 244,
      instrumental: false,
      plainLyrics: 'I am so into you',
      syncedLyrics: '[00:10.00] I am so into you'
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse
      } as any)
    );

    const result = await fetchLyricsFromLrclib(mockTrackInfo);

    expect(result).toBeDefined();
    expect(result?.lrclibId).toBe(12345);
    expect(result?.trackName).toBe('Into You');
    expect(result?.lyrics).toContain('I am so into you');
  });

  it('should log at debug level and return undefined on HTTP 404 (Not Found)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as any)
    );

    const result = await fetchLyricsFromLrclib(mockTrackInfo);

    expect(result).toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('No lyrics found on Lrclib (404 Not Found)'),
      expect.objectContaining({
        status: 404,
        title: 'Into You',
        artist: 'Ariana Grande'
      })
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should log at warn level with status metadata on HTTP 429 (Rate Limited)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      } as any)
    );

    const result = await fetchLyricsFromLrclib(mockTrackInfo);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 429'),
      expect.objectContaining({
        status: 429,
        statusText: 'Too Many Requests',
        title: 'Into You'
      })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should log at warn level on HTTP 500 server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as any)
    );

    const result = await fetchLyricsFromLrclib(mockTrackInfo);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 500'),
      expect.objectContaining({
        status: 500,
        statusText: 'Internal Server Error'
      })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should log at debug level on AbortError', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await fetchLyricsFromLrclib(mockTrackInfo);

    expect(result).toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('aborted'),
      expect.objectContaining({ title: 'Into You' })
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should log at error level on network/connection failure', async () => {
    const networkError = new TypeError('fetch failed: ECONNRESET');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

    const result = await fetchLyricsFromLrclib(mockTrackInfo);

    expect(result).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('network error'),
      expect.objectContaining({
        error: networkError,
        title: 'Into You'
      })
    );
  });
});
