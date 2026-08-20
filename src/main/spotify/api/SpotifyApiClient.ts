import { RequestPipeline } from '../../platform/networking/RequestPipeline';
import type {
  SpotifyPlaylistDetails,
  SpotifyPlaylistItemsResponse,
  SpotifyPlaylistItemDTO,
  SpotifyPlaylistPaging,
  SpotifyPlaylistSummary,
  SpotifyUserProfile
} from './types';

export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

export class SpotifyApiClient {
  private readonly pipeline: RequestPipeline;

  constructor(pipeline?: RequestPipeline) {
    this.pipeline = pipeline ?? new RequestPipeline();
  }

  /**
   * Fetches the currently authenticated Spotify user's profile.
   */
  public async getCurrentUser(accessToken: string): Promise<SpotifyUserProfile> {
    const response = await this.pipeline.execute<{
      id: string;
      display_name: string | null;
      product?: string;
      images?: Array<{ url: string }>;
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
      product: data.product,
      imageUrl: data.images?.[0]?.url
    };
  }

  /** Fetches metadata details for a specific Spotify playlist. */
  public async getPlaylist(
    accessToken: string,
    playlistId: string
  ): Promise<SpotifyPlaylistDetails> {
    const response = await this.pipeline.execute<{
      id: string;
      name: string;
      description: string | null;
      uri: string;
      snapshot_id: string;
      images?: Array<{ url: string }>;
      owner?: { id: string; display_name?: string };
      tracks?: { total: number };
      items?: { total: number };
    }>({
      url: `${SPOTIFY_API_BASE_URL}/playlists/${encodeURIComponent(playlistId)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch Spotify playlist details: HTTP ${response.status}`);
    }

    const data = response.data;
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      uri: data.uri,
      snapshotId: data.snapshot_id,
      imageUrl: data.images?.[0]?.url,
      owner: data.owner,
      tracksTotal: data.items?.total ?? data.tracks?.total ?? 0
    };
  }

  /** Fetches the current user's Spotify playlists (paginated). */
  public async getUserPlaylists(
    accessToken: string,
    options?: { limit?: number; offset?: number; nextUrl?: string }
  ): Promise<{ playlists: SpotifyPlaylistSummary[]; total: number; next: string | null }> {
    let targetUrl: string;
    if (options?.nextUrl) {
      targetUrl = options.nextUrl;
    } else {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;
      const url = new URL(`${SPOTIFY_API_BASE_URL}/me/playlists`);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', offset.toString());
      targetUrl = url.toString();
    }

    const response = await this.pipeline.execute<SpotifyPlaylistPaging>({
      url: targetUrl,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch Spotify playlists: HTTP ${response.status}`);
    }

    const paging = response.data;
    const playlists: SpotifyPlaylistSummary[] = (paging.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      uri: item.uri,
      snapshotId: item.snapshot_id,
      imageUrl: item.images?.[0]?.url,
      owner: item.owner,
      tracksTotal: item.tracks?.total ?? 0
    }));

    return {
      playlists,
      total: paging.total,
      next: paging.next
    };
  }

  /**
   * Fetches all user playlists across all pages.
   */
  public async getAllUserPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
    const allPlaylists: SpotifyPlaylistSummary[] = [];
    let nextUrl: string | null = null;
    let isFirstPage = true;
    let hasMore = true;

    while (hasMore) {
      const page = await this.getUserPlaylists(
        accessToken,
        isFirstPage ? { limit: 50, offset: 0 } : { nextUrl: nextUrl! }
      );

      isFirstPage = false;
      if (!page.playlists || page.playlists.length === 0) {
        break;
      }
      allPlaylists.push(...page.playlists);
      nextUrl = page.next;
      hasMore = Boolean(nextUrl) && allPlaylists.length < page.total;
    }

    return allPlaylists;
  }

  /**
   * Fetches items (tracks, episodes) of a Spotify playlist using the active GET /v1/playlists/{id}/items endpoint.
   * Explicitly requests additional_types=track,episode
   */
  public async getPlaylistItems(
    accessToken: string,
    playlistId: string,
    options?: { limit?: number; offset?: number; nextUrl?: string }
  ): Promise<SpotifyPlaylistItemsResponse> {
    let targetUrl: string;
    if (options?.nextUrl) {
      targetUrl = options.nextUrl;
    } else {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;
      const url = new URL(
        `${SPOTIFY_API_BASE_URL}/playlists/${encodeURIComponent(playlistId)}/items`
      );
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', offset.toString());
      url.searchParams.set('additional_types', 'track,episode');
      targetUrl = url.toString();
    }

    const response = await this.pipeline.execute<SpotifyPlaylistItemsResponse>({
      url: targetUrl,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch Spotify playlist items: HTTP ${response.status}`);
    }

    return response.data;
  }

  /**
   * Fetches all items in a Spotify playlist following pure page.next authority with MAX_PAGES safety guard.
   */
  public async getAllPlaylistItems(
    accessToken: string,
    playlistId: string
  ): Promise<SpotifyPlaylistItemDTO[]> {
    const allItems: SpotifyPlaylistItemDTO[] = [];
    const MAX_PAGES = 200;
    let pageCount = 0;
    let nextUrl: string | null = null;
    let previousNextUrl: string | null = null;

    while (pageCount < MAX_PAGES) {
      pageCount++;
      const page: SpotifyPlaylistItemsResponse = await this.getPlaylistItems(
        accessToken,
        playlistId,
        nextUrl ? { nextUrl } : { limit: 50, offset: allItems.length }
      );

      if (page.items && Array.isArray(page.items)) {
        allItems.push(...page.items);
      }

      if (!page.next || page.items.length === 0) {
        break;
      }

      if (page.next === previousNextUrl) {
        break;
      }

      previousNextUrl = nextUrl;
      nextUrl = page.next;
    }

    return allItems;
  }
}
