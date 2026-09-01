import * as scrobbleQueueQueries from '@main/db/queries/scrobble_queue';
import * as songQueries from '@main/db/queries/songs';
import { net } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import getListenBrainzAuthData from '../../listenBrainz/getListenBrainzAuthData';
import {
  _resetFlushStateForTesting,
  flushScrobbleQueue,
  invalidateLastFmSession
} from '../flushScrobbleQueue';
import getLastFmAuthData from '../getLastFMAuthData';
import * as lastFmUtils from '../lastFmUtils';

vi.mock('@main/db/db', () => ({
  db: {}
}));

vi.mock('@main/db/queries/scrobble_queue', () => ({
  claimPendingBatch: vi.fn(),
  deleteOldPending: vi.fn(),
  markFailed: vi.fn(),
  markPermanentlyFailed: vi.fn(),
  markSent: vi.fn(),
  resetSendingToPending: vi.fn(),
  resetStuckSending: vi.fn(),
  clearScrobbleQueue: vi.fn()
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

vi.mock('../getLastFMAuthData', () => ({
  default: vi.fn().mockResolvedValue({
    LAST_FM_API_KEY: 'test_api_key',
    SESSION_KEY: 'test_session_key',
    LAST_FM_SHARED_SECRET: 'test_shared_secret'
  })
}));

vi.mock('../../listenBrainz/getListenBrainzAuthData', () => ({
  default: vi.fn().mockResolvedValue({
    userToken: 'test_lb_token',
    userName: 'test_lb_user'
  })
}));
vi.mock('../listenBrainz/getListenBrainzAuthData', () => ({
  default: vi.fn().mockResolvedValue({
    userToken: 'test_lb_token',
    userName: 'test_lb_user'
  })
}));

vi.mock('../../listenBrainz/sendFavoritesDataToListenBrainz', () => ({
  resolveRecordingMbid: vi.fn().mockResolvedValue('test-mbid-123'),
  postFeedbackToListenBrainz: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../listenBrainz/sendFavoritesDataToListenBrainz', () => ({
  resolveRecordingMbid: vi.fn().mockResolvedValue('test-mbid-123'),
  postFeedbackToListenBrainz: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@main/db/queries/songs', () => ({
  getSongById: vi.fn().mockResolvedValue({
    id: 1,
    title: 'Test Song',
    duration: 200,
    trackNumber: 1,
    isFavorite: false,
    isBlacklisted: false,
    artists: [{ artist: { id: 1, name: 'Test Artist' } }],
    albums: [{ album: { id: 1, title: 'Test Album', isFavorite: false, artists: [] } }],
    artworks: [],
    genres: [],
    createdAt: new Date(),
    updatedAt: new Date()
  })
}));

describe('flushScrobbleQueue Durable Outbox', () => {
  beforeEach(() => {
    vi.mocked(scrobbleQueueQueries.claimPendingBatch).mockReset();
    vi.mocked(scrobbleQueueQueries.deleteOldPending).mockReset();
    vi.mocked(scrobbleQueueQueries.markFailed).mockReset();
    vi.mocked(scrobbleQueueQueries.markPermanentlyFailed).mockReset();
    vi.mocked(scrobbleQueueQueries.markSent).mockReset();
    vi.mocked(scrobbleQueueQueries.resetSendingToPending).mockReset();
    vi.mocked(scrobbleQueueQueries.resetStuckSending).mockReset();
    vi.mocked(scrobbleQueueQueries.clearScrobbleQueue).mockReset();
    vi.mocked(getLastFmAuthData).mockReset();
    vi.mocked(getListenBrainzAuthData).mockReset();
    vi.mocked(songQueries.getSongById).mockReset();
    vi.clearAllMocks();
    _resetFlushStateForTesting();
    vi.mocked(net.isOnline).mockReturnValue(true);
    vi.mocked(getLastFmAuthData).mockResolvedValue({
      LAST_FM_API_KEY: 'test_api_key',
      SESSION_KEY: 'test_session_key',
      LAST_FM_SHARED_SECRET: 'test_shared_secret'
    });
    vi.mocked(getListenBrainzAuthData).mockResolvedValue({
      userToken: 'test_lb_token',
      userName: 'test_lb_user'
    });
    vi.mocked(songQueries.getSongById).mockResolvedValue({
      id: 1,
      title: 'Test Song',
      duration: 200,
      trackNumber: 1,
      isFavorite: false,
      isBlacklisted: false,
      artists: [{ artist: { id: 1, name: 'Test Artist' } }],
      albums: [{ album: { id: 1, title: 'Test Album', isFavorite: false, artists: [] } }],
      artworks: [],
      genres: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as Awaited<ReturnType<typeof songQueries.getSongById>>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips flush when offline', async () => {
    vi.mocked(net.isOnline).mockReturnValue(false);
    const claimSpy = vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch');

    await flushScrobbleQueue();

    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('skips flush when no auth data exists', async () => {
    vi.mocked(getLastFmAuthData).mockRejectedValue(new Error('No auth'));
    vi.mocked(getListenBrainzAuthData).mockRejectedValue(new Error('No auth'));
    const claimSpy = vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch');

    await flushScrobbleQueue();

    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('recovers stuck sending items on startup flush', async () => {
    const resetStuckSpy = vi
      .spyOn(scrobbleQueueQueries, 'resetStuckSending')
      .mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch').mockResolvedValueOnce([]);

    await flushScrobbleQueue();

    expect(resetStuckSpy).toHaveBeenCalledTimes(1);
  });

  it('successfully flushes valid scrobble items and marks them sent', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300; // 5 mins ago
    const mockItem = {
      id: 101,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Test Song',
      artistNames: 'Test Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent').mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(
        JSON.stringify({
          scrobbles: {
            scrobble: { track: { '#text': 'Test Song' } },
            '@attr': { accepted: 1, ignored: 0 }
          }
        }),
        { status: 200 }
      )
    );

    await flushScrobbleQueue();

    expect(markSentSpy).toHaveBeenCalledWith(101);
  });

  it('successfully flushes track.love without requiring @attr.accepted', async () => {
    const mockLoveItem = {
      id: 102,
      songId: null,
      startTimeSecs: null,
      operationType: 'track.love',
      trackTitle: 'Loved Song',
      artistNames: 'Loved Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockLoveItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent').mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    );

    await flushScrobbleQueue();

    expect(markSentSpy).toHaveBeenCalledWith(102);
  });

  it('discards local stale scrobbles older than 14 days without calling Last.fm API', async () => {
    const twentyDaysAgoSecs = Math.floor(Date.now() / 1000) - 20 * 86400;
    const mockStaleItem = {
      id: 103,
      songId: 1,
      startTimeSecs: twentyDaysAgoSecs,
      operationType: 'scrobble',
      trackTitle: 'Stale Song',
      artistNames: 'Stale Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockStaleItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent').mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(lastFmUtils, 'fetchWithTimeout');

    await flushScrobbleQueue();

    expect(markSentSpy).toHaveBeenCalledWith(103);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('discards API-ignored scrobbles with ignoredMessage code 3 (timestamp too old)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 104,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Old Timestamp Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent').mockResolvedValue(undefined);
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed');

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(
        JSON.stringify({
          scrobbles: {
            scrobble: {
              track: { '#text': 'Old Timestamp Song' },
              ignoredMessage: { code: '3', '#text': 'Timestamp was too old' }
            },
            '@attr': { accepted: 0, ignored: 1 }
          }
        }),
        { status: 200 }
      )
    );

    await flushScrobbleQueue();

    expect(markSentSpy).toHaveBeenCalledWith(104);
    expect(markFailedSpy).not.toHaveBeenCalled();
  });

  it('discards API-filtered scrobbles with ignoredMessage code 1 (artist filtered)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 105,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Filtered Song',
      artistNames: 'Filtered Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent').mockResolvedValue(undefined);
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed');

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(
        JSON.stringify({
          scrobbles: {
            scrobble: {
              track: { '#text': 'Filtered Song' },
              ignoredMessage: { code: '1', '#text': 'Artist was ignored' }
            },
            '@attr': { accepted: 0, ignored: 1 }
          }
        }),
        { status: 200 }
      )
    );

    await flushScrobbleQueue();

    expect(markSentSpy).toHaveBeenCalledWith(105);
    expect(markFailedSpy).not.toHaveBeenCalled();
  });

  it('retries scrobbles when ignoredMessage code is 5 (daily limit exceeded)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 106,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Daily Limit Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed').mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(
        JSON.stringify({
          scrobbles: {
            scrobble: {
              track: { '#text': 'Daily Limit Song' },
              ignoredMessage: { code: '5', '#text': 'Daily scrobble limit exceeded' }
            },
            '@attr': { accepted: 0, ignored: 1 }
          }
        }),
        { status: 200 }
      )
    );

    await flushScrobbleQueue();

    expect(markFailedSpy).toHaveBeenCalledWith(106);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('marks permanently failed on API Error 13 (Invalid Method Signature) without discarding via markSent', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 107,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Bad Signature Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markPermFailedSpy = vi
      .spyOn(scrobbleQueueQueries, 'markPermanentlyFailed')
      .mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(JSON.stringify({ error: 13, message: 'Invalid method signature supplied' }), {
        status: 200
      })
    );

    await flushScrobbleQueue();

    expect(markPermFailedSpy).toHaveBeenCalledWith(107);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('marks permanently failed on malformed response (missing @attr.accepted) without discarding', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 108,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Malformed Response Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markPermFailedSpy = vi
      .spyOn(scrobbleQueueQueries, 'markPermanentlyFailed')
      .mockResolvedValue(undefined);

    // Malformed: has scrobbles but missing @attr.accepted
    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(
        JSON.stringify({
          scrobbles: {
            '@attr': { ignored: 1 }
          }
        }),
        { status: 200 }
      )
    );

    await flushScrobbleQueue();

    expect(markPermFailedSpy).toHaveBeenCalledWith(108);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('marks permanently failed on unknown ignoredMessage code (code 999) without discarding', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 109,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Unknown Ignored Code Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markPermFailedSpy = vi
      .spyOn(scrobbleQueueQueries, 'markPermanentlyFailed')
      .mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(
        JSON.stringify({
          scrobbles: {
            scrobble: {
              track: { '#text': 'Song' },
              ignoredMessage: { code: '999', '#text': 'Future unknown filter reason' }
            },
            '@attr': { accepted: 0, ignored: 1 }
          }
        }),
        { status: 200 }
      )
    );

    await flushScrobbleQueue();

    expect(markPermFailedSpy).toHaveBeenCalledWith(109);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('retries when database query fails rather than falling back to metadata', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 110,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Fallback Song',
      artistNames: 'Fallback Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    // DB query throws connection error
    vi.mocked(songQueries.getSongById).mockRejectedValueOnce(new Error('DB Connection Terminated'));

    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed').mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(lastFmUtils, 'fetchWithTimeout');

    await flushScrobbleQueue();

    // Must NOT post to Last.fm using fallback metadata when DB throws
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(markFailedSpy).toHaveBeenCalledWith(110);
  });

  it('halts flush cycle and resets in-flight items on auth error (code 9)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const item1 = {
      id: 201,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song 1',
      artistNames: 'Artist 1',
      status: 'sending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const item2 = {
      id: 202,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song 2',
      artistNames: 'Artist 2',
      status: 'sending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch').mockResolvedValueOnce([item1, item2]);

    const resetSendingSpy = vi
      .spyOn(scrobbleQueueQueries, 'resetSendingToPending')
      .mockResolvedValue(undefined);
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed');

    // Return Auth Error 9
    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(JSON.stringify({ error: 9, message: 'Invalid session key' }), { status: 200 })
    );

    await flushScrobbleQueue();

    // Both items must be reset to pending without incrementing retry count
    expect(resetSendingSpy).toHaveBeenCalledWith([201, 202]);
    expect(markFailedSpy).not.toHaveBeenCalled();
  });

  it('halts flush cycle and resets in-flight items on auth error 15 (token expired)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const item1 = {
      id: 203,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song 1',
      artistNames: 'Artist 1',
      status: 'sending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch').mockResolvedValueOnce([item1]);

    const resetSendingSpy = vi
      .spyOn(scrobbleQueueQueries, 'resetSendingToPending')
      .mockResolvedValue(undefined);
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed');

    // Return Auth Error 15
    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(JSON.stringify({ error: 15, message: 'This token has expired' }), {
        status: 200
      })
    );

    await flushScrobbleQueue();

    expect(resetSendingSpy).toHaveBeenCalledWith([203]);
    expect(markFailedSpy).not.toHaveBeenCalled();
  });

  it('retries scrobbles on transient error 8 (operation failed)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 204,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed').mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockResolvedValue(
      new Response(JSON.stringify({ error: 8, message: 'Operation failed. Try again.' }), {
        status: 200
      })
    );

    await flushScrobbleQueue();

    expect(markFailedSpy).toHaveBeenCalledWith(204);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('cancels in-flight flush and prevents markSent when invalidateLastFmSession is triggered during flush', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 205,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');

    // Simulate account invalidation occurring while fetchWithTimeout is in flight
    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockImplementationOnce(async () => {
      invalidateLastFmSession();
      return new Response(
        JSON.stringify({
          scrobbles: {
            scrobble: { track: { '#text': 'Song' } },
            '@attr': { accepted: 1, ignored: 0 }
          }
        }),
        { status: 200 }
      );
    });

    await flushScrobbleQueue();

    // Since session was invalidated, markSent MUST NOT be called!
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('invokes deleteOldPending on flush to prune 30-day old pending and failed items', async () => {
    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    const deleteOldSpy = vi
      .spyOn(scrobbleQueueQueries, 'deleteOldPending')
      .mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch').mockResolvedValueOnce([]);

    await flushScrobbleQueue();

    expect(deleteOldSpy).toHaveBeenCalledTimes(1);
  });

  it('retries scrobbles on HTTP 429 (Too Many Requests / Rate Limit)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 206,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed').mockResolvedValue(undefined);

    // HTTP 429 without error code in body
    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockImplementationOnce(async () => {
      return new Response('Too Many Requests', { status: 429 });
    });

    await flushScrobbleQueue();

    expect(markFailedSpy).toHaveBeenCalledWith(206);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('retries scrobbles on HTTP 500 (Internal Server Error)', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 207,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed').mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockImplementationOnce(async () => {
      return new Response('Internal Server Error', { status: 500 });
    });

    await flushScrobbleQueue();

    expect(markFailedSpy).toHaveBeenCalledWith(207);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('retries scrobbles on network timeout / fetch connection error', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const mockItem = {
      id: 208,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song',
      artistNames: 'Artist',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([mockItem])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent');
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed').mockResolvedValue(undefined);

    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockImplementationOnce(async () => {
      throw new Error('ETIMEDOUT');
    });

    await flushScrobbleQueue();

    expect(markFailedSpy).toHaveBeenCalledWith(208);
    expect(markSentSpy).not.toHaveBeenCalled();
  });

  it('coalesces concurrent flush requests: triggers while flushing re-run cycle to process newly inserted items', async () => {
    const nowSecs = Math.floor(Date.now() / 1000) - 300;
    const itemBatch1 = {
      id: 301,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song 1',
      artistNames: 'Artist 1',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const itemBatch2 = {
      id: 302,
      songId: 1,
      startTimeSecs: nowSecs,
      operationType: 'scrobble',
      trackTitle: 'Song 2',
      artistNames: 'Artist 2',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);

    // First cycle claims batch 1, then ends. Second cycle (coalesced) claims batch 2.
    const claimSpy = vi
      .spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([itemBatch1])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([itemBatch2])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent').mockResolvedValue(undefined);

    // When item 301 is being sent, a second flush trigger arrives (e.g. from live scrobble or favorite)
    let triggered = false;
    vi.spyOn(lastFmUtils, 'fetchWithTimeout').mockImplementation(async () => {
      if (!triggered) {
        triggered = true;
        flushScrobbleQueue();
      }

      return new Response(
        JSON.stringify({
          scrobbles: {
            scrobble: { track: { '#text': 'Song' } },
            '@attr': { accepted: 1, ignored: 0 }
          }
        }),
        { status: 200 }
      );
    });

    await flushScrobbleQueue();

    // Both items from batch 1 and batch 2 must be claimed and sent
    expect(markSentSpy).toHaveBeenCalledWith(301);
    expect(markSentSpy).toHaveBeenCalledWith(302);
    expect(claimSpy).toHaveBeenCalledTimes(4);
  });

  it('successfully flushes listenbrainz.scrobble queue items and marks them sent', async () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const item = {
      id: 401,
      songId: 1,
      startTimeSecs: nowSecs - 100,
      operationType: 'listenbrainz.scrobble',
      trackTitle: 'Comfortably Numb',
      artistNames: 'Pink Floyd',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch')
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([]);

    const markSentSpy = vi.spyOn(scrobbleQueueQueries, 'markSent').mockResolvedValue(undefined);

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    globalThis.fetch = mockFetch;

    await flushScrobbleQueue();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('submit-listens'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Token test_lb_token',
          'Content-Type': 'application/json'
        })
      })
    );
    expect(markSentSpy).toHaveBeenCalledWith(401);
  });

  it('halts flush cycle and resets in-flight items on ListenBrainz 401 Unauthorized', async () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const item1 = {
      id: 402,
      songId: 1,
      startTimeSecs: nowSecs - 100,
      operationType: 'listenbrainz.scrobble',
      trackTitle: 'Time',
      artistNames: 'Pink Floyd',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const item2 = {
      id: 403,
      songId: 1,
      startTimeSecs: nowSecs - 50,
      operationType: 'listenbrainz.scrobble',
      trackTitle: 'Money',
      artistNames: 'Pink Floyd',
      status: 'pending' as const,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(scrobbleQueueQueries, 'resetStuckSending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'deleteOldPending').mockResolvedValue(undefined);
    vi.spyOn(scrobbleQueueQueries, 'claimPendingBatch').mockResolvedValueOnce([item1, item2]);

    const resetSpy = vi
      .spyOn(scrobbleQueueQueries, 'resetSendingToPending')
      .mockResolvedValue(undefined);
    const markFailedSpy = vi.spyOn(scrobbleQueueQueries, 'markFailed').mockResolvedValue(undefined);

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    globalThis.fetch = mockFetch;

    await flushScrobbleQueue();

    expect(resetSpy).toHaveBeenCalledWith([402, 403]);
    expect(markFailedSpy).not.toHaveBeenCalled();
  });
});
