import { describe, expect, it, vi } from 'vitest';
import { SpotifyApiClient } from '@main/spotify/api/SpotifyApiClient';
import type { IHttpClient } from '@main/platform/networking/IHttpClient';
import { RequestPipeline } from '@main/platform/networking/RequestPipeline';

describe('SpotifyApiClient', () => {
  it('should fetch user profile from /me', async () => {
    const mockHttpClient: IHttpClient = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          id: 'spotify_user_456',
          display_name: 'Jane Doe',
          email: 'jane@example.com',
          product: 'premium',
          images: [{ url: 'https://image.spotify.com/avatar.jpg' }]
        },
        url: 'https://api.spotify.com/v1/me'
      })
    };

    const pipeline = new RequestPipeline({ client: mockHttpClient });
    const client = new SpotifyApiClient(pipeline);

    const profile = await client.getCurrentUser('mock-access-token');
    expect(profile.id).toBe('spotify_user_456');
    expect(profile.displayName).toBe('Jane Doe');
    expect(profile.product).toBe('premium');
    expect(mockHttpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.spotify.com/v1/me',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-access-token'
        })
      })
    );
  });

  it('should fetch user playlists from /me/playlists (single page)', async () => {
    const mockHttpClient: IHttpClient = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          items: [
            {
              id: 'pl_123',
              name: 'My Road Trip Mix',
              description: 'Great songs for driving',
              uri: 'spotify:playlist:pl_123',
              snapshot_id: 'snap_abc123',
              collaborative: false,
              public: true,
              images: [{ url: 'https://image.spotify.com/pl.jpg' }],
              tracks: { total: 42 }
            }
          ],
          total: 1,
          limit: 50,
          offset: 0,
          next: null
        },
        url: 'https://api.spotify.com/v1/me/playlists'
      })
    };

    const pipeline = new RequestPipeline({ client: mockHttpClient });
    const client = new SpotifyApiClient(pipeline);

    const playlists = await client.getUserPlaylists('mock-access-token', { limit: 50 });
    expect(playlists.total).toBe(1);
    expect(playlists.playlists[0].name).toBe('My Road Trip Mix');
    expect(playlists.playlists[0].tracksTotal).toBe(42);
    expect(playlists.playlists[0].snapshotId).toBe('snap_abc123');
  });

  describe('getAllUserPlaylists Pagination Boundary Cases', () => {
    it('should handle 0 playlists correctly', async () => {
      const mockHttpClient: IHttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: {},
          data: { items: [], total: 0, limit: 50, offset: 0, next: null },
          url: 'https://api.spotify.com/v1/me/playlists'
        })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      const all = await client.getAllUserPlaylists('token');
      expect(all).toEqual([]);
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1);
    });

    it('should paginate across boundary cases: 51 playlists across 2 pages (50 + 1)', async () => {
      const page1Items = Array.from({ length: 50 }, (_, i) => ({
        id: `pl_${i + 1}`,
        name: `Playlist ${i + 1}`,
        description: null,
        uri: `spotify:playlist:pl_${i + 1}`,
        snapshot_id: `snap_${i + 1}`,
        collaborative: false,
        public: true,
        tracks: { total: 10 }
      }));

      const page2Items = [
        {
          id: 'pl_51',
          name: 'Playlist 51',
          description: null,
          uri: 'spotify:playlist:pl_51',
          snapshot_id: 'snap_51',
          collaborative: false,
          public: true,
          tracks: { total: 5 }
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
              items: page1Items,
              total: 51,
              limit: 50,
              offset: 0,
              next: 'https://api.spotify.com/v1/me/playlists?limit=50&offset=50'
            },
            url: 'https://api.spotify.com/v1/me/playlists'
          })
          .mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: {},
            data: {
              items: page2Items,
              total: 51,
              limit: 50,
              offset: 50,
              next: null
            },
            url: 'https://api.spotify.com/v1/me/playlists'
          })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      const all = await client.getAllUserPlaylists('token');

      expect(all.length).toBe(51);
      expect(all[0].name).toBe('Playlist 1');
      expect(all[50].name).toBe('Playlist 51');
      expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
    });

    it('should safely terminate on pathological next=true with empty page without infinite loops', async () => {
      const mockHttpClient: IHttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: {},
          data: {
            items: [],
            total: 10,
            limit: 50,
            offset: 0,
            next: 'https://api.spotify.com/v1/me/playlists?limit=50&offset=50'
          },
          url: 'https://api.spotify.com/v1/me/playlists'
        })
      };

      const client = new SpotifyApiClient(new RequestPipeline({ client: mockHttpClient }));
      const all = await client.getAllUserPlaylists('token');
      expect(all).toEqual([]);
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1);
    });
  });
});
