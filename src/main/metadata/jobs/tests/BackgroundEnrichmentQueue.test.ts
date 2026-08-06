import { describe, expect, it } from 'vitest';
import { BackgroundEnrichmentQueue, type SongMetadataInput } from '../BackgroundEnrichmentQueue';
import { MetadataOperationManager } from '../../operations/MetadataOperationManager';

describe('Background Enrichment & Library Health Assessment Test Suite', () => {
  it('evaluates individual song health scores and issues accurately', () => {
    const queue = new BackgroundEnrichmentQueue();

    const completeSong: SongMetadataInput = {
      songId: 1,
      title: 'brutal',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      hasArtwork: true,
      genre: 'Pop Rock'
    };

    const health = queue.evaluateSongHealth(completeSong);
    expect(health.score).toBe(100);
    expect(health.rating).toBe('Excellent');
    expect(health.issues).toHaveLength(0);

    const incompleteSong: SongMetadataInput = {
      songId: 2,
      artist: 'Unknown Artist'
    };

    const poorHealth = queue.evaluateSongHealth(incompleteSong);
    expect(poorHealth.score).toBeLessThan(50);
    expect(poorHealth.rating).toBe('Poor');
    expect(poorHealth.issues).toContain('Missing song title');
    expect(poorHealth.issues).toContain('Missing or generic artist');
  });

  it('assesses overall library health score across a batch of songs', () => {
    const queue = new BackgroundEnrichmentQueue();

    const songs: SongMetadataInput[] = [
      { songId: 1, title: 'Song 1', artist: 'Artist A', album: 'Album A', hasArtwork: true, genre: 'Pop' },
      { songId: 2, title: 'Song 2', artist: 'Artist B', album: 'Album B', hasArtwork: false, genre: 'Rock' }
    ];

    const report = queue.assessLibraryHealth(songs);
    expect(report.totalSongs).toBe(2);
    expect(report.missingArtworks).toBe(1);
    expect(report.overallScore).toBeGreaterThanOrEqual(80);
    expect(report.rating).toBe('Excellent');
  });

  it('enqueues background operations via MetadataOperationManager', () => {
    const opManager = new MetadataOperationManager();
    const queue = new BackgroundEnrichmentQueue(opManager);

    queue.enqueueEnrichment(42);
    expect(queue.pendingCount).toBe(1);
    expect(opManager.listOperations()).toHaveLength(1);
    expect(opManager.listOperations()[0].mode).toBe('Background');
  });
});
