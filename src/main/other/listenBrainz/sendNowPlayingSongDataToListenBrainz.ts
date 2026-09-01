import { getUserSettings } from '@main/db/queries/settings';
import { getSongById } from '@main/db/queries/songs';
import { convertToSongData } from '@main/utils/convert';
import { net } from 'electron';

import type { ListenBrainzSubmitListensPayload } from '../../../types/listen_brainz_api';
import logger from '../../logger';
import getListenBrainzAuthData from './getListenBrainzAuthData';
import {
  fetchWithTimeout,
  getListenBrainzUserAgent,
  LISTENBRAINZ_BASE_URL,
  LISTENBRAINZ_REQUEST_TIMEOUT_MS
} from './listenBrainzUtils';

export const sendNowPlayingSongDataToListenBrainz = async (songId: number): Promise<void> => {
  try {
    const { sendNowPlayingSongDataToListenBrainz: isEnabled } = await getUserSettings();

    if (!isEnabled) {
      logger.debug('ListenBrainz now playing request ignored - disabled in settings');
      return;
    }

    if (typeof net !== 'undefined' && !net.isOnline()) {
      logger.debug('ListenBrainz now playing skipped - offline', { songId });
      return;
    }

    const songData = await getSongById(songId).catch(() => null);
    if (!songData) {
      logger.warn('ListenBrainz now playing skipped - song not found', { songId });
      return;
    }

    const song = convertToSongData(songData);
    const authData = await getListenBrainzAuthData().catch(() => null);
    if (!authData?.userToken) {
      logger.debug('ListenBrainz now playing skipped - no auth token');
      return;
    }

    const artistName = song.artists?.map((artist) => artist.name).join(', ') || '';
    const trackName = song.title || '';

    const payload: ListenBrainzSubmitListensPayload = {
      listen_type: 'playing_now',
      payload: [
        {
          track_metadata: {
            artist_name: artistName,
            track_name: trackName,
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
      logger.debug('ListenBrainz now playing accepted', { songId });
    } else {
      logger.warn('ListenBrainz now playing API returned non-OK status', {
        status: res.status,
        songId
      });
    }
  } catch (error) {
    logger.error('Exception during ListenBrainz now playing submission', { error, songId });
  }
};

export default sendNowPlayingSongDataToListenBrainz;
