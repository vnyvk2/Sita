import { describe, expect, it } from 'vitest';
import { MetadataQueryNormalizer } from '../MetadataQueryNormalizer';
import { MetadataSearchRankingEngine, type SearchCandidate } from '../MetadataSearchRankingEngine';

describe('MetadataSearchRankingEngine & QueryNormalizer Test Suite', () => {
  it('normalizes query strings by stripping noise suffixes like Remastered while preserving raw title', () => {
    const norm = MetadataQueryNormalizer.normalize('1989 (Taylor\'s Version) [Explicit]', 'Taylor Swift (feat. Guest)');
    expect(norm.rawTitle).toBe('1989 (Taylor\'s Version) [Explicit]');
    expect(norm.cleanTitle).toBe('1989 (Taylor\'s Version)');
    expect(norm.cleanArtist).toBe('Taylor Swift');
  });

  it('calculates string similarity using Jaro-Winkler distance', () => {
    const simExact = MetadataQueryNormalizer.compareStringSimilarity('Abbey Road', 'Abbey Road');
    expect(simExact).toBe(1.0);

    const simClose = MetadataQueryNormalizer.compareStringSimilarity('Abbey Road', 'Abbey Road (Remastered)');
    expect(simClose).toBeGreaterThanOrEqual(0.85);
  });

  it('scores and ranks generic SearchCandidate objects prioritizing official studio releases over bootlegs & compilations', () => {
    const normQuery = MetadataQueryNormalizer.normalize('SOUR', 'Olivia Rodrigo');

    const candidates: SearchCandidate[] = [
      {
        id: 'comp-1',
        title: 'SOUR Greatest Hits Compilation',
        artist: 'Olivia Rodrigo',
        status: 'Official',
        primaryType: 'Album',
        secondaryTypes: ['Compilation'],
        baseScore: 95
      },
      {
        id: 'studio-1',
        title: 'SOUR',
        artist: 'Olivia Rodrigo',
        status: 'Official',
        primaryType: 'Album',
        baseScore: 90
      },
      {
        id: 'bootleg-1',
        title: 'SOUR Live Bootleg',
        artist: 'Olivia Rodrigo',
        status: 'Bootleg',
        primaryType: 'Album',
        secondaryTypes: ['Live'],
        baseScore: 85
      }
    ];

    const ranked = MetadataSearchRankingEngine.rankCandidates(candidates, normQuery);

    expect(ranked.length).toBe(3);
    // Official Studio Album should be ranked #1
    expect(ranked[0].candidate.id).toBe('studio-1');
    expect(ranked[0].totalScore).toBeGreaterThan(ranked[1].totalScore);
    expect(ranked[1].candidate.id).toBe('comp-1');
  });
});
