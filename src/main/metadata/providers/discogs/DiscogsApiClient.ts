import { normalizeForMatching } from '../../matching/normalizeForMatching';
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
      console.log(`[DiscogsApiClient] GET ${url}`);
      const response = await this.pipeline.execute<{ results?: DiscogsSearchReleaseDto[] }>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      const results = response.data?.results ?? [];
      console.log(`[DiscogsApiClient] GET ${url} SUCCESS - Status: ${response.status}, Results count: ${results.length}`);
      return results;
    } catch (err: any) {
      console.error(`[DiscogsApiClient] GET ${url} FAILED - Error:`, {
        name: err?.name,
        message: err?.message,
        status: err?.status ?? err?.response?.status,
        code: err?.code,
        data: err?.response?.data
      });
      return [];
    }
  }

  public async getReleaseById(id: string | number): Promise<DiscogsReleaseDetailsDto | null> {
    if (!id) return null;

    const url = `${this.baseUrl}/releases/${id}`;

    try {
      console.log(`[DiscogsApiClient] GET ${url}`);
      const response = await this.pipeline.execute<DiscogsReleaseDetailsDto>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      console.log(`[DiscogsApiClient] GET ${url} SUCCESS - Status: ${response.status}`);
      return response.data ?? null;
    } catch (err: any) {
      console.error(`[DiscogsApiClient] GET ${url} FAILED - Error:`, {
        name: err?.name,
        message: err?.message,
        status: err?.status ?? err?.response?.status,
        code: err?.code,
        data: err?.response?.data
      });
      return null;
    }
  }

  private isCandidateMatching(discogsTitle: string, queryTitle?: string, queryArtist?: string): boolean {
    if (!discogsTitle) return false;
    const normDiscogs = normalizeForMatching(discogsTitle);
    if (!normDiscogs) return false;

    if (queryTitle) {
      const normTitle = normalizeForMatching(queryTitle);
      if (normTitle && normTitle.length > 2) {
        const titlePattern = new RegExp(`(^|\\s)${this.escapeRegex(normTitle)}(\\s|$)`, 'i');
        const candidatePattern = new RegExp(`(^|\\s)${this.escapeRegex(normDiscogs)}(\\s|$)`, 'i');
        if (!titlePattern.test(normDiscogs) && !candidatePattern.test(normTitle) && !normDiscogs.includes(normTitle)) {
          return false;
        }
      }
    }

    if (queryArtist) {
      const normArtist = normalizeForMatching(queryArtist);
      if (normArtist && normArtist.length > 2) {
        const artistPattern = new RegExp(`(^|\\s)${this.escapeRegex(normArtist)}(\\s|$)`, 'i');
        if (!artistPattern.test(normDiscogs) && !normDiscogs.includes(normArtist)) {
          return false;
        }
      }
    }

    return true;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  public async fetchContributionData(query: { title?: string; artist?: string }): Promise<DiscogsContributionData | null> {
    const qStr = [query.artist, query.title].filter(Boolean).join(' ');
    if (!qStr) return null;

    const results = await this.searchReleases(qStr, 5);
    if (results.length === 0) return null;

    // Find first candidate that satisfies title and artist matching criteria
    const matchedCandidate = results.find((candidate) =>
      this.isCandidateMatching(candidate.title, query.title, query.artist)
    );

    if (!matchedCandidate) {
      console.log(`[DiscogsApiClient] Rejected ${results.length} Discogs search candidate(s) due to low title/artist similarity for "${qStr}"`);
      return null;
    }

    const details = await this.getReleaseById(matchedCandidate.id);

    const genres = details?.genres ?? matchedCandidate.genre ?? [];
    const styles = details?.styles ?? matchedCandidate.style ?? [];
    const catNo = details?.labels?.[0]?.catno ?? matchedCandidate.catno;
    const masterId = details?.master_id ?? matchedCandidate.master_id;

    return {
      genre: genres.length > 0 ? genres.join(', ') : undefined,
      style: styles.length > 0 ? styles.join(', ') : undefined,
      catalogNumber: catNo && catNo !== 'none' ? catNo : undefined,
      masterRelease: masterId ? `discogs:master:${masterId}` : undefined
    };
  }
}
