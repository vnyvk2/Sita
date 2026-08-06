import { HttpError } from '@main/platform/networking/FetchHttpClient';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import type {
  MusicBrainzArtistDto,
  MusicBrainzRecordingDto,
  MusicBrainzRecordingSearchResultDto,
  MusicBrainzReleaseDto
} from './dto';

export interface MusicBrainzApiClientOptions {
  baseUrl?: string;
  userAgent?: string;
}

export interface MusicBrainzReleaseSearchResultDto {
  created?: string;
  count?: number;
  offset?: number;
  releases?: MusicBrainzReleaseDto[];
}

export class MusicBrainzApiClient {
  private readonly pipeline: RequestPipeline;
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(pipeline: RequestPipeline, options?: MusicBrainzApiClientOptions) {
    this.pipeline = pipeline;
    this.baseUrl = (options?.baseUrl ?? 'https://musicbrainz.org/ws/2').replace(/\/$/, '');
    this.userAgent =
      options?.userAgent ?? 'NoraMusicPlayer/4.0.0 (https://github.com/vnyvk2/Nora)';
  }

  public async searchRecordings(
    query: string,
    limit = 10
  ): Promise<MusicBrainzRecordingDto[]> {
    const url = `${this.baseUrl}/recording`;
    const response = await this.pipeline.execute<MusicBrainzRecordingSearchResultDto>({
      url,
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json'
      },
      params: {
        query,
        limit,
        fmt: 'json'
      }
    });

    return response.data.recordings ?? [];
  }

  public async searchReleases(
    query: string,
    limit = 10
  ): Promise<MusicBrainzReleaseDto[]> {
    const url = `${this.baseUrl}/release`;
    const response = await this.pipeline.execute<MusicBrainzReleaseSearchResultDto>({
      url,
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json'
      },
      params: {
        query,
        limit,
        fmt: 'json'
      }
    });

    return response.data.releases ?? [];
  }

  public async getRecordingById(mbid: string): Promise<MusicBrainzRecordingDto | null> {
    const url = `${this.baseUrl}/recording/${encodeURIComponent(mbid)}`;
    try {
      const response = await this.pipeline.execute<MusicBrainzRecordingDto>({
        url,
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json'
        },
        params: {
          inc: 'artists releases tags genres isrcs',
          fmt: 'json'
        }
      });
      return response.data;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  public async getReleaseById(mbid: string): Promise<MusicBrainzReleaseDto | null> {
    const url = `${this.baseUrl}/release/${encodeURIComponent(mbid)}`;
    try {
      const response = await this.pipeline.execute<MusicBrainzReleaseDto>({
        url,
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json'
        },
        params: {
          inc: 'artists recordings release-groups media discids tags genres',
          fmt: 'json'
        }
      });
      return response.data;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  public async getArtistById(mbid: string): Promise<MusicBrainzArtistDto | null> {
    const url = `${this.baseUrl}/artist/${encodeURIComponent(mbid)}`;
    try {
      const response = await this.pipeline.execute<MusicBrainzArtistDto>({
        url,
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json'
        },
        params: {
          inc: 'aliases tags genres url-rels',
          fmt: 'json'
        }
      });
      return response.data;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }
}
