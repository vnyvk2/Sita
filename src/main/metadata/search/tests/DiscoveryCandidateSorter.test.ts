import { describe, expect, it } from 'vitest';
import { DiscoveryCandidateSorter } from '../DiscoveryCandidateSorter';
import { MatchQualityBand, type ScoredSearchCandidate } from '../MetadataSearchRankingEngine';

function createMockScoredCandidate(params: {
  id: string;
  title: string;
  artist: string;
  provider: string;
  totalScore: number;
  artistScore?: number;
  titleScore?: number;
  trackCountBonus?: number;
  statusScore?: number;
  primaryTypeScore?: number;
}): { album: any; scored: ScoredSearchCandidate } {
  return {
    album: {
      title: params.title,
      artist: params.artist,
      provider: params.provider as any,
      releaseId: params.id
    },
    scored: {
      candidate: {
        id: params.id,
        title: params.title,
        artist: params.artist,
        baseScore: 80
      },
      totalScore: params.totalScore,
      breakdown: {
        baseScore: 80,
        artistScore: params.artistScore ?? 30,
        titleScore: params.titleScore ?? 30,
        statusScore: params.statusScore ?? 20,
        primaryTypeScore: params.primaryTypeScore ?? 15,
        secondaryTypePenalty: 0,
        trackCountBonus: params.trackCountBonus ?? 10,
        editionBoost: 0
      }
    }
  };
}

describe('DiscoveryCandidateSorter', () => {
  it('enforces that a lower-priority definitive candidate outranks a higher-priority weak candidate', () => {
    // Discogs is Priority #1, MusicBrainz is Priority #2
    const priority = ['discogs', 'musicbrainz'] as any[];

    // Candidate A: Discogs weak bootleg (Priority #1, but weak quality band: score 90, poor title/artist)
    const weakDiscogs = createMockScoredCandidate({
      id: 'dg-weak-1',
      title: 'SOUR (Live Bootleg)',
      artist: 'Olivia',
      provider: 'discogs',
      totalScore: 90,
      artistScore: 10,
      titleScore: 10,
      trackCountBonus: 0,
      statusScore: -25
    });

    // Candidate B: MusicBrainz definitive studio release (Priority #2, but definitive quality band: score 195, exact match)
    const definitiveMB = createMockScoredCandidate({
      id: 'mb-def-1',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      provider: 'musicbrainz',
      totalScore: 195,
      artistScore: 30,
      titleScore: 30,
      trackCountBonus: 10,
      statusScore: 20
    });

    const sorted = DiscoveryCandidateSorter.sortCandidates([weakDiscogs, definitiveMB], priority);

    // Definitive MB must beat weak Discogs despite user's Discogs priority bias
    expect(sorted[0].album.releaseId).toBe('mb-def-1');
    expect(sorted[0].qualityBand).toBe(MatchQualityBand.Definitive);
    expect(sorted[1].album.releaseId).toBe('dg-weak-1');
    expect(sorted[1].qualityBand).toBe(MatchQualityBand.Weak);
  });

  it('uses user source priority as the decisive tie-breaker between equal quality-band candidates', () => {
    // Discogs is Priority #1, MusicBrainz is Priority #2
    const priority = ['discogs', 'musicbrainz'] as any[];

    const definitiveMB = createMockScoredCandidate({
      id: 'mb-def-1',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      provider: 'musicbrainz',
      totalScore: 195
    });

    const definitiveDiscogs = createMockScoredCandidate({
      id: 'dg-def-1',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      provider: 'discogs',
      totalScore: 190
    });

    // Both are in Definitive band. Discogs should rank first because of priority
    const sorted = DiscoveryCandidateSorter.sortCandidates([definitiveMB, definitiveDiscogs], priority);

    expect(sorted[0].album.releaseId).toBe('dg-def-1');
    expect(sorted[0].explainability.isPreferredSource).toBe(true);
    expect(sorted[1].album.releaseId).toBe('mb-def-1');
    expect(sorted[1].explainability.isPreferredSource).toBe(false);
  });

  it('ranks by intrinsic raw score when quality band and source priority are identical', () => {
    const candidateA = createMockScoredCandidate({
      id: 'mb-1',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      provider: 'musicbrainz',
      totalScore: 195
    });

    const candidateB = createMockScoredCandidate({
      id: 'mb-2',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      provider: 'musicbrainz',
      totalScore: 175
    });

    const sorted = DiscoveryCandidateSorter.sortCandidates([candidateB, candidateA], ['musicbrainz'] as any);
    expect(sorted[0].album.releaseId).toBe('mb-1');
    expect(sorted[1].album.releaseId).toBe('mb-2');
  });
});
