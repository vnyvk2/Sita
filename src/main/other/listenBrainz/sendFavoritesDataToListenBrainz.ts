import { insertScrobble } from '@main/db/queries/scrobble_queue';
import { getUserSettings } from '@main/db/queries/settings';
import { net } from 'electron';

import type {
  ListenBrainzFeedbackPayload,
  ListenBrainzLookupResponse
} from '../../../types/listen_brainz_api';
import logger from '../../logger';
import getListenBrainzAuthData from './getListenBrainzAuthData';
import {
  fetchWithTimeout,
  getListenBrainzUserAgent,
  LISTENBRAINZ_BASE_URL,
  LISTENBRAINZ_REQUEST_TIMEOUT_MS
} from './listenBrainzUtils';

export type ListenBrainzFeedbackMethod = 'love' | 'unlove';

export const resolveRecordingMbid = async (
  title: string,
  artist: string,
  userToken: string,
  signal?: AbortSignal
): Promise<string | null> => {
  try {
    const url = new URL(`${LISTENBRAINZ_BASE_URL}/metadata/lookup/`);
    url.searchParams.set('recording_name', title);
    url.searchParams.set('artist_name', artist);

    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Token ${userToken}`,
          'User-Agent': getListenBrainzUserAgent()
        }
      },
      LISTENBRAINZ_REQUEST_TIMEOUT_MS,
      signal
    );

    if (!res.ok) {
      logger.debug('ListenBrainz metadata lookup returned non-OK status', { status: res.status });
      return null;
    }

    const json: ListenBrainzLookupResponse = await res.json().catch(() => ({}));
    if (json.metadata?.recording_mbid) {
      const score = json.metadata.score ?? 1;
      if (score >= 0.8) {
        return json.metadata.recording_mbid;
      }
      logger.debug('ListenBrainz metadata lookup score below confidence threshold (0.8)', {
        score,
        title,
        artist
      });
      return null;
    }

    if (json.recordings && json.recordings.length > 0) {
      const topMatch = json.recordings[0];
      const score = topMatch.score ?? 1;
      if (score >= 0.8 && topMatch.recording_mbid) {
        return topMatch.recording_mbid;
      }
    }

    return null;
  } catch (error) {
    logger.debug('Error resolving MBID via ListenBrainz lookup', { error, title, artist });
    return null;
  }
};

export const postFeedbackToListenBrainz = async (
  userToken: string,
  recordingMbid: string,
  score: 1 | 0,
  signal?: AbortSignal
): Promise<void> => {
  const url = new URL(`${LISTENBRAINZ_BASE_URL}/feedback/recording-feedback`);
  const payload: ListenBrainzFeedbackPayload = {
    recording_mbid: recordingMbid,
    score
  };

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${userToken}`,
        'Content-Type': 'application/json',
        'User-Agent': getListenBrainzUserAgent()
      },
      body: JSON.stringify(payload)
    },
    LISTENBRAINZ_REQUEST_TIMEOUT_MS,
    signal
  );

  if (!res.ok) {
    throw new Error(`ListenBrainz feedback submission failed with status ${res.status}`);
  }
};

export const sendFavoritesDataToListenBrainz = async (
  method: ListenBrainzFeedbackMethod,
  title: string,
  artists: string[] = [],
  knownMbid?: string
): Promise<void> => {
  try {
    const { sendSongFavoritesDataToListenBrainz: isEnabled } = await getUserSettings();

    if (!isEnabled) {
      logger.debug('ListenBrainz favorites request ignored - disabled in settings');
      return;
    }

    const artistNames = artists.join(', ');
    const isConnected = typeof net !== 'undefined' ? net.isOnline() : true;

    if (!isConnected) {
      await insertScrobble({
        operationType: method === 'love' ? 'listenbrainz.love' : 'listenbrainz.unlove',
        trackTitle: title,
        artistNames
      });
      logger.debug('ListenBrainz favorite queued for later - offline', { method, title });
      return;
    }

    const authData = await getListenBrainzAuthData().catch(() => null);
    if (!authData?.userToken) {
      logger.debug('ListenBrainz favorites skipped - no auth token');
      return;
    }

    let mbid = knownMbid;
    if (!mbid) {
      mbid = (await resolveRecordingMbid(title, artistNames, authData.userToken)) || undefined;
    }

    if (!mbid) {
      logger.info('ListenBrainz favorite skipped - no matching MBID found for track', {
        title,
        artistNames
      });
      return;
    }

    const score: 1 | 0 = method === 'love' ? 1 : 0;
    await postFeedbackToListenBrainz(authData.userToken, mbid, score);
    logger.debug('ListenBrainz recording feedback successfully submitted', {
      method,
      title,
      mbid,
      score
    });
  } catch (error) {
    const artistNames = artists.join(', ');
    await insertScrobble({
      operationType: method === 'love' ? 'listenbrainz.love' : 'listenbrainz.unlove',
      trackTitle: title,
      artistNames
    }).catch(() => {});
    logger.error('Failed to send ListenBrainz favorites data, queued for retry', { error });
  }
};

export default sendFavoritesDataToListenBrainz;
