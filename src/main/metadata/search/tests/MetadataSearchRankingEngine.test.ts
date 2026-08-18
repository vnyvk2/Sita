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

  it('awards +10 track count bonus when candidate trackCount matches targetTrackCount', () => {
    const normQuery = MetadataQueryNormalizer.normalize('SOUR', 'Olivia Rodrigo');

    const candidate11Tracks: SearchCandidate = {
      id: 'sour-11',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      status: 'Official',
      primaryType: 'Album',
      trackCount: 11,
      baseScore: 90
    };

    const candidate16Tracks: SearchCandidate = {
      id: 'sour-16',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      status: 'Official',
      primaryType: 'Album',
      trackCount: 16,
      baseScore: 90
    };

    // When targetTrackCount is 11, 11-track release receives +10 bonus over identical 16-track release
    const rankedWithTarget = MetadataSearchRankingEngine.rankCandidates(
      [candidate16Tracks, candidate11Tracks],
      normQuery,
      11
    );

    expect(rankedWithTarget[0].candidate.id).toBe('sour-11');
    expect(rankedWithTarget[0].totalScore - rankedWithTarget[1].totalScore).toBe(10);
    expect(rankedWithTarget[0].breakdown.trackCountBonus).toBe(10);
    expect(rankedWithTarget[1].breakdown.trackCountBonus).toBe(0);

    // When targetTrackCount is undefined, both receive +0 bonus and have identical scores
    const rankedWithoutTarget = MetadataSearchRankingEngine.rankCandidates(
      [candidate16Tracks, candidate11Tracks],
      normQuery,
      undefined
    );

    expect(rankedWithoutTarget[0].breakdown.trackCountBonus).toBe(0);
    expect(rankedWithoutTarget[1].breakdown.trackCountBonus).toBe(0);
    expect(rankedWithoutTarget[0].totalScore).toBe(rankedWithoutTarget[1].totalScore);
  });
});
