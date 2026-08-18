import { describe, expect, it, vi } from 'vitest';
import { MusicBrainzAdapter } from '@main/metadata/providers/musicbrainz/MusicBrainzAdapter';
import type { MusicBrainzApiClient } from '@main/metadata/providers/musicbrainz/MusicBrainzApiClient';
import type { MusicBrainzReleaseDto } from '@main/metadata/providers/musicbrainz/dto';
import { MetadataSearchRankingEngine } from '@main/metadata/search/MetadataSearchRankingEngine';

describe('MusicBrainzAdapter (Phase 1 Provider Fixes)', () => {
  describe('BUG-13: Multi-Disc Track Count Summation', () => {
    it('aggregates track counts across all discs in media[] instead of inspecting only media[0]', async () => {
      const mockMultiDiscRelease: MusicBrainzReleaseDto = {
        id: 'rel-double-album',
        title: 'The Wall',
        status: 'Official',
        date: '1979-11-30',
        score: 100,
        'artist-credit': [
          {
            name: 'Pink Floyd',
            artist: { id: 'art-01', name: 'Pink Floyd', 'sort-name': 'Pink Floyd' }
          }
        ],
        'release-group': {
          id: 'rg-01',
          'primary-type': 'Album'
        },
        media: [
          {
            position: 1,
            format: '12" Vinyl',
            'track-count': 13,
            'track-offset': 0
          },
          {
            position: 2,
            format: '12" Vinyl',
            'track-count': 13,
            'track-offset': 13
          }
        ]
      };

      const mockApiClient = {
        searchReleases: vi.fn().mockResolvedValue([mockMultiDiscRelease]),
        searchRecordings: vi.fn().mockResolvedValue([])
      } as unknown as MusicBrainzApiClient;

      const rankSpy = vi.spyOn(MetadataSearchRankingEngine, 'rankCandidates');
      const adapter = new MusicBrainzAdapter(mockApiClient);
      const results = await adapter.searchAlbums('The Wall', 'Pink Floyd', 5, 26);

      expect(results).toHaveLength(1);
      expect(mockApiClient.searchReleases).toHaveBeenCalled();

      // Ensure that when rankCandidates evaluated the candidate, total trackCount was 26 (13 + 13)
      expect(rankSpy).toHaveBeenCalled();
      const candidatesPassedToRanking = rankSpy.mock.calls[0][0];
      expect(candidatesPassedToRanking[0].trackCount).toBe(26);
      expect(results[0].trackCount).toBe(26);
      expect(results[0].title).toBe('The Wall');
    });

    it('falls back to rel.track-count if present and handles single-disc releases gracefully', async () => {
      const mockSingleDiscRelease: MusicBrainzReleaseDto = {
        id: 'rel-single-album',
        title: 'Animals',
        status: 'Official',
        date: '1977-01-23',
        'track-count': 5,
        score: 100,
        'artist-credit': [
          {
            name: 'Pink Floyd',
            artist: { id: 'art-01', name: 'Pink Floyd', 'sort-name': 'Pink Floyd' }
          }
        ],
        'release-group': {
          id: 'rg-02',
          'primary-type': 'Album'
        },
        media: [
          {
            position: 1,
            format: '12" Vinyl',
            'track-count': 5,
            'track-offset': 0
          }
        ]
      };

      const mockApiClient = {
        searchReleases: vi.fn().mockResolvedValue([mockSingleDiscRelease])
      } as unknown as MusicBrainzApiClient;

      const adapter = new MusicBrainzAdapter(mockApiClient);
      const results = await adapter.searchAlbums('Animals', 'Pink Floyd', 5, 5);

      expect(results).toHaveLength(1);
      expect(results[0].trackCount).toBe(5);
      expect(results[0].title).toBe('Animals');
    });
  });
});
