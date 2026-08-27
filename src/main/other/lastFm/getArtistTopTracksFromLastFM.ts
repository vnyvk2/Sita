import logger from '../../logger';
import { checkIfConnectedToInternet } from '../../main';
import { LASTFM_BASE_URL } from './lastFmUtils';

export interface LastFmTopTrack {
  name: string;
  playcount: string;
  listeners: string;
  url: string;
  artist: {
    name: string;
    mbid?: string;
    url: string;
  };
  image?: Array<{
    '#text': string;
    size: string;
  }>;
}

export interface LastFmTopTracksResponse {
  toptracks?: {
    track: LastFmTopTrack[];
  };
  error?: number;
  message?: string;
}

const getArtistTopTracksFromLastFM = async (artistName: string, limit = 10): Promise<LastFmTopTrack[]> => {
  const isConnectedToInternet = checkIfConnectedToInternet();
  if (!isConnectedToInternet) {
    return [];
  }

  const LAST_FM_API_KEY = import.meta.env.MAIN_VITE_LAST_FM_API_KEY;
  if (typeof LAST_FM_API_KEY !== 'string' || !LAST_FM_API_KEY) {
    logger.warn('LAST_FM_API_KEY not found when fetching top tracks.');
    return [];
  }

  try {
    const url = new URL(LASTFM_BASE_URL);
    url.searchParams.set('method', 'artist.gettoptracks');
    url.searchParams.set('format', 'json');
    url.searchParams.set('autocorrect', '1');
    url.searchParams.set('artist', artistName.trim());
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('api_key', LAST_FM_API_KEY);

    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`Failed to fetch artist top tracks from LastFM: ${artistName}`, {
        status: res.status,
        statusText: res.statusText
      });
      return [];
    }

    const data = (await res.json()) as LastFmTopTracksResponse;
    if (data.error || !data.toptracks?.track) {
      return [];
    }

    const tracks = Array.isArray(data.toptracks.track)
      ? data.toptracks.track
      : [data.toptracks.track];

    return tracks;
  } catch (error) {
    logger.warn(`Error fetching artist top tracks from LastFM: ${artistName}`, { error });
    return [];
  }
};

export default getArtistTopTracksFromLastFM;
