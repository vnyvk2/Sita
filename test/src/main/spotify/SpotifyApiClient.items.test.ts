import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyApiClient } from '@main/spotify/api/SpotifyApiClient';
import type {
  SpotifyPlaylistItemDTO,
  SpotifyPlaylistItemsResponse
} from '@main/spotify/api/types';

vi.mock('axios');

describe('SpotifyApiClient (Items API, additional_types, and Pagination Boundary Tests)', () => {
  const fakeToken = 'test-spotify-access-token';
  const fakePlaylistId = '37i9dQZF1DXcBWIGoYBM5M';
  let client: SpotifyApiClient;
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet = vi.fn();
    vi.mocked(axios.create).mockReturnValue({
      get: mockGet
    } as unknown as ReturnType<typeof axios.create>);

    client = new SpotifyApiClient();
  });

  it('should query active /items endpoint with additional_types=track,episode and map modern response', async () => {
    const mockResponse: SpotifyPlaylistItemsResponse = {
      href: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=0',
      limit: 50,
      next: null,
      offset: 0,
      previous: null,
      total: 1,
      items: [
        {
          added_at: '2026-01-15T12:00:00Z',
          is_local: false,
          item: {
            id: 'track_123',
            name: 'Song Title',
            duration_ms: 215000,
            type: 'track',
            external_ids: { isrc: 'USRC12345678' },
            artists: [{ name: 'Artist Name' }],
            album: { name: 'Album Title', release_date: '2026-01-01' }
          }
        }
      ]
    };

    mockGet.mockResolvedValueOnce({ data: mockResponse });

    const result = await client.getPlaylistItems(fakeToken, fakePlaylistId, { limit: 50, offset: 0 });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      `/playlists/${fakePlaylistId}/items`,
      expect.objectContaining({
        headers: { Authorization: `Bearer ${fakeToken}` },
        params: { limit: 50, offset: 0, additional_types: 'track,episode' }
      })
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].item?.type).toBe('track');
  });

  it('should support getPlaylist() reading items.total and fallback tracks.total', async () => {
    // 2026 shape: items.total
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'pl_2026',
        name: 'Modern Playlist',
        items: { total: 42 },
        uri: 'spotify:playlist:pl_2026'
      }
    });

    const modern = await client.getPlaylist(fakeToken, 'pl_2026');
    expect(modern.tracksTotal).toBe(42);
    expect(modern.uri).toBe('spotify:playlist:pl_2026');

    // Legacy shape fallback: tracks.total
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'pl_legacy',
        name: 'Legacy Playlist',
        tracks: { total: 17 }
      }
    });

    const legacy = await client.getPlaylist(fakeToken, 'pl_legacy');
    expect(legacy.tracksTotal).toBe(17);
  });

  it('should throw cleanly on 429 Too Many Requests response', async () => {
    const error429 = new Error('Request failed with status code 429');
    (error429 as unknown as { response: { status: number } }).response = { status: 429 };
    mockGet.mockRejectedValueOnce(error429);

    await expect(client.getPlaylistItems(fakeToken, fakePlaylistId)).rejects.toThrow();
  });

  it('should paginate through multiple pages following page.next authority', async () => {
    const createItems = (count: number, startId: number): SpotifyPlaylistItemDTO[] =>
      Array.from({ length: count }, (_, i) => ({
        added_at: '2026-01-01T00:00:00Z',
        is_local: false,
        item: {
          id: `track_${startId + i}`,
          name: `Track ${startId + i}`,
          duration_ms: 200000,
          type: 'track'
        }
      }));

    // Page 1: 50 items, next URL points to page 2
    const page1: SpotifyPlaylistItemsResponse = {
      href: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=0',
      limit: 50,
      next: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=50',
      offset: 0,
      previous: null,
      total: 51,
      items: createItems(50, 1)
    };

    // Page 2: 1 item, next is null
    const page2: SpotifyPlaylistItemsResponse = {
      href: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=50',
      limit: 50,
      next: null,
      offset: 50,
      previous: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=0',
      total: 51,
      items: createItems(1, 51)
    };

    mockGet
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 });

    const allItems = await client.getAllPlaylistItems(fakeToken, fakePlaylistId);

    expect(allItems.length).toBe(51);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
