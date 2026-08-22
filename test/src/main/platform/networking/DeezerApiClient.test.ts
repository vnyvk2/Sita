import { describe, expect, it, vi } from 'vitest';
import { DeezerApiClient } from '@main/platform/networking/DeezerApiClient';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';

describe('DeezerApiClient', () => {
  it('searches for an artist and returns matching artist info', async () => {
    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          data: [
            { id: 27, name: 'Daft Punk', link: 'https://deezer.com/artist/27', picture_medium: 'http://pic.jpg' }
          ],
          total: 1
        }
      })
    };

    const client = new DeezerApiClient(mockPipeline as RequestPipeline);
    const result = await client.searchArtist('Daft Punk');

    expect(result).not.toBeNull();
    expect(result?.id).toBe(27);
    expect(result?.name).toBe('Daft Punk');
    expect(mockPipeline.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.deezer.com/search/artist',
        params: { q: 'Daft Punk', limit: 5 }
      })
    );
  });

  it('returns null when artist search yields no results or empty name', async () => {
    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: { data: [], total: 0 }
      })
    };

    const client = new DeezerApiClient(mockPipeline as RequestPipeline);
    const result1 = await client.searchArtist('');
    const result2 = await client.searchArtist('NonExistentArtistXYZ123');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  it('fetches artist albums and categorizes correctly', async () => {
    const mockAlbums = [
      { id: 101, title: 'Discovery', record_type: 'album', nb_tracks: 14, release_date: '2001-03-07' },
      { id: 102, title: 'One More Time', record_type: 'single', nb_tracks: 3, release_date: '2000-11-13' }
    ];

    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: { data: mockAlbums, total: 2 }
      })
    };

    const client = new DeezerApiClient(mockPipeline as RequestPipeline);
    const albums = await client.getArtistAlbums(27);

    expect(albums).toHaveLength(2);
    expect(albums[0].title).toBe('Discovery');
    expect(albums[1].record_type).toBe('single');
  });

  it('fetches album tracklist with 30s previews', async () => {
    const mockTracks = [
      { id: 201, title: 'One More Time', duration: 320, preview: 'https://preview.mp3' },
      { id: 202, title: 'Aerodynamic', duration: 207, preview: 'https://preview2.mp3' }
    ];

    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: { data: mockTracks, total: 2 }
      })
    };

    const client = new DeezerApiClient(mockPipeline as RequestPipeline);
    const tracks = await client.getAlbumTracks(101);

    expect(tracks).toHaveLength(2);
    expect(tracks[0].preview).toBe('https://preview.mp3');
  });

  it('fetches artist top tracks', async () => {
    const mockTopTracks = [
      { id: 301, title: 'Get Lucky', rank: 999999, preview: 'https://preview-gl.mp3' }
    ];

    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: { data: mockTopTracks, total: 1 }
      })
    };

    const client = new DeezerApiClient(mockPipeline as RequestPipeline);
    const topTracks = await client.getArtistTopTracks(27, 5);

    expect(topTracks).toHaveLength(1);
    expect(topTracks[0].title).toBe('Get Lucky');
  });
});
