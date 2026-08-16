import { repository, version } from '../../../package.json';
import logger from '../logger';

export interface LrclibTrackInfoStructure {
  track_name: string;
  artist_name: string;
  album_name?: string;
  duration: string;
}

export interface LrclibLyrics {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

export type LrclibLyricsAPI =
  | LrclibLyrics
  | {
      statusCode: number;
      name: string;
      message: string;
    };

export type ParsedLrclibLyrics = {
  lrclibId: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  lyrics: string;
  lyricsType: LyricsTypes;
};
export const LRCLIB_BASE_URL = 'https://lrclib.net/';

export const parseLrclibResponseData = (
  data: LrclibLyricsAPI,
  lyricsType: LyricsTypes
): ParsedLrclibLyrics | undefined => {
  if ('statusCode' in data) return undefined;

  const lyricsArr: string[] = [];
  lyricsArr.push(`[re:Nora (https://github.com/Sandakan/Nora)]`);
  lyricsArr.push(`[ve:${version}]`);
  lyricsArr.push(`[ti:${data.trackName}]`);
  lyricsArr.push(`[ar:${data.artistName}]`);
  lyricsArr.push(`[al:${data.albumName}]`);
  lyricsArr.push(`[length:${Math.floor(data.duration / 60)}:${data.duration % 60}]`);
  lyricsArr.push(`[offset:0]`);
  // lyricsArr.push(`[lang:en]`);
  lyricsArr.push(`[copyright:Lyrics by Lrclib (${LRCLIB_BASE_URL})]`);
  lyricsArr.push(data.syncedLyrics || data.plainLyrics);

  const output: ParsedLrclibLyrics = {
    lrclibId: data.id,
    trackName: data.trackName,
    artistName: data.artistName,
    albumName: data.albumName,
    duration: data.duration,
    lyrics: lyricsArr.join('\n'),
    lyricsType: 'syncedLyrics' in data ? 'SYNCED' : 'UN_SYNCED'
  };

  if (lyricsType === 'SYNCED') {
    if ('syncedLyrics' in data && data.syncedLyrics) {
      output.lyrics = data.syncedLyrics;
      return output;
    }
    return undefined;
  }

  return output;
};

const fetchLyricsFromLrclib = async (
  trackInfo: LrclibTrackInfoStructure,
  lyricsType: LyricsTypes = 'ANY',
  abortSignal?: AbortSignal
): Promise<ParsedLrclibLyrics | undefined> => {
  const headers = new Headers();
  headers.append('User-Agent', `Nora ${version} (${repository.url})`);

  const url = new URL('/api/get', LRCLIB_BASE_URL);

  for (const [key, value] of Object.entries(trackInfo)) {
    if (typeof value === 'string') url.searchParams.set(key, value);
  }

  const queryMeta = {
    provider: 'lrclib',
    artist: trackInfo.artist_name,
    title: trackInfo.track_name,
    album: trackInfo.album_name
  };

  try {
    const res = await fetch(url, { headers, signal: abortSignal });
    if (res.ok) {
      const data = (await res.json()) as LrclibLyricsAPI;
      const lyrics = parseLrclibResponseData(data, lyricsType);

      return lyrics;
    }

    if (res.status === 404) {
      logger.debug(`No lyrics found on Lrclib (404 Not Found)`, {
        ...queryMeta,
        status: 404,
        statusText: res.statusText
      });
      return undefined;
    }

    logger.warn(`Lrclib request failed with HTTP ${res.status}`, {
      ...queryMeta,
      status: res.status,
      statusText: res.statusText
    });
    return undefined;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.debug(`Lrclib fetch request aborted`, queryMeta);
      return undefined;
    }
    logger.error('Failed to fetch lyrics from Lrclib due to network error', {
      error,
      ...queryMeta
    });
    return undefined;
  }
};

export default fetchLyricsFromLrclib;
