import { RequestPipeline } from '../../platform/networking/RequestPipeline';
import type { SpotifyPlaylistPaging, SpotifyPlaylistSummary, SpotifyUserProfile } from './types';

export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

export class SpotifyApiClient {
  private readonly pipeline: RequestPipeline;

  constructor(pipeline?: RequestPipeline) {
    this.pipeline =
      pipeline ??
      new RequestPipeline({
        maxConcurrentRequests: 4,
        rateLimiter: {
          maxRequests: 10,
          perIntervalMs: 1000
        },
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          retryableStatusCodes: [429, 500, 502, 503, 504]
        }
      });
  }

  /** Fetches the current authenticated user's Spotify profile. */
  public async getCurrentUser(accessToken: string): Promise<SpotifyUserProfile> {
    const response = await this.pipeline.execute<{
      id: string;
      display_name: string | null;
      email?: string;
      product?: string;
      images?: Array<{ url: string; height?: number; width?: number }>;
    }>({
      url: `${SPOTIFY_API_BASE_URL}/me`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch Spotify user profile: HTTP ${response.status}`);
    }

    const data = response.data;
    return {
      id: data.id,
      displayName: data.display_name,
      email: data.email,
      product: data.product,
      images: data.images
    };
  }

  /** Fetches the current user's Spotify playlists (paginated). */
  public async getUserPlaylists(
    accessToken: string,
    options?: { limit?: number; offset?: number }
  ): Promise<SpotifyPlaylistPaging> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const url = new URL(`${SPOTIFY_API_BASE_URL}/me/playlists`);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('offset', offset.toString());

    const response = await this.pipeline.execute<{
      items: Array<{
        id: string;
        name: string;
        description: string | null;
        uri: string;
        snapshot_id: string;
        collaborative: boolean;
        public: boolean | null;
        images?: Array<{ url: string }>;
        tracks?: { total: number };
      }>;
      total: number;
      limit: number;
      offset: number;
      next: string | null;
    }>({
      url: url.toString(),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch Spotify playlists: HTTP ${response.status}`);
    }

    const data = response.data;
    const items: SpotifyPlaylistSummary[] = data.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      uri: item.uri,
      snapshotId: item.snapshot_id,
      collaborative: item.collaborative,
      isPublic: item.public,
      imageUrl: item.images?.[0]?.url,
      tracksTotal: item.tracks?.total ?? 0
    }));

    return {
      items,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
      hasNext: data.next !== null
    };
  }

  /**
   * Fetches all user playlists across all pages by auto-paginating through the Spotify Web API.
   */
  public async getAllUserPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
    const allPlaylists: SpotifyPlaylistSummary[] = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const page = await this.getUserPlaylists(accessToken, { limit, offset });
      allPlaylists.push(...page.items);

      offset += page.items.length;
      hasMore = page.hasNext && page.items.length > 0 && offset < page.total;
    }

    return allPlaylists;
  }
}
