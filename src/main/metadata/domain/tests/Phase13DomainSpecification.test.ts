import { describe, expect, it } from 'vitest';
import { MetadataOperation } from '../MetadataOperation';
import { MetadataPolicy } from '../MetadataPolicy';
import { MetadataHealthEvaluator } from '../MetadataHealth';

describe('Phase 13A — Domain Model & Specification Blueprint Test Suite', () => {
  it('correctly tracks MetadataOperation lifecycle state transitions', () => {
    const policy = MetadataPolicy.createDefaultGlobalPolicy();
    const op = new MetadataOperation('op-101', 'AlbumResolution', 'Interactive', policy);

    expect(op.state).toBe('Created');
    expect(op.startedAt).toBeUndefined();

    op.transitionTo('Searching', 'Searching provider candidates...', 15);
    expect(op.state).toBe('Searching');
    expect(op.startedAt).toBeDefined();

    op.transitionTo('PreviewReady', 'Preview generated', 50);
    expect(op.state).toBe('PreviewReady');

    op.transitionTo('Completed', 'Metadata applied successfully', 100);
    expect(op.state).toBe('Completed');
    expect(op.completedAt).toBeDefined();
  });

  it('evaluates declarative MetadataPolicy priorities and field rules', () => {
    const policy = new MetadataPolicy({
      level: 'operation',
      defaultProviderId: 'musicbrainz',
      providerPriorities: { user: 1000, discogs: 600, musicbrainz: 500 },
      fieldRules: {
        genre: { fieldId: 'genre', preferredProviderId: 'discogs' }
      }
    });

    expect(policy.resolveFieldProvider('title')).toBe('musicbrainz');
    expect(policy.resolveFieldProvider('genre')).toBe('discogs');
    expect(policy.compareProviderPriority('discogs', 'musicbrainz')).toBeLessThan(0); // discogs (600) higher priority than musicbrainz (500)
  });

  it('evaluates MetadataHealth quality scoring accurately', () => {
    const health = MetadataHealthEvaluator.evaluateTrackHealth({
      songId: 1,
      path: 'song.mp3',
      title: 'brutal',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      artworkPath: 'cover.jpg',
      year: 2021,
      genre: 'Pop'
    });

    expect(health.score).toBe(100);
    expect(health.rating).toBe('Excellent');
    expect(health.issues).toHaveLength(0);

    const poorHealth = MetadataHealthEvaluator.evaluateTrackHealth({
      songId: 2,
      path: 'song2.mp3',
      title: 'Track 01',
      artist: 'Unknown Artist'
    });

    expect(poorHealth.score).toBeLessThan(60);
    expect(poorHealth.rating).toBe('Poor');
    expect(poorHealth.issues).toContain('Missing or unformatted title');
  });
});
