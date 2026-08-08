import { describe, expect, it } from 'vitest';
import { MetadataQueryNormalizer } from '../MetadataQueryNormalizer';
import { MetadataSearchRankingEngine } from '../MetadataSearchRankingEngine';
import type { MusicBrainzReleaseDto } from '../../providers/musicbrainz/dto';

describe('MetadataSearchRankingEngine & QueryNormalizer Test Suite', () => {
  it('normalizes query strings by stripping noise suffixes like Deluxe Edition and Remastered', () => {
    const norm = MetadataQueryNormalizer.normalize('SOUR (Deluxe Edition) [Explicit]', 'Olivia Rodrigo (feat. Guest)');
    expect(norm.cleanTitle).toBe('SOUR');
    expect(norm.cleanArtist).toBe('Olivia Rodrigo');
    expect(norm.isDeluxeRequested).toBe(true);
  });

  it('calculates string similarity using bigram Dice coefficient', () => {
    const simExact = MetadataQueryNormalizer.compareStringSimilarity('Abbey Road', 'Abbey Road');
    expect(simExact).toBe(1.0);

    const simClose = MetadataQueryNormalizer.compareStringSimilarity('Abbey Road', 'Abbey Road (Remastered)');
    expect(simClose).toBeGreaterThanOrEqual(0.85);
  });

  it('scores and ranks official studio releases above compilations and bootlegs', () => {
    const normQuery = MetadataQueryNormalizer.normalize('SOUR', 'Olivia Rodrigo');

    const candidates: MusicBrainzReleaseDto[] = [
      {
        id: 'comp-1',
        title: 'SOUR Greatest Hits Compilation',
        status: 'Official',
        score: 95,
        'artist-credit': [{ name: 'Olivia Rodrigo' }],
        'release-group': { id: 'rg-1', 'primary-type': 'Album', 'secondary-types': ['Compilation'] }
      },
      {
        id: 'studio-1',
        title: 'SOUR',
        status: 'Official',
        score: 90,
        'artist-credit': [{ name: 'Olivia Rodrigo' }],
        'release-group': { id: 'rg-2', 'primary-type': 'Album' }
      },
      {
        id: 'bootleg-1',
        title: 'SOUR Live Bootleg',
        status: 'Bootleg',
        score: 85,
        'artist-credit': [{ name: 'Olivia Rodrigo' }],
        'release-group': { id: 'rg-3', 'primary-type': 'Album', 'secondary-types': ['Live'] }
      }
    ];

    const ranked = MetadataSearchRankingEngine.rankCandidates(candidates, normQuery);

    expect(ranked.length).toBe(3);
    // Official Studio Album should be ranked #1
    expect(ranked[0].release.id).toBe('studio-1');
    expect(ranked[0].totalScore).toBeGreaterThan(ranked[1].totalScore);
    expect(ranked[1].release.id).toBe('comp-1');
  });
});
