import { describe, expect, it, vi } from 'vitest';
import { ITunesApiClient } from '@main/platform/networking/ITunesApiClient';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';

describe('ITunesApiClient', () => {
  it('searches for artist albums and returns formatted results', async () => {
    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          resultCount: 2,
          results: [
            {
              collectionId: 101,
              collectionName: 'Discovery',
              artistName: 'Daft Punk',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/img/100x100bb.jpg',
              trackCount: 14,
              releaseDate: '2001-03-07T00:00:00Z',
              wrapperType: 'collection'
            },
            {
              collectionId: 102,
              collectionName: 'One More Time - Single',
              artistName: 'Daft Punk',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/img2/100x100bb.jpg',
              trackCount: 1,
              releaseDate: '2000-11-13T00:00:00Z',
              wrapperType: 'collection'
            }
          ]
        }
      })
    };

    const client = new ITunesApiClient(mockPipeline as RequestPipeline);
    const albums = await client.getArtistAlbums('Daft Punk', 50);

    expect(albums).toHaveLength(2);
    expect(albums[0].collectionName).toBe('Discovery');
    expect(albums[0].artworkUrl600).toContain('600x600bb.jpg');
    expect(albums[1].trackCount).toBe(1);
  });

  it('looks up album tracks by collection ID', async () => {
    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          resultCount: 3,
          results: [
            { wrapperType: 'collection', collectionName: 'Discovery' },
            {
              wrapperType: 'track',
              trackId: 201,
              trackName: 'One More Time',
              previewUrl: 'https://audio.itunes.com/preview1.m4a',
              trackTimeMillis: 320000
            },
            {
              wrapperType: 'track',
              trackId: 202,
              trackName: 'Aerodynamic',
              previewUrl: 'https://audio.itunes.com/preview2.m4a',
              trackTimeMillis: 207000
            }
          ]
        }
      })
    };

    const client = new ITunesApiClient(mockPipeline as RequestPipeline);
    const tracks = await client.getAlbumTracks(101);

    expect(tracks).toHaveLength(2);
    expect(tracks[0].trackName).toBe('One More Time');
    expect(tracks[0].previewUrl).toBe('https://audio.itunes.com/preview1.m4a');
  });

  it('searches for artist top songs', async () => {
    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          resultCount: 1,
          results: [
            {
              wrapperType: 'track',
              trackId: 301,
              trackName: 'Get Lucky',
              previewUrl: 'https://audio.itunes.com/getlucky.m4a',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/img3/100x100bb.jpg'
            }
          ]
        }
      })
    };

    const client = new ITunesApiClient(mockPipeline as RequestPipeline);
    const topTracks = await client.getArtistTopTracks('Daft Punk', 5);

    expect(topTracks).toHaveLength(1);
    expect(topTracks[0].trackName).toBe('Get Lucky');
    expect(topTracks[0].artworkUrl600).toContain('600x600bb.jpg');
  });
});
