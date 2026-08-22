import { db } from '@main/db/db';
import { getArtistById } from '@main/db/queries/artists';
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
  private readonly deezerClient: DeezerApiClient;

  constructor(deezerClient?: DeezerApiClient) {
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
      const localAlbums = (localArtist?.albums ?? []).map((a) => a.album).filter(Boolean);
      const localSongs = (localArtist?.songs ?? []).map((s) => s.song).filter(Boolean);

      // Map normalized local album titles for fast lookup
      const localAlbumMap = new Map<string, { id: number; title: string }>();
      for (const alb of localAlbums) {
        if (alb?.title) {
          const norm = normalizeForMatching(alb.title);
          if (norm) localAlbumMap.set(norm, { id: alb.id, title: alb.title });
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

      // 2. Search Deezer for the artist
      const deezerArtist = await this.deezerClient.searchArtist(artistName);
      if (!deezerArtist) {
        logger.info(`[ArtistDiscographyService] No Deezer match found for artist: ${artistName}`);
        return fallbackPayload;
      }

      // 3. Fetch all Deezer albums for this artist
      const deezerAlbums = await this.deezerClient.getArtistAlbums(deezerArtist.id, 100);
      if (!deezerAlbums || deezerAlbums.length === 0) {
        return {
          ...fallbackPayload,
          deezerArtistId: deezerArtist.id
        };
      }

      // 4. Categorize and reconcile each release
      const albums: OnlineReleaseSummary[] = [];
      const singlesAndEPs: OnlineReleaseSummary[] = [];
      const compilationsAndLive: OnlineReleaseSummary[] = [];

      for (const release of deezerAlbums) {
        const summary = this.reconcileRelease(release, localAlbumMap, localSongs);
        const recordType = (release.record_type || 'album').toLowerCase();

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
        deezerArtistId: deezerArtist.id,
        albums,
        singlesAndEPs,
        compilationsAndLive,
        totalOnlineReleases: deezerAlbums.length
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

      // 2. Fetch tracks from Deezer
      const tracks = await this.deezerClient.getAlbumTracks(onlineAlbumId);

      return tracks.map((track, idx) => {
        const normTitle = normalizeForMatching(track.title || track.title_short);
        const localSongId = normTitle ? localSongMap.get(normTitle) : undefined;

        return {
          id: track.id,
          title: track.title || track.title_short,
          duration: track.duration,
          previewUrl: track.preview,
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
    release: DeezerAlbumDto,
    localAlbumMap: Map<string, { id: number; title: string }>,
    localSongs: Array<{ id: number; title: string }>
  ): OnlineReleaseSummary {
    const normTitle = normalizeForMatching(release.title);
    const matchedLocalAlbum = normTitle ? localAlbumMap.get(normTitle) : undefined;
    const trackCount = release.nb_tracks || 0;

    let inLibraryStatus: InLibraryStatus = 'discover';
    let localAlbumId: number | undefined = undefined;
    let matchedTrackCount = 0;
    let totalLocalTracks = 0;

    if (matchedLocalAlbum) {
      localAlbumId = matchedLocalAlbum.id;
      // Count local songs that share this album title
      inLibraryStatus = 'in_library';
      matchedTrackCount = trackCount;
      totalLocalTracks = trackCount;
    } else {
      // Check if any local song titles match the album title (e.g. single)
      const matchingSong = localSongs.find((s) => s.title && normalizeForMatching(s.title) === normTitle);
      if (matchingSong) {
        inLibraryStatus = 'partial';
        matchedTrackCount = 1;
        totalLocalTracks = 1;
      }
    }

    return {
      id: release.id,
      title: release.title,
      releaseDate: release.release_date,
      recordType: release.record_type || 'album',
      coverMedium: release.cover_medium || release.cover_big || release.cover,
      coverXl: release.cover_xl || release.cover_big || release.cover_medium || release.cover,
      trackCount: release.nb_tracks || 0,
      explicitLyrics: Boolean(release.explicit_lyrics),
      inLibraryStatus,
      localAlbumId,
      matchedTrackCount,
      totalLocalTracks
    };
  }
}

export const artistDiscographyService = new ArtistDiscographyService();
