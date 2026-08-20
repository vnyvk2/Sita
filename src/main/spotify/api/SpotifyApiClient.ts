import { RequestPipeline } from '../../platform/networking/RequestPipeline';
import type {
  SpotifyAddItemsResponse,
  SpotifyCreatePlaylistRequest,
  SpotifyPlaylistDetails,
  SpotifyPlaylistItemDTO,
  SpotifyPlaylistItemsResponse,
  SpotifyPlaylistPaging,
  SpotifyPlaylistSummary,
  SpotifyRemoveItemsResponse,
  SpotifyRemovePlaylistItem,
  SpotifySearchResponse,
  SpotifyTrackInput,
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
      email?: string;
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
      email: data.email,
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
   * Fetches all user playlists across all pages following pure page.next authority.
   */
  public async getAllUserPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
    const allPlaylists: SpotifyPlaylistSummary[] = [];
    const seenNextUrls = new Set<string>();
    const MAX_PAGES = 200;
    let pageCount = 0;
    let nextUrl: string | null = null;

    while (pageCount < MAX_PAGES) {
      pageCount++;
      const page = await this.getUserPlaylists(
        accessToken,
        nextUrl ? { nextUrl } : { limit: 50, offset: 0 }
      );

      if (!page.playlists || page.playlists.length === 0) {
        break;
      }
      allPlaylists.push(...page.playlists);

      if (!page.next || seenNextUrls.has(page.next)) {
        break;
      }
      seenNextUrls.add(page.next);
      nextUrl = page.next;
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
    const seenNextUrls = new Set<string>();
    const MAX_PAGES = 200;
    let pageCount = 0;
    let nextUrl: string | null = null;

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

      if (seenNextUrls.has(page.next)) {
        break;
      }

      seenNextUrls.add(page.next);
      nextUrl = page.next;
    }

    return allItems;
  }

  /**
   * Searches the Spotify track catalog using GET /v1/search?type=track.
   * Capped to limit 1..10 in compliance with the February 2026 Spotify Search API update.
   */
  public async searchTracks(
    accessToken: string,
    query: string,
    limit?: number
  ): Promise<SpotifyTrackInput[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit ?? 10, 1), 10);
    const url = new URL(`${SPOTIFY_API_BASE_URL}/search`);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('type', 'track');
    url.searchParams.set('limit', safeLimit.toString());

    const response = await this.pipeline.execute<SpotifySearchResponse>({
      url: url.toString(),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to search Spotify track catalog: HTTP ${response.status}`);
    }

    return response.data.tracks?.items ?? [];
  }

  /**
   * Creates a playlist for the current authenticated user using POST /v1/me/playlists.
   * Explicitly sets public visibility (defaulting to false).
   */
  public async createPlaylist(
    accessToken: string,
    details: {
      name: string;
      description?: string;
      isPublic: boolean;
    }
  ): Promise<SpotifyPlaylistDetails> {
    const payload: SpotifyCreatePlaylistRequest = {
      name: details.name.trim(),
      description: details.description?.trim() || undefined,
      public: Boolean(details.isPublic)
    };

    const response = await this.pipeline.execute<SpotifyPlaylistDetails>({
      url: `${SPOTIFY_API_BASE_URL}/me/playlists`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: payload
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to create Spotify playlist: HTTP ${response.status}`);
    }

    return response.data;
  }

  /**
   * Adds items to a Spotify playlist using POST /v1/playlists/{id}/items.
   * Expects a single batch of 1..100 track URIs. Chunking is handled by caller.
   */
  public async addPlaylistItems(
    accessToken: string,
    playlistId: string,
    uris: string[]
  ): Promise<SpotifyAddItemsResponse> {
    if (!uris || uris.length === 0) {
      return { snapshot_id: '' };
    }

    if (uris.length > 100) {
      throw new Error(
        `Spotify addPlaylistItems batch cannot exceed 100 URIs (received ${uris.length})`
      );
    }

    const response = await this.pipeline.execute<SpotifyAddItemsResponse>({
      url: `${SPOTIFY_API_BASE_URL}/playlists/${encodeURIComponent(playlistId)}/items`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        uris
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to add items to Spotify playlist: HTTP ${response.status}`);
    }

    return response.data;
  }

  /**
   * Removes items from a Spotify playlist using DELETE /v1/playlists/{id}/items.
   * Expects up to 100 items with optional snapshot_id concurrency guard.
   */
  public async removePlaylistItems(
    accessToken: string,
    playlistId: string,
    items: SpotifyRemovePlaylistItem[],
    snapshotId?: string
  ): Promise<SpotifyRemoveItemsResponse> {
    if (!items || items.length === 0) {
      return { snapshot_id: snapshotId || '' };
    }

    if (items.length > 100) {
      throw new Error(
        `Spotify removePlaylistItems batch cannot exceed 100 items (received ${items.length})`
      );
    }

    const payload: { items: SpotifyRemovePlaylistItem[]; snapshot_id?: string } = {
      items
    };
    if (snapshotId) {
      payload.snapshot_id = snapshotId;
    }

    const response = await this.pipeline.execute<SpotifyRemoveItemsResponse>({
      url: `${SPOTIFY_API_BASE_URL}/playlists/${encodeURIComponent(playlistId)}/items`,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: payload
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to remove items from Spotify playlist: HTTP ${response.status}`);
    }

    return response.data;
  }

  /**
   * Replaces all items in a Spotify playlist using PUT /v1/playlists/{id}/items.
   * Strictly clamped to <= 100 items per Spotify Web API contract.
   */
  public async replacePlaylistItems(
    accessToken: string,
    playlistId: string,
    uris: string[]
  ): Promise<SpotifyAddItemsResponse> {
    if (uris.length > 100) {
      throw new Error(
        `Spotify replacePlaylistItems cannot exceed 100 URIs in a single request (received ${uris.length})`
      );
    }

    const response = await this.pipeline.execute<SpotifyAddItemsResponse>({
      url: `${SPOTIFY_API_BASE_URL}/playlists/${encodeURIComponent(playlistId)}/items`,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        uris
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to replace items in Spotify playlist: HTTP ${response.status}`);
    }

    return response.data;
  }
}

