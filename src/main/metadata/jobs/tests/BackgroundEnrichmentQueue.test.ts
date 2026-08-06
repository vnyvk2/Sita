import { describe, expect, it, vi } from 'vitest';
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
    const queue = new BackgroundEnrichmentQueue({ operationManager: opManager });

    queue.enqueueEnrichment(42);
    expect(queue.pendingCount).toBe(1);
    expect(opManager.listOperations()).toHaveLength(1);
    expect(opManager.listOperations()[0].mode).toBe('Background');
  });

  it('automatically enqueues unhealthy songs from health assessment scan', () => {
    const queue = new BackgroundEnrichmentQueue();
    const songs: SongMetadataInput[] = [
      { songId: 101, title: 'Good Song', artist: 'Artist A', album: 'Album A', hasArtwork: true, genre: 'Pop' },
      { songId: 102, artist: 'Unknown Artist' }, // Poor
      { songId: 103, title: 'Fair Song', artist: 'Artist B' } // Fair
    ];

    const count = queue.autoEnqueueUnhealthySongs(songs);
    expect(count).toBe(2);
    expect(queue.pendingCount).toBe(2);
  });

  it('executes background worker loop with retries for failed attempts', async () => {
    let callCount = 0;
    const mockHandler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 2) return false; // Fail attempt 1, succeed attempt 2
      return true;
    });

    const queue = new BackgroundEnrichmentQueue({ workerHandler: mockHandler, maxRetries: 3 });

    queue.enqueueEnrichment(201, 'song201.mp3', { title: 'drivers license', artist: 'Olivia Rodrigo' });
    queue.startWorkerLoop();

    // Process attempt 1 (fails, stays in pending for retry)
    await queue.processNextJob();
    expect(callCount).toBe(1);
    expect(queue.pendingCount).toBe(1);

    // Process attempt 2 (succeeds)
    await queue.processNextJob();
    expect(callCount).toBe(2);
    expect(queue.processedCount).toBe(1);
    expect(queue.pendingCount).toBe(0);
  });

  it('supports pausing and resuming worker processing', async () => {
    const mockHandler = vi.fn().mockResolvedValue(true);
    const queue = new BackgroundEnrichmentQueue({ workerHandler: mockHandler });

    queue.enqueueEnrichment(301, 'song301.mp3');
    queue.startWorkerLoop();
    queue.pause();

    const result = await queue.processNextJob();
    expect(result).toBe(false);
    expect(queue.isPaused).toBe(true);

    queue.resume();
    expect(queue.isPaused).toBe(false);
  });
});
