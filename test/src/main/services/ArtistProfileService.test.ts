import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ArtistProfileService } from '@main/services/ArtistProfileService';
import type { DeezerApiClient } from '@main/platform/networking/DeezerApiClient';
import * as artistsDb from '@main/db/queries/artists';
import * as lastFmInfo from '@main/other/lastFm/getArtistInfoFromLastFM';
import * as lastFmTopTracks from '@main/other/lastFm/getArtistTopTracksFromLastFM';

vi.mock('@main/db/queries/artists', () => ({
  getArtistById: vi.fn(),
  getArtistsByName: vi.fn()
}));

vi.mock('@main/other/lastFm/getArtistInfoFromLastFM', () => ({
  default: vi.fn()
}));

vi.mock('@main/other/lastFm/getArtistTopTracksFromLastFM', () => ({
  default: vi.fn()
}));

describe('ArtistProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds complete profile with Last.fm bio, top tracks with previews, and similar artists', async () => {
    (artistsDb.getArtistById as any).mockResolvedValue({
      id: 1,
      name: 'Daft Punk',
      songs: [
        { song: { id: 101, title: 'One More Time' } }
      ]
    });

    (artistsDb.getArtistsByName as any).mockResolvedValue([
      { id: 2, name: 'Justice', songs: [], albums: [], artworks: [] }
    ]);

    (lastFmInfo.default as any).mockResolvedValue({
      artist: {
        name: 'Daft Punk',
        url: 'https://last.fm/music/Daft+Punk',
        bio: { summary: 'French electronic music duo.' },
        tags: { tag: [{ name: 'electronic', url: 'https://last.fm/tag/electronic' }] },
        similar: {
          artist: [
            { name: 'Justice', url: 'https://last.fm/music/Justice' },
            { name: 'Deadmau5', url: 'https://last.fm/music/Deadmau5' }
          ]
        }
      }
    });

    (lastFmTopTracks.default as any).mockResolvedValue([
      { name: 'One More Time', listeners: '1500000', playcount: '12000000', url: 'http://last.fm/track1' },
      { name: 'Harder, Better, Faster, Stronger', listeners: '1200000', playcount: '9000000', url: 'http://last.fm/track2' }
    ]);

    const mockDeezerClient: Partial<DeezerApiClient> = {
      searchArtist: vi.fn().mockResolvedValue({ id: 27, name: 'Daft Punk', link: 'https://deezer.com/artist/27' }),
      getArtistTopTracks: vi.fn().mockResolvedValue([
        {
          id: 501,
          title: 'Harder, Better, Faster, Stronger',
          preview: 'https://preview-hbfs.mp3',
          album: { title: 'Discovery', cover_medium: 'http://cover.jpg' }
        }
      ])
    };

    const service = new ArtistProfileService(mockDeezerClient as DeezerApiClient);
    const profile = await service.getProfile(1, 'Daft Punk');

    expect(profile.artistId).toBe(1);
    expect(profile.artistName).toBe('Daft Punk');
    expect(profile.bio).toContain('French electronic music duo');
    expect(profile.tags).toHaveLength(1);
    expect(profile.tags[0].name).toBe('electronic');

    // Verify top tracks
    expect(profile.topTracks).toHaveLength(2);
    // Track 1 (One More Time) matches local DB
    expect(profile.topTracks[0].title).toBe('One More Time');
    expect(profile.topTracks[0].isInLibrary).toBe(true);
    expect(profile.topTracks[0].localSongId).toBe(101);

    // Track 2 (HBFS) not in local DB, matches Deezer preview
    expect(profile.topTracks[1].title).toBe('Harder, Better, Faster, Stronger');
    expect(profile.topTracks[1].isInLibrary).toBe(false);
    expect(profile.topTracks[1].previewUrl).toBe('https://preview-hbfs.mp3');

    // Verify similar artists split
    expect(profile.similarArtists.availableArtists).toHaveLength(1);
    expect(profile.similarArtists.availableArtists[0].name).toBe('Justice');
    expect(profile.similarArtists.unAvailableArtists).toHaveLength(1);
    expect(profile.similarArtists.unAvailableArtists[0].name).toBe('Deadmau5');

    // Verify external links
    expect(profile.externalLinks.some((l) => l.name === 'Last.fm')).toBe(true);
    expect(profile.externalLinks.some((l) => l.name === 'Deezer')).toBe(true);
    expect(profile.externalLinks.some((l) => l.name === 'MusicBrainz')).toBe(true);
    expect(profile.externalLinks.some((l) => l.name === 'Spotify')).toBe(true);
  });

  it('gracefully handles complete network failure', async () => {
    (artistsDb.getArtistById as any).mockResolvedValue({ id: 1, name: 'Offline Artist', songs: [] });
    (lastFmInfo.default as any).mockRejectedValue(new Error('Network error'));
    (lastFmTopTracks.default as any).mockRejectedValue(new Error('Network error'));

    const mockDeezerClient: Partial<DeezerApiClient> = {
      searchArtist: vi.fn().mockRejectedValue(new Error('Network error'))
    };

    const service = new ArtistProfileService(mockDeezerClient as DeezerApiClient);
    const profile = await service.getProfile(1, 'Offline Artist');

    expect(profile.artistId).toBe(1);
    expect(profile.topTracks).toHaveLength(0);
    expect(profile.tags).toHaveLength(0);
  });
});
