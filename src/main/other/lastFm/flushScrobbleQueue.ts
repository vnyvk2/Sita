import {
  claimPendingBatch,
  deleteOldPending,
  markFailed,
  markPermanentlyFailed,
  markSent,
  resetSendingToPending,
  resetStuckSending
} from '@main/db/queries/scrobble_queue';
import { getSongById } from '@main/db/queries/songs';
import type { scrobbleQueue } from '@main/db/schema';
import { convertToSongData } from '@main/utils/convert';
import { net } from 'electron';

import type { AuthData, LoveParams, ScrobbleParams } from '../../../types/last_fm_api';
import type { ListenBrainzSubmitListensPayload } from '../../../types/listen_brainz_api';
import logger from '../../logger';
import { sendMessageToRenderer } from '../../main';
import getListenBrainzAuthData, {
  type ListenBrainzAuthData
} from '../listenBrainz/getListenBrainzAuthData';
import {
  getCurrentListenBrainzGeneration,
  invalidateListenBrainzSession,
  setActiveListenBrainzAbortController
} from '../listenBrainz/listenBrainzSession';
import {
  fetchWithTimeout as fetchListenBrainzWithTimeout,
  getListenBrainzUserAgent,
  LISTENBRAINZ_BASE_URL,
  LISTENBRAINZ_REQUEST_TIMEOUT_MS
} from '../listenBrainz/listenBrainzUtils';
import {
  postFeedbackToListenBrainz,
  resolveRecordingMbid
} from '../listenBrainz/sendFavoritesDataToListenBrainz';
import type { LastFMApi } from './generateApiRequestBodyForLastFMPostRequests';
import generateApiRequestBodyForLastFMPostRequests from './generateApiRequestBodyForLastFMPostRequests';
import getLastFmAuthData from './getLastFMAuthData';
import { LASTFM_BASE_URL, LASTFM_REQUEST_TIMEOUT_MS, fetchWithTimeout } from './lastFmUtils';

const FLUSH_BATCH_SIZE = 5;
const BATCH_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 1500;
const FOURTEEN_DAYS_SECS = 14 * 86400;
const KNOWN_PERMANENT_IGNORED_CODES = new Set(['1', '2', '3', '4']);

export class LastFmAuthError extends Error {
  code: number;
  constructor(msg: string, code: number) {
    super(msg);
    this.name = 'LastFmAuthError';
    this.code = code;
  }
}

export class ListenBrainzAuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ListenBrainzAuthError';
  }
}

export class ListenBrainzTransientError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ListenBrainzTransientError';
  }
}

export class ListenBrainzPermanentError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ListenBrainzPermanentError';
  }
}

export class LastFmUnprocessableScrobbleError extends Error {
  code?: string;
  constructor(msg: string, code?: string) {
    super(msg);
    this.name = 'LastFmUnprocessableScrobbleError';
    this.code = code;
  }
}

export class LastFmTransientError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'LastFmTransientError';
  }
}

export class LastFmPermanentError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'LastFmPermanentError';
  }
}

let currentFlushGeneration = 0;
let activeAbortController: AbortController | null = null;

export function getCurrentLastFmGeneration(): number {
  return currentFlushGeneration;
}

export function invalidateLastFmSession(): void {
  currentFlushGeneration += 1;
  needsAnotherFlush = false;
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  logger.info(
    'Last.fm session invalidated: bumped flush generation and aborted active HTTP requests',
    {
      newGeneration: currentFlushGeneration
    }
  );
}

export function _resetFlushStateForTesting(): void {
  isFlushing = false;
  needsAnotherFlush = false;
  currentFlushGeneration = 0;
  if (activeAbortController) {
    activeAbortController = null;
  }
}

// Durable outbox state machine:
// pending ──(claimPendingBatch)──► sending
//                                     │
//                                     ├──(success / filtered / stale)──► [DELETED FROM DB via markSent]
//                                     ├──(auth error 4,9,14,15)────────► pending (resetSendingToPending)
//                                     ├──(transient failure / 429/5xx)─► pending (retryCount < 3 via markFailed)
//                                     └──(permanent / retry limit)─────► failed (pruned after 30d via deleteOldPending)
let isFlushing = false;
let needsAnotherFlush = false;

export async function flushScrobbleQueue(): Promise<void> {
  if (isFlushing) {
    needsAnotherFlush = true;
    return;
  }
  if (!net.isOnline()) return;

  isFlushing = true;
  needsAnotherFlush = false;

  try {
    do {
      needsAnotherFlush = false;
      await runFlushCycle();
    } while (needsAnotherFlush && net.isOnline());
  } finally {
    isFlushing = false;
    needsAnotherFlush = false;
  }
}

async function runFlushCycle(): Promise<void> {
  const lastFmGen = currentFlushGeneration;
  const lbGen = getCurrentListenBrainzGeneration();
  const abortController = new AbortController();
  activeAbortController = abortController;
  setActiveListenBrainzAbortController(abortController);

  try {
    const [authData, listenBrainzAuthData] = await Promise.all([
      getLastFmAuthData().catch(() => null),
      getListenBrainzAuthData().catch(() => null)
    ]);

    if (!authData && !listenBrainzAuthData) {
      logger.debug('Flush skipped - neither Last.fm nor ListenBrainz auth data available');
      return;
    }

    if (
      lastFmGen !== currentFlushGeneration ||
      lbGen !== getCurrentListenBrainzGeneration() ||
      abortController.signal.aborted
    ) {
      logger.warn('Flush generation mismatch or aborted before startup recovery, exiting');
      return;
    }

    await resetStuckSending();

    const url = new URL(LASTFM_BASE_URL);
    url.searchParams.set('format', 'json');

    await deleteOldPending();

    let items = await claimPendingBatch(FLUSH_BATCH_SIZE);

    while (items.length > 0) {
      if (!net.isOnline()) {
        logger.debug('Flush loop exiting - internet dropped during batch delay');
        return;
      }

      if (
        lastFmGen !== currentFlushGeneration ||
        lbGen !== getCurrentListenBrainzGeneration() ||
        abortController.signal.aborted
      ) {
        logger.warn('Flush generation mismatch or aborted, exiting flush loop immediately');
        return;
      }

      for (let i = 0; i < items.length; i += 1) {
        if (
          lastFmGen !== currentFlushGeneration ||
          lbGen !== getCurrentListenBrainzGeneration() ||
          abortController.signal.aborted
        ) {
          logger.warn(
            'Flush generation mismatch or aborted before processing item, exiting flush loop'
          );
          return;
        }

        const item = items[i];
        try {
          const result = await processItem(
            item,
            authData,
            listenBrainzAuthData,
            url,
            abortController.signal
          );

          if (
            lastFmGen !== currentFlushGeneration ||
            lbGen !== getCurrentListenBrainzGeneration() ||
            abortController.signal.aborted
          ) {
            logger.warn('Flush generation mismatch after processItem, dropping markSent');
            return;
          }

          await markSent(item.id);
          logger.debug('Flushed scrobble queue item', {
            id: item.id,
            type: item.operationType,
            result
          });
        } catch (error) {
          if (
            lastFmGen !== currentFlushGeneration ||
            lbGen !== getCurrentListenBrainzGeneration() ||
            abortController.signal.aborted
          ) {
            logger.warn(
              'Flush aborted during network request, halting without mutating queue item'
            );
            return;
          }

          if (error instanceof LastFmAuthError) {
            logger.warn('Last.fm session rejected during flush, halting flush cycle', {
              code: error.code,
              message: error.message
            });
            const remainingIds = items.slice(i).map((it) => it.id);
            await resetSendingToPending(remainingIds);
            return;
          }

          if (error instanceof ListenBrainzAuthError) {
            logger.warn('ListenBrainz session rejected during flush, halting flush cycle', {
              message: error.message
            });
            invalidateListenBrainzSession();
            const remainingIds = items.slice(i).map((it) => it.id);
            await resetSendingToPending(remainingIds);
            sendMessageToRenderer({ messageCode: 'LISTENBRAINZ_SESSION_INVALID' });
            return;
          }

          if (error instanceof LastFmUnprocessableScrobbleError) {
            logger.warn('Discarding unprocessable/ignored scrobble from queue', {
              id: item.id,
              code: error.code,
              message: error.message
            });
            await markSent(item.id);
            continue;
          }

          if (
            error instanceof LastFmPermanentError ||
            error instanceof ListenBrainzPermanentError
          ) {
            logger.error('Permanent failure on queue item, marking permanently failed', {
              id: item.id,
              error
            });
            await markPermanentlyFailed(item.id);
            continue;
          }

          // Transient error / network timeout / HTTP 429 / HTTP 5xx / DB connection issue
          logger.warn('Transient failure flushing scrobble queue item', { id: item.id, error });
          await markFailed(item.id);
        }
      }

      if (BATCH_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }

      if (
        lastFmGen !== currentFlushGeneration ||
        lbGen !== getCurrentListenBrainzGeneration() ||
        abortController.signal.aborted
      ) {
        logger.warn('Flush generation mismatch or aborted after batch delay, exiting');
        return;
      }

      items = await claimPendingBatch(FLUSH_BATCH_SIZE);
    }
  } catch (error) {
    if (
      abortController.signal.aborted ||
      lastFmGen !== currentFlushGeneration ||
      lbGen !== getCurrentListenBrainzGeneration()
    ) {
      logger.info('Flush cleanly aborted on session invalidation');
    } else {
      logger.error('Flush cycle failed unexpectedly', { error });
    }
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null;
      setActiveListenBrainzAbortController(null);
    }
  }
}

async function processItem(
  item: typeof scrobbleQueue.$inferSelect,
  authData: AuthData | null,
  listenBrainzAuthData: ListenBrainzAuthData | null,
  url: URL,
  signal?: AbortSignal
): Promise<'SENT' | 'DISCARDED_STALE'> {
  switch (item.operationType) {
    case 'scrobble': {
      if (!authData) {
        throw new LastFmAuthError('Last.fm not authenticated', 4);
      }

      if (item.startTimeSecs == null) {
        logger.warn('Missing scrobble timestamp in queue item, dropping', { id: item.id });
        return 'DISCARDED_STALE';
      }

      // Last.fm rejects timestamps older than 14 days
      const nowSecs = Math.floor(Date.now() / 1000);
      if (item.startTimeSecs < nowSecs - FOURTEEN_DAYS_SECS) {
        logger.warn('Dropping stale scrobble older than 14 days', {
          id: item.id,
          startTimeSecs: item.startTimeSecs
        });
        return 'DISCARDED_STALE';
      }

      const songData = item.songId != null ? await getSongById(item.songId) : null;
      if (!songData) {
        if (!item.trackTitle || !item.artistNames) {
          logger.warn('Song not found and no fallback metadata available, dropping', {
            id: item.id
          });
          return 'DISCARDED_STALE';
        }
        const params: ScrobbleParams = {
          track: item.trackTitle,
          artist: item.artistNames,
          timestamp: item.startTimeSecs
        };
        await postToLastFm(url, authData, 'track.scrobble', params, signal);
        return 'SENT';
      }
      const song = convertToSongData(songData);
      const params: ScrobbleParams = {
        track: song.title,
        artist: song.artists?.map((a) => a.name).join(', ') || '',
        timestamp: item.startTimeSecs,
        album: song.album?.name,
        albumArtist: song?.albumArtists?.map((a) => a.name).join(', '),
        trackNumber: song.trackNo,
        duration: Math.ceil(song.duration)
      };
      await postToLastFm(url, authData, 'track.scrobble', params, signal);
      return 'SENT';
    }

    case 'track.love':
    case 'track.unlove': {
      if (!authData) {
        throw new LastFmAuthError('Last.fm not authenticated', 4);
      }
      const params: LoveParams = {
        track: item.trackTitle || '',
        artist: item.artistNames || ''
      };
      await postToLastFm(url, authData, item.operationType, params, signal);
      return 'SENT';
    }

    case 'listenbrainz.scrobble': {
      if (!listenBrainzAuthData?.userToken) {
        throw new ListenBrainzAuthError('ListenBrainz not authenticated');
      }

      if (item.startTimeSecs == null) {
        logger.warn('Missing scrobble timestamp in ListenBrainz queue item, dropping', {
          id: item.id
        });
        return 'DISCARDED_STALE';
      }

      const nowSecs = Math.floor(Date.now() / 1000);
      const listenedAt = Math.min(item.startTimeSecs, nowSecs);

      const songData = item.songId != null ? await getSongById(item.songId) : null;
      let trackName = item.trackTitle || '';
      let artistName = item.artistNames || '';
      let releaseName: string | undefined;
      let durationMs: number | undefined;
      let trackNo: number | undefined;
      let mbid: string | undefined;

      if (songData) {
        const song = convertToSongData(songData);
        trackName = song.title || trackName;
        artistName = song.artists?.map((a) => a.name).join(', ') || artistName;
        releaseName = song.album?.name || undefined;
        durationMs = Math.round(song.duration * 1000);
        trackNo = song.trackNo ?? undefined;
        mbid = song.musicBrainzId || undefined;
      }

      if (!trackName || !artistName) {
        logger.warn('ListenBrainz scrobble missing required metadata, dropping', { id: item.id });
        return 'DISCARDED_STALE';
      }

      const payload: ListenBrainzSubmitListensPayload = {
        listen_type: 'single',
        payload: [
          {
            listened_at: listenedAt,
            track_metadata: {
              artist_name: artistName,
              track_name: trackName,
              release_name: releaseName,
              additional_info: {
                media_player: 'Nora',
                submission_client: 'Nora',
                submission_client_version: getListenBrainzUserAgent()
                  .split(' ')[0]
                  .replace('Nora/', ''),
                duration_ms: durationMs,
                tracknumber: trackNo,
                musicbrainz_recording_id: mbid
              }
            }
          }
        ]
      };

      const lbUrl = new URL(`${LISTENBRAINZ_BASE_URL}/submit-listens`);
      const res = await fetchListenBrainzWithTimeout(
        lbUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${listenBrainzAuthData.userToken}`,
            'Content-Type': 'application/json',
            'User-Agent': getListenBrainzUserAgent()
          },
          body: JSON.stringify(payload)
        },
        LISTENBRAINZ_REQUEST_TIMEOUT_MS,
        signal
      );

      if (res.ok) {
        return 'SENT';
      }

      if (res.status === 401) {
        throw new ListenBrainzAuthError('ListenBrainz session rejected (401)');
      }

      if (res.status === 429 || res.status >= 500) {
        throw new ListenBrainzTransientError(`ListenBrainz transient failure (${res.status})`);
      }

      throw new ListenBrainzPermanentError(`ListenBrainz permanent failure (${res.status})`);
    }

    case 'listenbrainz.love':
    case 'listenbrainz.unlove': {
      if (!listenBrainzAuthData?.userToken) {
        throw new ListenBrainzAuthError('ListenBrainz not authenticated');
      }

      const trackName = item.trackTitle || '';
      const artistName = item.artistNames || '';
      if (!trackName || !artistName) {
        return 'DISCARDED_STALE';
      }

      const songData =
        item.songId != null ? await getSongById(item.songId).catch(() => null) : null;
      let mbid = songData ? convertToSongData(songData).musicBrainzId : undefined;
      if (!mbid) {
        mbid =
          (await resolveRecordingMbid(
            trackName,
            artistName,
            listenBrainzAuthData.userToken,
            signal
          )) || undefined;
      }

      if (!mbid) {
        logger.info('Discarding unresolvable ListenBrainz feedback item', {
          id: item.id,
          trackName,
          artistName
        });
        return 'DISCARDED_STALE';
      }

      const score: 1 | 0 = item.operationType === 'listenbrainz.love' ? 1 : 0;
      try {
        await postFeedbackToListenBrainz(listenBrainzAuthData.userToken, mbid, score, signal);
        return 'SENT';
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new ListenBrainzTransientError(err instanceof Error ? err.message : String(err));
      }
    }

    default:
      logger.warn('Unknown operation type in queue, dropping', {
        id: item.id,
        type: item.operationType
      });
      return 'DISCARDED_STALE';
  }
}

async function postToLastFm<T extends LastFMApi['method']>(
  url: URL,
  authData: AuthData,
  method: T,
  params: Extract<LastFMApi, { method: T }>['params'],
  signal?: AbortSignal
): Promise<void> {
  const body = generateApiRequestBodyForLastFMPostRequests({
    method,
    authData,
    params
  } as LastFMApi);

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal
    },
    LASTFM_REQUEST_TIMEOUT_MS
  );

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  const hasError = !res.ok || ('error' in json && Boolean(json.error));
  if (!hasError) {
    if (method === 'track.scrobble') {
      const scrobbles = json?.scrobbles as
        | {
            scrobble?:
              | { ignoredMessage?: { code?: string | number; '#text'?: string } }
              | Array<{ ignoredMessage?: { code?: string | number; '#text'?: string } }>;
            '@attr'?: { accepted?: number | string; ignored?: number | string };
          }
        | undefined;

      const rawAccepted = scrobbles?.['@attr']?.accepted;
      if (rawAccepted === undefined || rawAccepted === null) {
        throw new LastFmPermanentError(
          'Malformed Last.fm response: missing scrobbles.@attr.accepted property'
        );
      }

      const accepted = Number(rawAccepted);
      if (Number.isNaN(accepted)) {
        throw new LastFmPermanentError(
          `Malformed Last.fm response: invalid @attr.accepted value (${String(rawAccepted)})`
        );
      }

      if (accepted >= 1) {
        return;
      }

      // accepted === 0: Track was ignored / filtered by Last.fm
      const scrobbleEntry = Array.isArray(scrobbles?.scrobble)
        ? scrobbles?.scrobble[0]
        : scrobbles?.scrobble;
      const ignoredMsg = scrobbleEntry?.ignoredMessage;
      const ignoredCode = ignoredMsg?.code != null ? String(ignoredMsg.code) : undefined;
      const ignoredText = ignoredMsg?.['#text'] || 'Scrobble ignored by Last.fm';

      if (ignoredCode === '5') {
        // Daily scrobble limit exceeded: transient failure to retry later
        throw new LastFmTransientError(`Daily scrobble limit exceeded: ${ignoredText}`);
      }

      // Whitelist known permanent filter codes:
      // 1 = Artist ignored, 2 = Track ignored, 3 = Timestamp too old, 4 = Timestamp too new
      if (ignoredCode && KNOWN_PERMANENT_IGNORED_CODES.has(ignoredCode)) {
        throw new LastFmUnprocessableScrobbleError(
          `Scrobble permanently rejected by Last.fm (code ${ignoredCode}): ${ignoredText}`,
          ignoredCode
        );
      }

      // Unknown/unrecognized ignored codes fail closed as permanent error
      throw new LastFmPermanentError(
        `Scrobble rejected with unrecognized ignored code (${ignoredCode ?? 'none'}): ${ignoredText}`
      );
    }
    return;
  }

  const errorCode = typeof json.error === 'number' ? json.error : undefined;
  const message =
    typeof json.message === 'string' ? json.message : `API returned HTTP ${res.status}`;

  // Error 4: Authentication Failed, 9: Invalid session key, 14: Token not authorized, 15: Token expired
  if (errorCode !== undefined && [4, 9, 14, 15].includes(errorCode)) {
    throw new LastFmAuthError(message, errorCode);
  }

  // Error 8: Operation failed, 11: Service offline, 16: Temporary error, 29: Rate limit exceeded
  // Also treat HTTP 429 (Too Many Requests) and HTTP 5xx (Server Errors) as transient
  const isTransient =
    res.status === 429 ||
    res.status >= 500 ||
    (errorCode !== undefined && [8, 11, 16, 29].includes(errorCode));

  if (isTransient) {
    throw new LastFmTransientError(message);
  }

  // Any other error (e.g. Error 13: Invalid method signature, Error 6: Invalid parameters) is permanent
  throw new LastFmPermanentError(message);
}
