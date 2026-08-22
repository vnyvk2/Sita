import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ArtistDiscographyService } from '@main/services/ArtistDiscographyService';
import type { DeezerApiClient } from '@main/platform/networking/DeezerApiClient';
import * as artistsDb from '@main/db/queries/artists';
import * as albumsDb from '@main/db/queries/albums';

vi.mock('@main/db/queries/artists', () => ({
  getArtistById: vi.fn()
}));

vi.mock('@main/db/queries/albums', () => ({
  getAllAlbums: vi.fn()
}));

describe('ArtistDiscographyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly calculates partial (5/14) vs full (14/14) vs discover (0/13) releases', async () => {
    // Local artist has Discovery album with only 5 songs, and Homework with 16 songs
    (artistsDb.getArtistById as any).mockResolvedValue({
      id: 1,
      name: 'Daft Punk',
      albums: [
        { album: { id: 10, title: 'Discovery' } },
        { album: { id: 20, title: 'Homework' } }
      ],
      songs: [
        { song: { id: 101, title: 'One More Time' } },
        { song: { id: 102, title: 'Aerodynamic' } },
        { song: { id: 103, title: 'Digital Love' } },
        { song: { id: 104, title: 'Harder, Better, Faster, Stronger' } },
        { song: { id: 105, title: 'Crescendolls' } },
        { song: { id: 301, title: 'Get Lucky' } }
      ]
    });

    (albumsDb.getAllAlbums as any).mockResolvedValue({
      data: [
        {
          id: 10,
          title: 'Discovery',
          songs: [
            { song: { id: 101, title: 'One More Time' } },
            { song: { id: 102, title: 'Aerodynamic' } },
            { song: { id: 103, title: 'Digital Love' } },
            { song: { id: 104, title: 'Harder, Better, Faster, Stronger' } },
            { song: { id: 105, title: 'Crescendolls' } }
          ]
        },
        {
          id: 20,
          title: 'Homework',
          songs: Array.from({ length: 16 }, (_, i) => ({ song: { id: 200 + i, title: `Track ${i + 1}` } }))
        }
      ]
    });

    const mockDeezerClient: Partial<DeezerApiClient> = {
      searchArtist: vi.fn().mockResolvedValue({ id: 27, name: 'Daft Punk' }),
      getArtistAlbums: vi.fn().mockResolvedValue([
        {
          id: 301,
          title: 'Discovery',
          record_type: 'album',
          release_date: '2001-03-07',
          cover_medium: 'http://pic.jpg',
          nb_tracks: 14 // Online has 14 tracks, local has 5 -> should be PARTIAL
        },
        {
          id: 302,
          title: 'Homework',
          record_type: 'album',
          release_date: '1997-01-20',
          cover_medium: 'http://hw.jpg',
          nb_tracks: 16 // Online has 16 tracks, local has 16 -> should be IN_LIBRARY
        },
        {
          id: 303,
          title: 'Random Access Memories',
          record_type: 'album',
          release_date: '2013-05-17',
          cover_medium: 'http://ram.jpg',
          nb_tracks: 13 // Online has 13 tracks, local has 0 -> should be DISCOVER
        },
        {
          id: 304,
          title: 'Get Lucky',
          record_type: 'single',
          release_date: '2013-04-19',
          cover_medium: 'http://single.jpg',
          nb_tracks: 1 // Single matching local song Get Lucky -> should be IN_LIBRARY
        }
      ])
    };

    const service = new ArtistDiscographyService(mockDeezerClient as DeezerApiClient);
    const discography = await service.getDiscography(1, 'Daft Punk');

    expect(discography.albums).toHaveLength(3);
    expect(discography.singlesAndEPs).toHaveLength(1);

    // 1. Partial: Discovery (5/14)
    const discovery = discography.albums.find((a) => a.title === 'Discovery');
    expect(discovery?.inLibraryStatus).toBe('partial');
    expect(discovery?.matchedTrackCount).toBe(5);
    expect(discovery?.totalLocalTracks).toBe(5);
    expect(discovery?.trackCount).toBe(14);
    expect(discovery?.localAlbumId).toBe(10);

    // 2. In Library: Homework (16/16)
    const homework = discography.albums.find((a) => a.title === 'Homework');
    expect(homework?.inLibraryStatus).toBe('in_library');
    expect(homework?.matchedTrackCount).toBe(16);
    expect(homework?.totalLocalTracks).toBe(16);
    expect(homework?.trackCount).toBe(16);
    expect(homework?.localAlbumId).toBe(20);

    // 3. Discover: Random Access Memories (0/13)
    const ram = discography.albums.find((a) => a.title === 'Random Access Memories');
    expect(ram?.inLibraryStatus).toBe('discover');
    expect(ram?.matchedTrackCount).toBe(0);
    expect(ram?.totalLocalTracks).toBe(0);
    expect(ram?.trackCount).toBe(13);
    expect(ram?.localAlbumId).toBeUndefined();

    // 4. Single: Get Lucky (1/1)
    const getLucky = discography.singlesAndEPs.find((s) => s.title === 'Get Lucky');
    expect(getLucky?.inLibraryStatus).toBe('in_library');
    expect(getLucky?.matchedTrackCount).toBe(1);
  });

  it('fetches album tracks and matches local songs', async () => {
    (artistsDb.getArtistById as any).mockResolvedValue({
      id: 1,
      name: 'Daft Punk',
      songs: [
        { song: { id: 101, title: 'One More Time' } }
      ]
    });

    const mockDeezerClient: Partial<DeezerApiClient> = {
      getAlbumTracks: vi.fn().mockResolvedValue([
        { id: 1001, title: 'One More Time', duration: 320, preview: 'https://preview1.mp3' },
        { id: 1002, title: 'Aerodynamic', duration: 207, preview: 'https://preview2.mp3' }
      ])
    };

    const service = new ArtistDiscographyService(mockDeezerClient as DeezerApiClient);
    const tracks = await service.getAlbumTracks(301, 1);

    expect(tracks).toHaveLength(2);
    expect(tracks[0].title).toBe('One More Time');
    expect(tracks[0].isInLibrary).toBe(true);
    expect(tracks[0].localSongId).toBe(101);

    expect(tracks[1].title).toBe('Aerodynamic');
    expect(tracks[1].isInLibrary).toBe(false);
    expect(tracks[1].previewUrl).toBe('https://preview2.mp3');
  });

  it('gracefully returns empty collections if artist is not found online', async () => {
    (artistsDb.getArtistById as any).mockResolvedValue({ id: 99, name: 'Local Band Only', albums: [], songs: [] });
    (albumsDb.getAllAlbums as any).mockResolvedValue({ data: [] });

    const mockDeezerClient: Partial<DeezerApiClient> = {
      searchArtist: vi.fn().mockResolvedValue(null)
    };

    const service = new ArtistDiscographyService(mockDeezerClient as DeezerApiClient);
    const discography = await service.getDiscography(99, 'Local Band Only');

    expect(discography.albums).toHaveLength(0);
    expect(discography.singlesAndEPs).toHaveLength(0);
    expect(discography.totalOnlineReleases).toBe(0);
  });
});
