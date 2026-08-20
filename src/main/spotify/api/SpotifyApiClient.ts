import axios, { type AxiosInstance } from 'axios';
import logger from '../../logger';
import type {
  SpotifyPlaylistItemDTO,
  SpotifyPlaylistItemsResponse,
  SpotifyPlaylistSummary,
  SpotifyPlaylistsResponse,
  SpotifyUserDTO
} from './types';

export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

export class SpotifyApiClient {
  private httpClient: AxiosInstance;

  constructor(httpClient?: AxiosInstance) {
    this.httpClient =
      httpClient ||
      axios.create({
        baseURL: SPOTIFY_API_BASE_URL,
        timeout: 10000
      });
  }

  /**
   * Fetches the current user profile from Spotify Web API
   */
  public async getCurrentUser(accessToken: string): Promise<SpotifyUserDTO> {
    try {
      const response = await this.httpClient.get<SpotifyUserDTO>('/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Spotify user profile', { error });
      throw error;
    }
  }

  /**
   * Fetches the user's saved/followed playlists with pagination
   */
  public async getUserPlaylists(
    accessToken: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ items: SpotifyPlaylistSummary[]; total: number }> {
    const { limit = 50, offset = 0 } = options;
    try {
      const response = await this.httpClient.get<SpotifyPlaylistsResponse>('/me/playlists', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          limit,
          offset
        }
      });

      const items: SpotifyPlaylistSummary[] = response.data.items.map((pl) => ({
        id: pl.id,
        name: pl.name,
        description: pl.description,
        imageUrl: pl.images?.[0]?.url,
        tracksTotal: pl.items?.total ?? pl.tracks?.total ?? 0,
        snapshotId: pl.snapshot_id,
        uri: pl.uri,
        ownerName: pl.owner?.display_name || pl.owner?.id
      }));

      return {
        items,
        total: response.data.total
      };
    } catch (error) {
      logger.error('Failed to fetch Spotify playlists', { error });
      throw error;
    }
  }

  /**
   * Fetches metadata for a single playlist by ID
   */
  public async getPlaylist(
    accessToken: string,
    playlistId: string
  ): Promise<SpotifyPlaylistSummary> {
    try {
      const response = await this.httpClient.get(`/playlists/${encodeURIComponent(playlistId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const data = response.data;
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        imageUrl: data.images?.[0]?.url,
        tracksTotal: data.items?.total ?? data.tracks?.total ?? 0,
        snapshotId: data.snapshot_id,
        uri: data.uri,
        ownerName: data.owner?.display_name || data.owner?.id
      };
    } catch (error) {
      logger.error('Failed to fetch Spotify playlist details', { playlistId, error });
      throw error;
    }
  }

  /**
   * Fetches a single page of items from a Spotify playlist (using the active GET /v1/playlists/{id}/items endpoint)
   * explicitly requesting additional_types=track,episode
   */
  public async getPlaylistItems(
    accessToken: string,
    playlistId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SpotifyPlaylistItemsResponse> {
    const { limit = 50, offset = 0 } = options;
    try {
      const response = await this.httpClient.get<SpotifyPlaylistItemsResponse>(
        `/playlists/${encodeURIComponent(playlistId)}/items`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          params: {
            limit,
            offset,
            additional_types: 'track,episode'
          }
        }
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Spotify playlist items page', { playlistId, options, error });
      throw error;
    }
  }

  /**
   * Auto-paginates and fetches all items from a Spotify playlist following pure page.next authority,
   * bounded by a MAX_PAGES guard and duplicate next safety.
   */
  public async getAllPlaylistItems(
    accessToken: string,
    playlistId: string
  ): Promise<SpotifyPlaylistItemDTO[]> {
    const allItems: SpotifyPlaylistItemDTO[] = [];
    const MAX_PAGES = 200; // Safeguard: max 10,000 items
    let pageCount = 0;
    let nextUrl: string | null = null;
    let previousNextUrl: string | null = null;

    while (pageCount < MAX_PAGES) {
      pageCount++;
      let page: SpotifyPlaylistItemsResponse;

      if (!nextUrl) {
        page = await this.getPlaylistItems(accessToken, playlistId, {
          limit: 50,
          offset: allItems.length
        });
      } else {
        const response = await this.httpClient.get<SpotifyPlaylistItemsResponse>(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        page = response.data;
      }

      if (page.items && Array.isArray(page.items)) {
        allItems.push(...page.items);
      }

      if (!page.next || page.items.length === 0) {
        break;
      }

      if (page.next === previousNextUrl) {
        logger.warn('Detected duplicate pagination next URL loop from Spotify API', { nextUrl: page.next });
        break;
      }

      previousNextUrl = nextUrl;
      nextUrl = page.next;
    }

    return allItems;
  }
}
