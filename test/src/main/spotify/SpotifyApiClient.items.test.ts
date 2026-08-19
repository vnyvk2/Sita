import { describe, expect, it, vi } from 'vitest';
import type { IHttpClient } from '@main/platform/networking/IHttpClient';
import { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import { SpotifyApiClient } from '@main/spotify/api/SpotifyApiClient';

describe('SpotifyApiClient (Playlist Details & 2026 /items API)', () => {
  it('should fetch playlist metadata details from /playlists/{id}', async () => {
    const mockHttpClient: IHttpClient = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          id: 'pl_rock_classics',
          name: 'Rock Classics',
          description: 'Timeless rock anthems',
          uri: 'spotify:playlist:pl_rock_classics',
          snapshot_id: 'snap_rock_99',
          images: [{ url: 'https://image.spotify.com/rock.jpg' }],
          owner: { id: 'spotify_curator', display_name: 'Curator' },
          tracks: { total: 120 }
        },
        url: 'https://api.spotify.com/v1/playlists/pl_rock_classics'
      })
    };

    const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
    const details = await client.getPlaylist('mock-token', 'pl_rock_classics');

    expect(details.id).toBe('pl_rock_classics');
    expect(details.name).toBe('Rock Classics');
    expect(details.description).toBe('Timeless rock anthems');
    expect(details.imageUrl).toBe('https://image.spotify.com/rock.jpg');
    expect(details.tracksTotal).toBe(120);
  });

  it('should fetch single page of playlist items from active /playlists/{id}/items endpoint', async () => {
    const mockHttpClient: IHttpClient = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          href: 'https://api.spotify.com/v1/playlists/pl_123/items',
          limit: 50,
          offset: 0,
          total: 2,
          next: null,
          previous: null,
          items: [
            {
              added_at: '2026-01-01T12:00:00Z',
              is_local: false,
              item: {
                id: 'track_1',
                name: 'Bohemian Rhapsody',
                type: 'track',
                artists: [{ name: 'Queen' }],
                duration_ms: 354000
              }
            },
            {
              added_at: '2026-01-02T12:00:00Z',
              is_local: false,
              item: {
                id: 'ep_1',
                name: 'Rock History Episode 1',
                type: 'episode',
                duration_ms: 1800000
              }
            }
          ]
        },
        url: 'https://api.spotify.com/v1/playlists/pl_123/items?limit=50&offset=0'
      })
    };

    const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
    const response = await client.getPlaylistItems('mock-token', 'pl_123');

    expect(response.total).toBe(2);
    expect(response.items.length).toBe(2);
    expect((response.items[0].item as { name: string }).name).toBe('Bohemian Rhapsody');
    expect((response.items[1].item as { type: string }).type).toBe('episode');
  });

  describe('getAllPlaylistItems Pagination & Boundary Matrix', () => {
    it('should handle 0 items empty playlist', async () => {
      const mockHttpClient: IHttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: {},
          data: {
            href: 'https://api.spotify.com/v1/playlists/pl_empty/items',
            limit: 50,
            offset: 0,
            total: 0,
            next: null,
            previous: null,
            items: []
          },
          url: 'https://api.spotify.com/v1/playlists/pl_empty/items?limit=50&offset=0'
        })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      const all = await client.getAllPlaylistItems('token', 'pl_empty');
      expect(all).toEqual([]);
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1);
    });

    it('should paginate exactly 51 items across 2 pages (50 + 1) following page.next authority', async () => {
      const page1Items = Array.from({ length: 50 }, (_, i) => ({
        added_at: '2026-01-01',
        item: { id: `tr_${i + 1}`, name: `Track ${i + 1}`, type: 'track', duration_ms: 200000 }
      }));

      const page2Items = [
        {
          added_at: '2026-01-02',
          item: { id: 'tr_51', name: 'Track 51', type: 'track', duration_ms: 210000 }
        }
      ];

      const mockHttpClient: IHttpClient = {
        request: vi
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: {},
            data: {
              href: 'https://api.spotify.com/v1/playlists/pl_51/items',
              limit: 50,
              offset: 0,
              total: 51,
              next: 'https://api.spotify.com/v1/playlists/pl_51/items?limit=50&offset=50',
              previous: null,
              items: page1Items
            },
            url: 'https://api.spotify.com/v1/playlists/pl_51/items?limit=50&offset=0'
          })
          .mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: {},
            data: {
              href: 'https://api.spotify.com/v1/playlists/pl_51/items?limit=50&offset=50',
              limit: 50,
              offset: 50,
              total: 51,
              next: null,
              previous: null,
              items: page2Items
            },
            url: 'https://api.spotify.com/v1/playlists/pl_51/items?limit=50&offset=50'
          })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      const all = await client.getAllPlaylistItems('token', 'pl_51');

      expect(all.length).toBe(51);
      expect((all[0].item as { name: string }).name).toBe('Track 1');
      expect((all[50].item as { name: string }).name).toBe('Track 51');
      expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
    });

    it('should paginate exactly 101 items across 3 pages (50 + 50 + 1)', async () => {
      const page1 = Array.from({ length: 50 }, (_, i) => ({
        added_at: '2026-01-01',
        item: { id: `tr_${i + 1}`, name: `Track ${i + 1}`, type: 'track', duration_ms: 200000 }
      }));
      const page2 = Array.from({ length: 50 }, (_, i) => ({
        added_at: '2026-01-01',
        item: { id: `tr_${i + 51}`, name: `Track ${i + 51}`, type: 'track', duration_ms: 200000 }
      }));
      const page3 = [
        {
          added_at: '2026-01-01',
          item: { id: 'tr_101', name: 'Track 101', type: 'track', duration_ms: 200000 }
        }
      ];

      const mockHttpClient: IHttpClient = {
        request: vi
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: {},
            data: {
              href: 'https://api.spotify.com/v1/playlists/pl_101/items',
              limit: 50,
              offset: 0,
              total: 101,
              next: 'https://api.spotify.com/v1/playlists/pl_101/items?offset=50',
              items: page1
            },
            url: 'https://api.spotify.com/v1/playlists/pl_101/items?limit=50&offset=0'
          })
          .mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: {},
            data: {
              href: 'https://api.spotify.com/v1/playlists/pl_101/items?offset=50',
              limit: 50,
              offset: 50,
              total: 101,
              next: 'https://api.spotify.com/v1/playlists/pl_101/items?offset=100',
              items: page2
            },
            url: 'https://api.spotify.com/v1/playlists/pl_101/items?offset=50'
          })
          .mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: {},
            data: {
              href: 'https://api.spotify.com/v1/playlists/pl_101/items?offset=100',
              limit: 50,
              offset: 100,
              total: 101,
              next: null,
              items: page3
            },
            url: 'https://api.spotify.com/v1/playlists/pl_101/items?offset=100'
          })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      const all = await client.getAllPlaylistItems('token', 'pl_101');

      expect(all.length).toBe(101);
      expect((all[100].item as { name: string }).name).toBe('Track 101');
      expect(mockHttpClient.request).toHaveBeenCalledTimes(3);
    });

    it('should terminate safely without infinite loop if next != null but items is empty', async () => {
      const mockHttpClient: IHttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: {},
          data: {
            href: 'https://api.spotify.com/v1/playlists/pl_patho/items',
            limit: 50,
            offset: 0,
            total: 10,
            next: 'https://api.spotify.com/v1/playlists/pl_patho/items?offset=50',
            items: []
          },
          url: 'https://api.spotify.com/v1/playlists/pl_patho/items'
        })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      const all = await client.getAllPlaylistItems('token', 'pl_patho');

      expect(all).toEqual([]);
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Status Handling (401, 403, 429)', () => {
    it('should throw clear error on 401 Unauthorized', async () => {
      const mockHttpClient: IHttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          data: { error: { message: 'The access token expired' } },
          url: 'https://api.spotify.com/v1/playlists/pl_123'
        })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      await expect(client.getPlaylist('expired-token', 'pl_123')).rejects.toThrow(/HTTP 401/i);
    });

    it('should throw clear error on 403 Forbidden (inaccessible playlist)', async () => {
      const mockHttpClient: IHttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          data: { error: { message: 'User does not own or collaborate on this playlist' } },
          url: 'https://api.spotify.com/v1/playlists/pl_private_other/items'
        })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      await expect(client.getPlaylistItems('token', 'pl_private_other')).rejects.toThrow(/HTTP 403/i);
    });
  });
});
