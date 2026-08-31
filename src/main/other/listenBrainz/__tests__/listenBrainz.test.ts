import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAndSaveListenBrainzToken } from '../validateAndSaveListenBrainzToken';
import { disconnectListenBrainz } from '../disconnectListenBrainz';
import { sendNowPlayingSongDataToListenBrainz } from '../sendNowPlayingSongDataToListenBrainz';
import { scrobbleSongToListenBrainz } from '../scrobbleSongToListenBrainz';
import {
  sendFavoritesDataToListenBrainz,
  resolveRecordingMbid,
  postFeedbackToListenBrainz
} from '../sendFavoritesDataToListenBrainz';
import {
  getCurrentListenBrainzGeneration,
  _resetListenBrainzSessionForTesting
} from '../listenBrainzSession';

vi.mock('@main/db/db', () => ({
  db: {}
}));

const mockGetUserSettings = vi.fn();
const mockSaveUserSettings = vi.fn().mockResolvedValue(undefined);
vi.mock('@main/db/queries/settings', () => ({
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
  saveUserSettings: (...args: unknown[]) => mockSaveUserSettings(...args)
}));
vi.mock('../../db/queries/settings', () => ({
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
  saveUserSettings: (...args: unknown[]) => mockSaveUserSettings(...args)
}));

const mockInsertScrobble = vi.fn().mockResolvedValue(undefined);
const mockClearScrobbleQueue = vi.fn().mockResolvedValue(undefined);
vi.mock('@main/db/queries/scrobble_queue', () => ({
  insertScrobble: (...args: unknown[]) => mockInsertScrobble(...args),
  clearScrobbleQueue: (...args: unknown[]) => mockClearScrobbleQueue(...args)
}));
vi.mock('../../db/queries/scrobble_queue', () => ({
  insertScrobble: (...args: unknown[]) => mockInsertScrobble(...args),
  clearScrobbleQueue: (...args: unknown[]) => mockClearScrobbleQueue(...args)
}));

const mockGetSongById = vi.fn();
vi.mock('@main/db/queries/songs', () => ({
  getSongById: (...args: unknown[]) => mockGetSongById(...args)
}));
vi.mock('../../db/queries/songs', () => ({
  getSongById: (...args: unknown[]) => mockGetSongById(...args)
}));

const mockFlushScrobbleQueue = vi.fn().mockResolvedValue(undefined);
vi.mock('../lastFm/flushScrobbleQueue', () => ({
  flushScrobbleQueue: (...args: unknown[]) => mockFlushScrobbleQueue(...args)
}));

vi.mock('@main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));
vi.mock('../../main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

vi.mock('@main/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn()
  }
}));

vi.mock('@main/utils/safeStorage', () => ({
  encrypt: (val: string) => `encrypted_${val}`,
  decrypt: (val: string) => val.replace('encrypted_', '')
}));
vi.mock('../../utils/safeStorage', () => ({
  encrypt: (val: string) => `encrypted_${val}`,
  decrypt: (val: string) => val.replace('encrypted_', '')
}));

const mockIsOnline = vi.fn().mockReturnValue(true);
vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
  return {
    ...actual,
    app: {
      getVersion: () => '1.0.0',
      getPath: () => 'C:/tmp',
      getAppPath: () => process.cwd(),
      isPackaged: false
    },
    net: {
      isOnline: () => mockIsOnline(),
      fetch: (...args: unknown[]) => (globalThis.fetch as any)(...args)
    }
  };
});

const createMockSongRow = (overrides: Record<string, any> = {}) => ({
  id: 10,
  title: 'Time',
  duration: 420,
  trackNumber: 4,
  isFavorite: false,
  isBlacklisted: false,
  path: '/music/time.mp3',
  artists: [{ artist: { id: 1, name: 'Pink Floyd' } }],
  albums: [{ album: { id: 1, title: 'The Dark Side of the Moon', isFavorite: false, artists: [] } }],
  artworks: [],
  genres: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

describe('ListenBrainz Integration Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetListenBrainzSessionForTesting();
    mockIsOnline.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token Validation & Authentication', () => {
    it('successfully validates token and stores encrypted credentials', async () => {
      mockGetUserSettings.mockResolvedValue({
        listenBrainzUserToken: null,
        listenBrainzUsername: null
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: 'Token valid.',
          valid: true,
          user_name: 'test_user'
        })
      });
      globalThis.fetch = mockFetch;

      const result = await validateAndSaveListenBrainzToken('valid_token_123');

      expect(result).toEqual({ success: true, userName: 'test_user' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.listenbrainz.org/1/validate-token',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Token valid_token_123'
          })
        })
      );
      expect(mockSaveUserSettings).toHaveBeenCalledWith({
        listenBrainzUsername: 'test_user',
        listenBrainzUserToken: 'encrypted_valid_token_123'
      });
    });

    it('throws error and does not save credentials when token is invalid', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 401,
          message: 'Invalid token.',
          valid: false
        })
      });
      globalThis.fetch = mockFetch;

      await expect(validateAndSaveListenBrainzToken('bad_token')).rejects.toThrow(
        'Invalid token.'
      );
      expect(mockSaveUserSettings).not.toHaveBeenCalled();
    });

    it('invalidates queue and session when switching to a different account', async () => {
      mockGetUserSettings.mockResolvedValue({
        listenBrainzUserToken: 'encrypted_old_token',
        listenBrainzUsername: 'old_user'
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: 'Token valid.',
          valid: true,
          user_name: 'new_user'
        })
      });
      globalThis.fetch = mockFetch;

      const initialGen = getCurrentListenBrainzGeneration();
      await validateAndSaveListenBrainzToken('new_token_456');

      expect(getCurrentListenBrainzGeneration()).toBe(initialGen + 1);
      expect(mockClearScrobbleQueue).toHaveBeenCalledTimes(1);
      expect(mockSaveUserSettings).toHaveBeenCalledWith({
        listenBrainzUsername: 'new_user',
        listenBrainzUserToken: 'encrypted_new_token_456'
      });
    });
  });

  describe('Disconnection', () => {
    it('resets credentials and toggles on disconnect', async () => {
      const initialGen = getCurrentListenBrainzGeneration();
      const result = await disconnectListenBrainz();

      expect(result).toBe(true);
      expect(getCurrentListenBrainzGeneration()).toBe(initialGen + 1);
      expect(mockSaveUserSettings).toHaveBeenCalledWith({
        listenBrainzUsername: null,
        listenBrainzUserToken: null,
        sendSongScrobblingDataToListenBrainz: false,
        sendSongFavoritesDataToListenBrainz: false,
        sendNowPlayingSongDataToListenBrainz: false
      });
    });
  });

  describe('Now Playing Submissions', () => {
    it('submits playing_now payload with duration in milliseconds', async () => {
      mockGetUserSettings.mockResolvedValue({
        sendNowPlayingSongDataToListenBrainz: true,
        listenBrainzUserToken: 'encrypted_token_123',
        listenBrainzUsername: 'test_user'
      });

      mockGetSongById.mockResolvedValue(
        createMockSongRow({
          title: 'Shine On You Crazy Diamond',
          duration: 810.5,
          trackNumber: 1,
          albums: [{ album: { id: 1, title: 'Wish You Were Here', isFavorite: false, artists: [] } }]
        })
      );

      let sentBody: any = null;
      const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' })
        };
      });
      globalThis.fetch = mockFetch;

      await sendNowPlayingSongDataToListenBrainz(10);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(sentBody).toMatchObject({
        listen_type: 'playing_now',
        payload: [
          {
            track_metadata: {
              artist_name: 'Pink Floyd',
              track_name: 'Shine On You Crazy Diamond',
              release_name: 'Wish You Were Here',
              additional_info: {
                media_player: 'Nora',
                submission_client: 'Nora',
                duration_ms: 810500,
                tracknumber: 1
              }
            }
          }
        ]
      });
    });

    it('skips now playing when disabled in settings', async () => {
      mockGetUserSettings.mockResolvedValue({
        sendNowPlayingSongDataToListenBrainz: false
      });

      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      await sendNowPlayingSongDataToListenBrainz(10);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Live Scrobbling & Offline Queueing', () => {
    it('submits live scrobble when online and enabled', async () => {
      mockGetUserSettings.mockResolvedValue({
        sendSongScrobblingDataToListenBrainz: true,
        listenBrainzUserToken: 'encrypted_token_123',
        listenBrainzUsername: 'test_user'
      });

      mockGetSongById.mockResolvedValue(createMockSongRow());

      let sentBody: any = null;
      const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' })
        };
      });
      globalThis.fetch = mockFetch;

      const startTimeSecs = 1756658000;
      await scrobbleSongToListenBrainz(10, startTimeSecs);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(sentBody).toMatchObject({
        listen_type: 'single',
        payload: [
          {
            listened_at: startTimeSecs,
            track_metadata: {
              artist_name: 'Pink Floyd',
              track_name: 'Time',
              release_name: 'The Dark Side of the Moon',
              additional_info: {
                duration_ms: 420000,
                tracknumber: 4
              }
            }
          }
        ]
      });
      expect(mockInsertScrobble).not.toHaveBeenCalled();
    });

    it('queues scrobble into scrobble_queue when offline', async () => {
      mockIsOnline.mockReturnValue(false);

      mockGetUserSettings.mockResolvedValue({
        sendSongScrobblingDataToListenBrainz: true,
        listenBrainzUserToken: 'encrypted_token_123',
        listenBrainzUsername: 'test_user'
      });

      mockGetSongById.mockResolvedValue(createMockSongRow());

      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const startTimeSecs = 1756658000;
      await scrobbleSongToListenBrainz(10, startTimeSecs);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockInsertScrobble).toHaveBeenCalledWith({
        songId: 10,
        startTimeSecs,
        operationType: 'listenbrainz.scrobble',
        trackTitle: 'Time',
        artistNames: 'Pink Floyd'
      });
    });

    it('queues scrobble into scrobble_queue on transient 429 / 5xx failure', async () => {
      mockGetUserSettings.mockResolvedValue({
        sendSongScrobblingDataToListenBrainz: true,
        listenBrainzUserToken: 'encrypted_token_123',
        listenBrainzUsername: 'test_user'
      });

      mockGetSongById.mockResolvedValue(createMockSongRow());

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' })
      });
      globalThis.fetch = mockFetch;

      const startTimeSecs = 1756658000;
      await scrobbleSongToListenBrainz(10, startTimeSecs);

      expect(mockInsertScrobble).toHaveBeenCalledWith({
        songId: 10,
        startTimeSecs,
        operationType: 'listenbrainz.scrobble',
        trackTitle: 'Time',
        artistNames: 'Pink Floyd'
      });
    });
  });

  describe('Recording Feedback & Favorites', () => {
    it('resolves MBID via lookup when score >= 0.8 and posts feedback', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          metadata: {
            recording_mbid: 'mbid-uuid-1234',
            score: 0.95
          }
        })
      });
      globalThis.fetch = mockFetch;

      const mbid = await resolveRecordingMbid('Echoes', 'Pink Floyd', 'token_123');
      expect(mbid).toBe('mbid-uuid-1234');
    });

    it('rejects low confidence MBID candidates (< 0.8)', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          metadata: {
            recording_mbid: 'wrong-mbid-uuid',
            score: 0.65
          }
        })
      });
      globalThis.fetch = mockFetch;

      const mbid = await resolveRecordingMbid('Echoes', 'Unknown Cover Band', 'token_123');
      expect(mbid).toBeNull();
    });

    it('posts score 1 for love and score 0 for unlove', async () => {
      let sentBody: any = null;
      const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' })
        };
      });
      globalThis.fetch = mockFetch;

      await postFeedbackToListenBrainz('token_123', 'mbid-uuid-1234', 1);
      expect(sentBody).toEqual({ recording_mbid: 'mbid-uuid-1234', score: 1 });

      await postFeedbackToListenBrainz('token_123', 'mbid-uuid-1234', 0);
      expect(sentBody).toEqual({ recording_mbid: 'mbid-uuid-1234', score: 0 });
    });

    it('queues favorite into scrobble_queue when offline', async () => {
      mockIsOnline.mockReturnValue(false);

      mockGetUserSettings.mockResolvedValue({
        sendSongFavoritesDataToListenBrainz: true
      });

      await sendFavoritesDataToListenBrainz('love', 'Money', ['Pink Floyd']);

      expect(mockInsertScrobble).toHaveBeenCalledWith({
        operationType: 'listenbrainz.love',
        trackTitle: 'Money',
        artistNames: 'Pink Floyd'
      });
    });
  });
});
