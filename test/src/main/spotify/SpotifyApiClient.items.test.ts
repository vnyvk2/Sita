import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyApiClient } from '@main/spotify/api/SpotifyApiClient';
import type {
  SpotifyPlaylistItemDTO,
  SpotifyPlaylistItemsResponse
} from '@main/spotify/api/types';
import type { IHttpClient } from '@main/platform/networking/IHttpClient';
import { RequestPipeline } from '@main/platform/networking/RequestPipeline';

describe('SpotifyApiClient (Items API, additional_types, and Pagination Boundary Tests)', () => {
  const fakeToken = 'test-spotify-access-token';
  const fakePlaylistId = '37i9dQZF1DXcBWIGoYBM5M';
  let client: SpotifyApiClient;
  let mockHttpClient: IHttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpClient = {
      request: vi.fn()
    };
    const pipeline = new RequestPipeline({ client: mockHttpClient });
    client = new SpotifyApiClient(pipeline);
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

    mockHttpClient.request = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: mockResponse,
      url: 'https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M/items'
    });

    const result = await client.getPlaylistItems(fakeToken, fakePlaylistId, { limit: 50, offset: 0 });

    expect(mockHttpClient.request).toHaveBeenCalledTimes(1);
    expect(mockHttpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('additional_types=track%2Cepisode'),
        headers: expect.objectContaining({ Authorization: `Bearer ${fakeToken}` })
      })
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].item?.type).toBe('track');
  });

  it('should support getPlaylist() reading items.total and fallback tracks.total', async () => {
    // 2026 shape: items.total
    mockHttpClient.request = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        id: 'pl_2026',
        name: 'Modern Playlist',
        items: { total: 42 },
        uri: 'spotify:playlist:pl_2026'
      },
      url: 'https://api.spotify.com/v1/playlists/pl_2026'
    });

    const modern = await client.getPlaylist(fakeToken, 'pl_2026');
    expect(modern.tracksTotal).toBe(42);
    expect(modern.uri).toBe('spotify:playlist:pl_2026');

    // Legacy shape fallback: tracks.total
    mockHttpClient.request = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        id: 'pl_legacy',
        name: 'Legacy Playlist',
        tracks: { total: 17 }
      },
      url: 'https://api.spotify.com/v1/playlists/pl_legacy'
    });

    const legacy = await client.getPlaylist(fakeToken, 'pl_legacy');
    expect(legacy.tracksTotal).toBe(17);
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

    const page1: SpotifyPlaylistItemsResponse = {
      href: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=0',
      limit: 50,
      next: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=50',
      offset: 0,
      previous: null,
      total: 51,
      items: createItems(50, 1)
    };

    const page2: SpotifyPlaylistItemsResponse = {
      href: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=50',
      limit: 50,
      next: null,
      offset: 50,
      previous: 'https://api.spotify.com/v1/playlists/pl1/items?limit=50&offset=0',
      total: 51,
      items: createItems(1, 51)
    };

    mockHttpClient.request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, data: page1, url: 'url1' })
      .mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, data: page2, url: 'url2' });

    const allItems = await client.getAllPlaylistItems(fakeToken, fakePlaylistId);

    expect(allItems.length).toBe(51);
    expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
  });
});
