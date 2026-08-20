import { describe, expect, it, vi } from 'vitest';

import type { RequestPipeline } from '../../../../src/main/platform/networking/RequestPipeline';
import { SpotifyApiClient } from '../../../../src/main/spotify/api/SpotifyApiClient';

describe('SpotifyApiClient (Phase 3B Sync Mutations)', () => {
  it('should call DELETE /playlists/{id}/items with items payload and snapshot_id concurrency guard', async () => {
    const mockPipeline = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: { snapshot_id: 'snap_new_201' }
      })
    } as unknown as RequestPipeline;

    const client = new SpotifyApiClient(mockPipeline);
    const result = await client.removePlaylistItems(
      'mock_token',
      'playlist_123',
      [
        { uri: 'spotify:track:A', positions: [0] },
        { uri: 'spotify:track:B', positions: [2] }
      ],
      'snap_base_200'
    );

    expect(result.snapshot_id).toBe('snap_new_201');
    expect(mockPipeline.execute).toHaveBeenCalledWith({
      url: 'https://api.spotify.com/v1/playlists/playlist_123/items',
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer mock_token',
        'Content-Type': 'application/json'
      },
      body: {
        items: [
          { uri: 'spotify:track:A', positions: [0] },
          { uri: 'spotify:track:B', positions: [2] }
        ],
        snapshot_id: 'snap_base_200'
      }
    });
  });

  it('should reject removePlaylistItems if batch exceeds 100 items', async () => {
    const client = new SpotifyApiClient({} as RequestPipeline);
    const oversizedItems = Array.from({ length: 101 }, (_, i) => ({
      uri: `spotify:track:${i}`
    }));

    await expect(
      client.removePlaylistItems('token', 'playlist_123', oversizedItems)
    ).rejects.toThrow(/cannot exceed 100 items/);
  });

  it('should call PUT /playlists/{id}/items with clamped <= 100 URIs for replacement', async () => {
    const mockPipeline = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: { snapshot_id: 'snap_replace_300' }
      })
    } as unknown as RequestPipeline;

    const client = new SpotifyApiClient(mockPipeline);
    const uris = ['spotify:track:1', 'spotify:track:2'];
    const result = await client.replacePlaylistItems('mock_token', 'playlist_123', uris);

    expect(result.snapshot_id).toBe('snap_replace_300');
    expect(mockPipeline.execute).toHaveBeenCalledWith({
      url: 'https://api.spotify.com/v1/playlists/playlist_123/items',
      method: 'PUT',
      headers: {
        Authorization: 'Bearer mock_token',
        'Content-Type': 'application/json'
      },
      body: {
        uris
      }
    });
  });

  it('should reject replacePlaylistItems if passed > 100 URIs in a single request', async () => {
    const client = new SpotifyApiClient({} as RequestPipeline);
    const oversizedUris = Array.from({ length: 101 }, (_, i) => `spotify:track:${i}`);

    await expect(
      client.replacePlaylistItems('token', 'playlist_123', oversizedUris)
    ).rejects.toThrow(/cannot exceed 100 URIs/);
  });
});
