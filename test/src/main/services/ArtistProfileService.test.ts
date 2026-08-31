import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ArtistProfileService } from '@main/services/ArtistProfileService';
import type { ITunesApiClient } from '@main/platform/networking/ITunesApiClient';
import type { DeezerApiClient } from '@main/platform/networking/DeezerApiClient';
import type { WikipediaApiClient } from '@main/platform/networking/WikipediaApiClient';

vi.mock('@main/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock DB queries
vi.mock('@main/db/queries/artists', () => ({
  getArtistById: vi.fn().mockResolvedValue({
    id: 1,
    artistId: 1,
    name: 'Gracie Abrams',
    artworks: [],
    songs: [
      { song: { id: 10, title: 'I Love You, I\'m Sorry', duration: 157 } }
    ],
    onlineArtworkPaths: {
      picture_xl: 'https://local-art/gracie-xl.jpg'
    }
  }),
  getArtistsByName: vi.fn().mockResolvedValue([
    {
      id: 2,
      artistId: 2,
      name: 'Taylor Swift',
      artworks: [],
      songs: [],
      onlineArtworkPaths: { picture_xl: 'https://local-art/taylor.jpg' }
    }
  ])
}));

// Mock Last.fm helpers
vi.mock('@main/other/lastFm/getArtistInfoFromLastFM', () => ({
  default: vi.fn()
}));

vi.mock('@main/other/lastFm/getArtistTopTracksFromLastFM', () => ({
  default: vi.fn()
}));

import getArtistInfoFromLastFM from '@main/other/lastFm/getArtistInfoFromLastFM';
import getArtistTopTracksFromLastFM from '@main/other/lastFm/getArtistTopTracksFromLastFM';

describe('ArtistProfileService', () => {
  let mockItunes: Partial<ITunesApiClient>;
  let mockDeezer: Partial<DeezerApiClient>;
  let mockWiki: Partial<WikipediaApiClient>;
  let service: ArtistProfileService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockItunes = {
      getArtistTopTracks: vi.fn().mockResolvedValue([
        {
          trackId: 1001,
          trackName: 'I Love You, I\'m Sorry',
          collectionName: 'The Secret of Us',
          previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
          artworkUrl600: 'https://itunes.com/art600.jpg',
          trackTimeMillis: 157000
        },
        {
          trackId: 1002,
          trackName: 'Close To You',
          collectionName: 'The Secret of Us',
          previewUrl: 'https://audio-ssl.itunes.apple.com/preview2.m4a',
          artworkUrl600: 'https://itunes.com/art600_2.jpg',
          trackTimeMillis: 225000
        }
      ])
    };

    mockDeezer = {
      searchArtist: vi.fn().mockResolvedValue({
        id: 555,
        name: 'Gracie Abrams',
        picture_xl: 'https://deezer.com/gracie-xl.jpg'
      }),
      getArtistTopTracks: vi.fn().mockResolvedValue([]),
      getRelatedArtists: vi.fn().mockResolvedValue([])
    };

    mockWiki = {
      getArtistBiography: vi.fn().mockResolvedValue({
        title: 'Gracie Abrams',
        summary: 'Gracie Madigan Abrams is an American singer-songwriter.',
        fullExtract: 'Gracie Madigan Abrams (born September 7, 1999) is an American singer-songwriter.\n\nShe released her debut studio album, Good Riddance, in 2023.\n\nHer second album, The Secret of Us, followed in 2024.',
        originalImage: 'https://upload.wikimedia.org/wikipedia/commons/gracie.jpg',
        pageUrl: 'https://en.wikipedia.org/wiki/Gracie_Abrams'
      })
    };

    service = new ArtistProfileService(
      mockItunes as ITunesApiClient,
      mockDeezer as DeezerApiClient,
      mockWiki as WikipediaApiClient
    );
  });

  it('resolves canonical profile with Last.fm bio, similar artists, external links, and local artwork precedence', async () => {
    (getArtistInfoFromLastFM as any).mockResolvedValue({
      artist: {
        name: 'Gracie Abrams',
        url: 'https://www.last.fm/music/Gracie+Abrams',
        bio: {
          content: 'Gracie Abrams (born September 7, 1999) is an American pop singer-songwriter from Los Angeles, California.\n\nAfter having only three tracks publicly available on her Soundcloud, Gracie released her debut single and critically acclaimed EP minor in 2020 followed by her sophomore record.\n\n<a href="https://www.last.fm">Read more on Last.fm</a>'
        },
        tags: { tag: [{ name: 'indie pop', url: 'https://last.fm/tag/indie+pop' }] },
        similar: {
          artist: [
            { name: 'Taylor Swift', url: 'https://last.fm/music/Taylor+Swift' },
            { name: 'Olivia Rodrigo', url: 'https://last.fm/music/Olivia+Rodrigo' }
          ]
        }
      }
    });

    (getArtistTopTracksFromLastFM as any).mockResolvedValue([
      { name: 'I Love You, I\'m Sorry', playcount: '50000', listeners: '25000', url: 'https://last.fm/track1' },
      { name: 'I Love You, I\'m Sorry (Live)', playcount: '5000', listeners: '2000', url: 'https://last.fm/track1-live' }, // should be deduplicated!
      { name: 'Close To You', playcount: '40000', listeners: '20000', url: 'https://last.fm/track2' }
    ]);

    const profile = await service.getProfile(1, 'Gracie Abrams');

    expect(profile.artistName).toBe('Gracie Abrams');
    expect(profile.bioSource).toBe('Last.fm');
    expect(profile.bioParagraphs).toHaveLength(2);
    expect(profile.featuredImage?.source).toBe('Local'); // Local artwork prioritized
    expect(profile.featuredImage?.url).toBe('https://local-art/gracie-xl.jpg');

    // Deduplication check: live version should be merged, resulting in 2 unique tracks
    expect(profile.topTracks).toHaveLength(2);
    expect(profile.topTracks[0].globalRank).toBe(1);
    expect(profile.topTracks[0].title).toBe('I Love You, I\'m Sorry');
    expect(profile.topTracks[0].isInLibrary).toBe(true);
    expect(profile.topTracks[0].localSongId).toBe(10);
    expect(profile.topTracks[0].previewUrl).toBe('https://audio-ssl.itunes.apple.com/preview.m4a');

    expect(profile.topTracks[1].globalRank).toBe(2);
    expect(profile.topTracks[1].title).toBe('Close To You');
    expect(profile.topTracks[1].isInLibrary).toBe(false);

    // Similar artists verification: Taylor Swift is in local DB, Olivia Rodrigo is unavailable locally
    expect(profile.similarArtists.availableArtists).toHaveLength(1);
    expect(profile.similarArtists.availableArtists[0].name).toBe('Taylor Swift');
    expect(profile.similarArtists.unAvailableArtists).toHaveLength(1);
    expect(profile.similarArtists.unAvailableArtists[0].name).toBe('Olivia Rodrigo');

    // External links verification
    expect(profile.externalLinks.some((l) => l.name === 'Last.fm')).toBe(true);
    expect(profile.externalLinks.some((l) => l.name === 'Wikipedia')).toBe(true);
    expect(profile.externalLinks.some((l) => l.name === 'Spotify')).toBe(true);
    expect(profile.externalLinks.some((l) => l.name === 'Bandcamp')).toBe(true);
  });

  it('falls back to Wikipedia full extract when Last.fm bio is absent or placeholder', async () => {
    (getArtistInfoFromLastFM as any).mockResolvedValue({
      artist: {
        name: 'Gracie Abrams',
        url: 'https://www.last.fm/music/Gracie+Abrams',
        bio: { content: 'Gracie Abrams does not have a biography.' }, // Quality gate rejects
        tags: { tag: [] },
        similar: { artist: [] }
      }
    });

    (getArtistTopTracksFromLastFM as any).mockResolvedValue([]);

    const profile = await service.getProfile(1, 'Gracie Abrams');

    expect(profile.bioSource).toBe('Wikipedia');
    expect(profile.bioParagraphs).toHaveLength(3);
    expect(profile.bioParagraphs[0]).toContain('Gracie Madigan Abrams');
    expect(profile.bioUrl).toBe('https://en.wikipedia.org/wiki/Gracie_Abrams');
  });

  it('shares in-flight promises for concurrent requests with the same artistId', async () => {
    (getArtistInfoFromLastFM as any).mockResolvedValue(null);
    (getArtistTopTracksFromLastFM as any).mockResolvedValue([]);

    const promise1 = service.getProfile(1, 'Gracie Abrams');
    const promise2 = service.getProfile(1, 'Gracie Abrams');

    expect(promise1).toBe(promise2); // Exact same promise reference

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toEqual(res2);
  });

  it('handles complete network failure gracefully by returning safe fallback payload', async () => {
    (getArtistInfoFromLastFM as any).mockRejectedValue(new Error('Network error'));
    (getArtistTopTracksFromLastFM as any).mockRejectedValue(new Error('Network error'));
    mockItunes.getArtistTopTracks = vi.fn().mockRejectedValue(new Error('Network error'));
    mockDeezer.searchArtist = vi.fn().mockRejectedValue(new Error('Network error'));
    mockWiki.getArtistBiography = vi.fn().mockRejectedValue(new Error('Network error'));

    const profile = await service.getProfile(1, 'Gracie Abrams');

    expect(profile.artistId).toBe(1);
    expect(profile.artistName).toBe('Gracie Abrams');
    expect(profile.bioParagraphs).toHaveLength(0);
    expect(profile.topTracks).toHaveLength(0);
    expect(profile.similarArtists.availableArtists).toHaveLength(0);
    expect(profile.similarArtists.unAvailableArtists).toHaveLength(0);
    expect(profile.externalLinks.length).toBeGreaterThan(0);
  });
});
