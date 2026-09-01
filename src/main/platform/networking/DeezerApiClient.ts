import type {
  DeezerAlbum,
  DeezerArtistInfo,
  DeezerArtistInfoApi,
  DeezerTrackResults
} from '../../../types/deezer_api';
import logger from '../../logger';
import { HttpError } from './FetchHttpClient';
import { RequestPipeline } from './RequestPipeline';

export const DEEZER_BASE_URL = 'https://api.deezer.com';

export interface DeezerAlbumDto extends DeezerAlbum {
  record_type?: 'album' | 'single' | 'ep' | 'compile' | string;
  release_date?: string;
  nb_tracks?: number;
  explicit_lyrics?: boolean;
}

export interface DeezerAlbumResponse {
  data: DeezerAlbumDto[];
  total: number;
  next?: string;
}

export interface DeezerAlbumTracksResponse {
  data: DeezerTrackResults[];
  total: number;
}

export interface DeezerTopTracksResponse {
  data: DeezerTrackResults[];
  total: number;
}

export class DeezerApiClient {
  private readonly pipeline: RequestPipeline;
  private readonly baseUrl: string;

  constructor(pipeline?: RequestPipeline, baseUrl: string = DEEZER_BASE_URL) {
    this.pipeline = pipeline ?? new RequestPipeline();
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** Search for an artist by name. */
  public async searchArtist(
    artistName: string,
    signal?: AbortSignal
  ): Promise<DeezerArtistInfo | null> {
    const trimmed = artistName.trim();
    if (!trimmed) return null;

    const url = `${this.baseUrl}/search/artist`;
    try {
      const response = await this.pipeline.execute<DeezerArtistInfoApi>({
        url,
        method: 'GET',
        params: {
          q: trimmed,
          limit: 5
        },
        signal
      });

      const artists = response.data.data ?? [];
      if (artists.length === 0) return null;

      // Find exact or closest match
      const lower = trimmed.toLowerCase();
      const exactMatch = artists.find((a) => a.name.toLowerCase() === lower);
      return exactMatch ?? artists[0];
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return null;
      }
      logger.warn(`Failed to search artist on Deezer: ${artistName}`, { error: err });
      return null;
    }
  }

  /**
   * Get all albums, singles, EPs, and compilations for a Deezer artist ID, paginating through
   * results up to maxReleases (default 300).
   */
  public async getArtistAlbums(
    deezerArtistId: number,
    maxReleases = 300,
    signal?: AbortSignal
  ): Promise<DeezerAlbumDto[]> {
    if (!deezerArtistId || deezerArtistId <= 0) return [];

    const PAGE_LIMIT = 100;
    const allAlbums: DeezerAlbumDto[] = [];
    let currentIndex = 0;
    let hasMore = true;

    try {
      while (hasMore && allAlbums.length < maxReleases) {
        const pageSize = Math.min(PAGE_LIMIT, maxReleases - allAlbums.length);
        const url = `${this.baseUrl}/artist/${deezerArtistId}/albums`;

        const response = await this.pipeline.execute<DeezerAlbumResponse>({
          url,
          method: 'GET',
          params: {
            limit: pageSize,
            index: currentIndex
          },
          signal
        });

        const batch = response.data?.data ?? [];
        if (batch.length === 0) {
          break;
        }

        allAlbums.push(...batch);

        if (response.data?.next && allAlbums.length < (response.data.total ?? maxReleases)) {
          currentIndex += batch.length;
        } else {
          hasMore = false;
        }
      }

      return allAlbums;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return allAlbums;
      }
      logger.warn(`Failed to fetch albums for Deezer artist ID ${deezerArtistId}`, { error: err });
      return allAlbums;
    }
  }

  /** Get tracklist with 30s previews for a specific Deezer album. */
  public async getAlbumTracks(
    deezerAlbumId: number,
    signal?: AbortSignal
  ): Promise<DeezerTrackResults[]> {
    if (!deezerAlbumId || deezerAlbumId <= 0) return [];

    const url = `${this.baseUrl}/album/${deezerAlbumId}/tracks`;
    try {
      const response = await this.pipeline.execute<DeezerAlbumTracksResponse>({
        url,
        method: 'GET',
        params: {
          limit: 100
        },
        signal
      });

      return response.data.data ?? [];
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return [];
      }
      logger.warn(`Failed to fetch tracks for Deezer album ID ${deezerAlbumId}`, { error: err });
      return [];
    }
  }

  /** Get top / popular tracks for an artist. */
  public async getArtistTopTracks(
    deezerArtistId: number,
    limit = 10,
    signal?: AbortSignal
  ): Promise<DeezerTrackResults[]> {
    if (!deezerArtistId || deezerArtistId <= 0) return [];

    const url = `${this.baseUrl}/artist/${deezerArtistId}/top`;
    try {
      const response = await this.pipeline.execute<DeezerTopTracksResponse>({
        url,
        method: 'GET',
        params: {
          limit
        },
        signal
      });

      return response.data.data ?? [];
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return [];
      }
      logger.warn(`Failed to fetch top tracks for Deezer artist ID ${deezerArtistId}`, {
        error: err
      });
      return [];
    }
  }

  /** Get related artists for a Deezer artist ID. */
  public async getRelatedArtists(
    deezerArtistId: number,
    limit = 10,
    signal?: AbortSignal
  ): Promise<DeezerArtistInfo[]> {
    if (!deezerArtistId || deezerArtistId <= 0) return [];

    const url = `${this.baseUrl}/artist/${deezerArtistId}/related`;
    try {
      const response = await this.pipeline.execute<{ data: DeezerArtistInfo[]; total: number }>({
        url,
        method: 'GET',
        params: {
          limit
        },
        signal
      });

      return response.data.data ?? [];
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return [];
      }
      logger.warn(`Failed to fetch related artists for Deezer artist ID ${deezerArtistId}`, {
        error: err
      });
      return [];
    }
  }
}
