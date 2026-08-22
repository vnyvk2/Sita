import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ArtistDiscographyService } from '@main/services/ArtistDiscographyService';
import type { DeezerApiClient } from '@main/platform/networking/DeezerApiClient';
import * as artistsDb from '@main/db/queries/artists';

vi.mock('@main/db/queries/artists', () => ({
  getArtistById: vi.fn()
}));

describe('ArtistDiscographyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves discography and reconciles with local albums and songs', async () => {
    // Mock local artist data
    (artistsDb.getArtistById as any).mockResolvedValue({
      id: 1,
      name: 'Daft Punk',
      albums: [
        { album: { id: 10, title: 'Discovery' } }
      ],
      songs: [
        { song: { id: 101, title: 'One More Time' } }
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
          nb_tracks: 14
        },
        {
          id: 302,
          title: 'Random Access Memories',
          record_type: 'album',
          release_date: '2013-05-17',
          cover_medium: 'http://ram.jpg',
          nb_tracks: 13
        },
        {
          id: 303,
          title: 'Get Lucky',
          record_type: 'single',
          release_date: '2013-04-19',
          cover_medium: 'http://single.jpg',
          nb_tracks: 2
        },
        {
          id: 304,
          title: 'Alive 2007',
          record_type: 'compile',
          release_date: '2007-11-19',
          cover_medium: 'http://live.jpg',
          nb_tracks: 12
        }
      ])
    };

    const service = new ArtistDiscographyService(mockDeezerClient as DeezerApiClient);
    const discography = await service.getDiscography(1, 'Daft Punk');

    expect(discography.artistId).toBe(1);
    expect(discography.artistName).toBe('Daft Punk');
    expect(discography.albums).toHaveLength(2);
    expect(discography.singlesAndEPs).toHaveLength(1);
    expect(discography.compilationsAndLive).toHaveLength(1);

    // Verify Discovery is matched to local library
    const discovery = discography.albums.find((a) => a.title === 'Discovery');
    expect(discovery?.inLibraryStatus).toBe('in_library');
    expect(discovery?.localAlbumId).toBe(10);

    // Verify RAM is marked as discover
    const ram = discography.albums.find((a) => a.title === 'Random Access Memories');
    expect(ram?.inLibraryStatus).toBe('discover');
    expect(ram?.localAlbumId).toBeUndefined();
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
    (artistsDb.getArtistById as any).mockResolvedValue({ id: 99, name: 'Local Band Only' });

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
