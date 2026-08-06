import type { RequestPipeline } from '../../../platform/networking/RequestPipeline';

export interface DiscogsSearchReleaseDto {
  id: number;
  title: string;
  year?: string;
  genre?: string[];
  style?: string[];
  catno?: string;
  master_id?: number;
  thumb?: string;
  cover_image?: string;
  resource_url?: string;
}

export interface DiscogsReleaseDetailsDto {
  id: number;
  title: string;
  artists?: Array<{ name: string }>;
  year?: number;
  genres?: string[];
  styles?: string[];
  labels?: Array<{ catno?: string; name?: string }>;
  master_id?: number;
  images?: Array<{ uri: string; type: string }>;
  tracklist?: Array<{
    position: string;
    title: string;
    duration?: string;
  }>;
}

export interface DiscogsContributionData {
  genre?: string;
  style?: string;
  catalogNumber?: string;
  masterRelease?: string;
}

export class DiscogsApiClient {
  private readonly baseUrl = 'https://api.discogs.com';
  private readonly pipeline: RequestPipeline;

  constructor(pipeline: RequestPipeline) {
    this.pipeline = pipeline;
  }

  public async searchReleases(query: string, limit = 10): Promise<DiscogsSearchReleaseDto[]> {
    if (!query || query.trim().length === 0) return [];

    const url = `${this.baseUrl}/database/search?q=${encodeURIComponent(query)}&type=release&per_page=${limit}`;

    try {
      const response = await this.pipeline.execute<{ results?: DiscogsSearchReleaseDto[] }>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      return response.data?.results ?? [];
    } catch {
      return [];
    }
  }

  public async getReleaseById(id: string | number): Promise<DiscogsReleaseDetailsDto | null> {
    if (!id) return null;

    const url = `${this.baseUrl}/releases/${id}`;

    try {
      const response = await this.pipeline.execute<DiscogsReleaseDetailsDto>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  public async fetchContributionData(query: { title?: string; artist?: string }): Promise<DiscogsContributionData | null> {
    const qStr = [query.title, query.artist].filter(Boolean).join(' ');
    if (!qStr) return null;

    const results = await this.searchReleases(qStr, 1);
    if (results.length === 0) return null;

    const top = results[0];
    const details = await this.getReleaseById(top.id);

    const genres = details?.genres ?? top.genre ?? [];
    const styles = details?.styles ?? top.style ?? [];
    const catNo = details?.labels?.[0]?.catno ?? top.catno;
    const masterId = details?.master_id ?? top.master_id;

    return {
      genre: genres.length > 0 ? genres.join(', ') : undefined,
      style: styles.length > 0 ? styles.join(', ') : undefined,
      catalogNumber: catNo && catNo !== 'none' ? catNo : undefined,
      masterRelease: masterId ? `discogs:master:${masterId}` : undefined
    };
  }
}
