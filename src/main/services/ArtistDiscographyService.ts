import { getAlbumById, getAllAlbums } from '@main/db/queries/albums';
import { getArtistById } from '@main/db/queries/artists';
import { ITunesApiClient, type ITunesAlbumDto } from '@main/platform/networking/ITunesApiClient';
import { DeezerApiClient, type DeezerAlbumDto } from '@main/platform/networking/DeezerApiClient';
import { normalizeForMatching } from '@main/metadata/matching/normalizeForMatching';
import type {
  ArtistDiscographyPayload,
  InLibraryStatus,
  OnlineReleaseSummary,
  OnlineTrackDetail
} from '../../types/artist_discography';
import logger from '../logger';

export class ArtistDiscographyService {
  private readonly itunesClient: ITunesApiClient;
  private readonly deezerClient: DeezerApiClient;

  constructor(itunesClient?: ITunesApiClient, deezerClient?: DeezerApiClient) {
    this.itunesClient = itunesClient ?? new ITunesApiClient();
    this.deezerClient = deezerClient ?? new DeezerApiClient();
  }

  /**
   * Resolves the full online discography for an artist and reconciles each release
   * against the local music library.
   */
  public async getDiscography(artistId: number, artistName: string): Promise<ArtistDiscographyPayload> {
    logger.debug(`[ArtistDiscographyService] Resolving discography for artist: ${artistName} (ID: ${artistId})`);

    const fallbackPayload: ArtistDiscographyPayload = {
      artistId,
      artistName,
      albums: [],
      singlesAndEPs: [],
      compilationsAndLive: [],
      totalOnlineReleases: 0
    };

    try {
      // 1. Fetch local artist data (albums and songs)
      const localArtist = await getArtistById(artistId);
      const localAlbumIds = (localArtist?.albums ?? []).map((a) => a.album?.id).filter((id): id is number => typeof id === 'number');
      const localSongs = (localArtist?.songs ?? []).map((s) => s.song).filter(Boolean);

      // Fetch full album records to know the exact song count of each local album
      const localAlbumsData = localAlbumIds.length > 0
        ? (await getAllAlbums({ albumIds: localAlbumIds })).data
        : [];

      // Map normalized local album titles for fast lookup
      const localAlbumMap = new Map<
        string,
        { id: number; title: string; songs: Array<{ id: number; title: string }> }
      >();
      for (const alb of localAlbumsData) {
        if (alb?.title) {
          const norm = normalizeForMatching(alb.title);
          const albumSongs = (alb.songs ?? []).map((s) => s.song).filter(Boolean);
          if (norm) localAlbumMap.set(norm, { id: alb.id, title: alb.title, songs: albumSongs });
        }
      }

      // Map normalized local song titles
      const localSongMap = new Map<string, number>();
      for (const s of localSongs) {
        if (s?.title) {
          const norm = normalizeForMatching(s.title);
          if (norm) localSongMap.set(norm, s.id);
        }
      }

      // 2. Fetch discography from iTunes first (global, free, no geo-block)
      let rawAlbums: Array<{
        id: number;
        title: string;
        releaseDate?: string;
        recordType: string;
        coverMedium: string;
        coverXl: string;
        trackCount: number;
        explicitLyrics: boolean;
      }> = [];

      try {
        const itunesAlbums = await this.itunesClient.getArtistAlbums(artistName, 100);
        if (itunesAlbums && itunesAlbums.length > 0) {
          rawAlbums = itunesAlbums.map((alb) => {
            const lowerTitle = (alb.collectionName || '').toLowerCase();
            let recordType = 'album';
            if (alb.trackCount === 1 || lowerTitle.includes(' - single') || lowerTitle.includes(' - ep')) {
              recordType = 'single';
            } else if (lowerTitle.includes('best of') || lowerTitle.includes('greatest hits') || lowerTitle.includes('soundtrack')) {
              recordType = 'compile';
            }

            return {
              id: alb.collectionId,
              title: alb.collectionName,
              releaseDate: alb.releaseDate ? alb.releaseDate.split('T')[0] : undefined,
              recordType,
              coverMedium: alb.artworkUrl600 || alb.artworkUrl100,
              coverXl: alb.artworkUrl600 || alb.artworkUrl100,
              trackCount: alb.trackCount || 1,
              explicitLyrics: alb.collectionExplicitness === 'explicit'
            };
          });
        }
      } catch (err) {
        logger.warn(`[ArtistDiscographyService] iTunes album fetch failed for ${artistName}`, { error: err });
      }

      // 3. Fallback to Deezer if iTunes returned 0
      if (rawAlbums.length === 0) {
        try {
          const deezerArtist = await this.deezerClient.searchArtist(artistName);
          if (deezerArtist) {
            const deezerAlbums = await this.deezerClient.getArtistAlbums(deezerArtist.id, 100);
            if (deezerAlbums && deezerAlbums.length > 0) {
              rawAlbums = deezerAlbums.map((d) => ({
                id: d.id,
                title: d.title,
                releaseDate: d.release_date,
                recordType: d.record_type || 'album',
                coverMedium: d.cover_medium || d.cover_big || d.cover,
                coverXl: d.cover_xl || d.cover_big || d.cover,
                trackCount: d.nb_tracks || 1,
                explicitLyrics: Boolean(d.explicit_lyrics)
              }));
            }
          }
        } catch (err) {
          logger.warn(`[ArtistDiscographyService] Deezer album fetch fallback failed for ${artistName}`, { error: err });
        }
      }

      if (rawAlbums.length === 0) {
        return fallbackPayload;
      }

      // 4. Categorize and reconcile each release against local library
      const albums: OnlineReleaseSummary[] = [];
      const singlesAndEPs: OnlineReleaseSummary[] = [];
      const compilationsAndLive: OnlineReleaseSummary[] = [];

      for (const release of rawAlbums) {
        const summary = this.reconcileRelease(release, localAlbumMap, localSongMap);
        const recordType = (release.recordType || 'album').toLowerCase();

        if (recordType === 'album') {
          albums.push(summary);
        } else if (recordType === 'single' || recordType === 'ep') {
          singlesAndEPs.push(summary);
        } else {
          compilationsAndLive.push(summary);
        }
      }

      // Sort by release date descending
      const sortByDate = (a: OnlineReleaseSummary, b: OnlineReleaseSummary) => {
        const dateA = a.releaseDate || '';
        const dateB = b.releaseDate || '';
        return dateB.localeCompare(dateA);
      };

      albums.sort(sortByDate);
      singlesAndEPs.sort(sortByDate);
      compilationsAndLive.sort(sortByDate);

      return {
        artistId,
        artistName,
        albums,
        singlesAndEPs,
        compilationsAndLive,
        totalOnlineReleases: rawAlbums.length
      };
    } catch (err) {
      logger.error(`[ArtistDiscographyService] Failed to resolve discography for ${artistName}`, { error: err });
      return fallbackPayload;
    }
  }

  /**
   * Fetches tracklist for an online album and determines local library availability for each track.
   */
  public async getAlbumTracks(onlineAlbumId: number, artistId: number): Promise<OnlineTrackDetail[]> {
    try {
      // 1. Fetch local songs for this artist
      const localArtist = await getArtistById(artistId);
      const localSongs = (localArtist?.songs ?? []).map((s) => s.song).filter(Boolean);

      const localSongMap = new Map<string, number>();
      for (const s of localSongs) {
        if (s?.title) {
          const norm = normalizeForMatching(s.title);
          if (norm) localSongMap.set(norm, s.id);
        }
      }

      // 2. Fetch tracks from iTunes lookup first
      let tracks: Array<{
        id: number;
        title: string;
        duration: number;
        previewUrl?: string;
      }> = [];

      try {
        const itunesTracks = await this.itunesClient.getAlbumTracks(onlineAlbumId);
        if (itunesTracks && itunesTracks.length > 0) {
          tracks = itunesTracks.map((t) => ({
            id: t.trackId,
            title: t.trackName,
            duration: Math.round((t.trackTimeMillis || 0) / 1000),
            previewUrl: t.previewUrl
          }));
        }
      } catch {
        // ignore
      }

      // 3. Fallback to Deezer lookup if iTunes had no results
      if (tracks.length === 0) {
        try {
          const deezerTracks = await this.deezerClient.getAlbumTracks(onlineAlbumId);
          if (deezerTracks && deezerTracks.length > 0) {
            tracks = deezerTracks.map((t) => ({
              id: t.id,
              title: t.title || t.title_short,
              duration: t.duration,
              previewUrl: t.preview
            }));
          }
        } catch {
          // ignore
        }
      }

      return tracks.map((track, idx) => {
        const normTitle = normalizeForMatching(track.title);
        const localSongId = normTitle ? localSongMap.get(normTitle) : undefined;

        return {
          id: track.id,
          title: track.title,
          duration: track.duration,
          previewUrl: track.previewUrl,
          trackPosition: idx + 1,
          localSongId,
          isInLibrary: localSongId !== undefined
        };
      });
    } catch (err) {
      logger.error(`[ArtistDiscographyService] Failed to fetch album tracks for ${onlineAlbumId}`, { error: err });
      return [];
    }
  }

  private reconcileRelease(
    release: {
      id: number;
      title: string;
      releaseDate?: string;
      recordType: string;
      coverMedium: string;
      coverXl: string;
      trackCount: number;
      explicitLyrics: boolean;
    },
    localAlbumMap: Map<string, { id: number; title: string; songs: Array<{ id: number; title: string }> }>,
    localSongMap: Map<string, number>
  ): OnlineReleaseSummary {
    const normTitle = normalizeForMatching(release.title);
    const cleanSingleTitle = release.title.replace(/\s*-\s*(single|ep)\s*$/i, '').trim();
    const normCleanSingleTitle = normalizeForMatching(cleanSingleTitle);

    const matchedLocalAlbum = (normTitle ? localAlbumMap.get(normTitle) : undefined) ??
      (normCleanSingleTitle ? localAlbumMap.get(normCleanSingleTitle) : undefined);

    const trackCount = release.trackCount || 0;
    const recordType = (release.recordType || 'album').toLowerCase();

    let inLibraryStatus: InLibraryStatus = 'discover';
    let localAlbumId: number | undefined = undefined;
    let matchedTrackCount = 0;
    let totalLocalTracks = 0;

    if (matchedLocalAlbum) {
      localAlbumId = matchedLocalAlbum.id;
      const localAlbumSongs = matchedLocalAlbum.songs ?? [];
      totalLocalTracks = localAlbumSongs.length;

      if (trackCount > 0 && totalLocalTracks >= trackCount) {
        inLibraryStatus = 'in_library';
        matchedTrackCount = trackCount;
      } else if (totalLocalTracks > 0) {
        inLibraryStatus = 'partial';
        matchedTrackCount = Math.min(totalLocalTracks, trackCount || totalLocalTracks);
      } else {
        inLibraryStatus = 'discover';
        matchedTrackCount = 0;
      }
    } else if (recordType === 'single') {
      const isSongMatch = (normCleanSingleTitle && localSongMap.has(normCleanSingleTitle)) ||
        (normTitle && localSongMap.has(normTitle));
      if (isSongMatch) {
        inLibraryStatus = trackCount <= 1 ? 'in_library' : 'partial';
        matchedTrackCount = 1;
        totalLocalTracks = 1;
      }
    }

    return {
      id: release.id,
      title: release.title,
      releaseDate: release.releaseDate,
      recordType: release.recordType,
      coverMedium: release.coverMedium,
      coverXl: release.coverXl,
      trackCount: release.trackCount,
      explicitLyrics: release.explicitLyrics,
      inLibraryStatus,
      localAlbumId,
      matchedTrackCount,
      totalLocalTracks
    };
  }
}

export const artistDiscographyService = new ArtistDiscographyService();
