import { insertScrobble } from '@main/db/queries/scrobble_queue';
import { getUserSettings } from '@main/db/queries/settings';
import { getSongById } from '@main/db/queries/songs';
import { convertToSongData } from '@main/utils/convert';
import { net } from 'electron';

import type { ListenBrainzSubmitListensPayload } from '../../../types/listen_brainz_api';
import logger from '../../logger';
import { flushScrobbleQueue } from '../lastFm/flushScrobbleQueue';
import getListenBrainzAuthData from './getListenBrainzAuthData';
import {
  fetchWithTimeout,
  getListenBrainzUserAgent,
  LISTENBRAINZ_BASE_URL,
  LISTENBRAINZ_REQUEST_TIMEOUT_MS
} from './listenBrainzUtils';

const queueListenBrainzScrobbleForRetry = async (
  songId: number,
  startTimeSecs: number,
  trackTitle: string,
  artistNames: string
): Promise<void> => {
  await insertScrobble({
    songId,
    startTimeSecs,
    operationType: 'listenbrainz.scrobble',
    trackTitle,
    artistNames
  });
};

export const scrobbleSongToListenBrainz = async (
  songId: number,
  startTimeSecs: number
): Promise<void> => {
  let fallbackTrack = '';
  let fallbackArtist = '';

  try {
    const { sendSongScrobblingDataToListenBrainz: isEnabled } = await getUserSettings();

    if (!isEnabled) {
      logger.debug('ListenBrainz scrobble ignored - disabled in settings');
      return;
    }

    const songData = await getSongById(songId).catch(() => null);
    if (!songData) {
      logger.warn('ListenBrainz scrobble skipped - song not found', { songId });
      return;
    }

    const song = convertToSongData(songData);
    fallbackTrack = song.title || '';
    fallbackArtist = song.artists?.map((a) => a.name).join(', ') || '';

    // Clamp clock skew to prevent future-dated 400 errors from ListenBrainz API
    const nowSecs = Math.floor(Date.now() / 1000);
    const listenedAt = Math.min(Math.floor(startTimeSecs), nowSecs);

    const isConnected = typeof net !== 'undefined' ? net.isOnline() : true;
    if (!isConnected) {
      await queueListenBrainzScrobbleForRetry(songId, listenedAt, fallbackTrack, fallbackArtist);
      logger.debug('ListenBrainz scrobble queued for retry - offline', { songId });
      return;
    }

    const authData = await getListenBrainzAuthData().catch(() => null);
    if (!authData?.userToken) {
      logger.warn('ListenBrainz scrobble skipped - no valid auth token');
      return;
    }

    const payload: ListenBrainzSubmitListensPayload = {
      listen_type: 'single',
      payload: [
        {
          listened_at: listenedAt,
          track_metadata: {
            artist_name: fallbackArtist,
            track_name: fallbackTrack,
            release_name: song.album?.name || undefined,
            additional_info: {
              media_player: 'Nora',
              submission_client: 'Nora',
              submission_client_version: getListenBrainzUserAgent()
                .split(' ')[0]
                .replace('Nora/', ''),
              duration_ms: Math.round(song.duration * 1000),
              tracknumber: song.trackNo ?? undefined,
              musicbrainz_recording_id: song.musicBrainzId || undefined
            }
          }
        }
      ]
    };

    const url = new URL(`${LISTENBRAINZ_BASE_URL}/submit-listens`);
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${authData.userToken}`,
          'Content-Type': 'application/json',
          'User-Agent': getListenBrainzUserAgent()
        },
        body: JSON.stringify(payload)
      },
      LISTENBRAINZ_REQUEST_TIMEOUT_MS
    );

    if (res.ok) {
      logger.debug('ListenBrainz scrobble successfully accepted', { songId });
      flushScrobbleQueue().catch((err) => {
        logger.error('Failed to flush scrobble queue after live ListenBrainz scrobble', { err });
      });
      return;
    }

    const isTransient = res.status >= 500 || res.status === 429;
    if (isTransient) {
      await queueListenBrainzScrobbleForRetry(songId, listenedAt, fallbackTrack, fallbackArtist);
      logger.warn('Transient failure submitting to ListenBrainz, queued for retry', {
        status: res.status,
        songId
      });
      return;
    }

    logger.error('Permanent failure submitting scrobble to ListenBrainz', {
      status: res.status,
      songId
    });
  } catch (error) {
    if (fallbackTrack && fallbackArtist) {
      const nowSecs = Math.floor(Date.now() / 1000);
      const listenedAt = Math.min(Math.floor(startTimeSecs), nowSecs);
      await queueListenBrainzScrobbleForRetry(
        songId,
        listenedAt,
        fallbackTrack,
        fallbackArtist
      ).catch(() => {});
    }
    logger.error('Failed to scrobble song to ListenBrainz, queued for retry', { error });
  }
};

export default scrobbleSongToListenBrainz;
