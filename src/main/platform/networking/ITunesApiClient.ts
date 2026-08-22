import { HttpError } from './FetchHttpClient';
import { RequestPipeline } from './RequestPipeline';
import logger from '../../logger';

export const ITUNES_BASE_URL = 'https://itunes.apple.com';

export interface ITunesAlbumDto {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artistId?: number;
  artworkUrl100: string;
  artworkUrl600?: string;
  trackCount: number;
  releaseDate?: string;
  collectionPrice?: number;
  collectionExplicitness?: string;
  primaryGenreName?: string;
  wrapperType: string;
  collectionType?: string;
}

export interface ITunesTrackDto {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  collectionId?: number;
  artworkUrl100?: string;
  artworkUrl600?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  trackNumber?: number;
  discNumber?: number;
  trackExplicitness?: string;
  wrapperType: string;
}

export interface ITunesSearchResponse<T> {
  resultCount: number;
  results: T[];
}

export class ITunesApiClient {
  private readonly pipeline: RequestPipeline;
  private readonly baseUrl: string;

  constructor(pipeline?: RequestPipeline, baseUrl: string = ITUNES_BASE_URL) {
    this.pipeline = pipeline ?? new RequestPipeline();
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Search for all albums by an artist name.
   */
  public async getArtistAlbums(
    artistName: string,
    limit = 100,
    signal?: AbortSignal
  ): Promise<ITunesAlbumDto[]> {
    const trimmed = artistName.trim();
    if (!trimmed) return [];

    const url = `${this.baseUrl}/search`;
    try {
      const response = await this.pipeline.execute<ITunesSearchResponse<ITunesAlbumDto>>({
        url,
        method: 'GET',
        params: {
          term: trimmed,
          entity: 'album',
          limit
        },
        signal
      });

      const results = response.data?.results ?? [];
      return results.map((alb) => ({
        ...alb,
        artworkUrl600: alb.artworkUrl100?.replace('100x100bb', '600x600bb')
      }));
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return [];
      }
      logger.warn(`[ITunesApiClient] Failed to search albums for: ${artistName}`, { error: err });
      return [];
    }
  }

  /**
   * Lookup tracklist with 30s previews for a specific album by collectionId.
   */
  public async getAlbumTracks(
    collectionId: number,
    signal?: AbortSignal
  ): Promise<ITunesTrackDto[]> {
    if (!collectionId || collectionId <= 0) return [];

    const url = `${this.baseUrl}/lookup`;
    try {
      const response = await this.pipeline.execute<ITunesSearchResponse<ITunesTrackDto>>({
        url,
        method: 'GET',
        params: {
          id: collectionId,
          entity: 'song'
        },
        signal
      });

      const results = response.data?.results ?? [];
      // The first result is often the collection itself (wrapperType: 'collection'), so filter for 'track'
      return results.filter((r) => r.wrapperType === 'track');
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return [];
      }
      logger.warn(`[ITunesApiClient] Failed to lookup tracks for collection ID: ${collectionId}`, { error: err });
      return [];
    }
  }

  /**
   * Get top / popular songs for an artist.
   */
  public async getArtistTopTracks(
    artistName: string,
    limit = 10,
    signal?: AbortSignal
  ): Promise<ITunesTrackDto[]> {
    const trimmed = artistName.trim();
    if (!trimmed) return [];

    const url = `${this.baseUrl}/search`;
    try {
      const response = await this.pipeline.execute<ITunesSearchResponse<ITunesTrackDto>>({
        url,
        method: 'GET',
        params: {
          term: trimmed,
          entity: 'song',
          limit
        },
        signal
      });

      const results = response.data?.results ?? [];
      return results
        .filter((r) => r.wrapperType === 'track')
        .map((track) => ({
          ...track,
          artworkUrl600: track.artworkUrl100?.replace('100x100bb', '600x600bb')
        }));
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return [];
      }
      logger.warn(`[ITunesApiClient] Failed to search top tracks for: ${artistName}`, { error: err });
      return [];
    }
  }
}
