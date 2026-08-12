import { describe, expect, it, vi } from 'vitest';
import { BackgroundEnrichmentQueue, type SongMetadataInput, type JobPersister, type BackgroundEnrichmentJob } from '../BackgroundEnrichmentQueue';
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
    const descriptions = poorHealth.issues.map((i) => i.description);
    expect(descriptions).toContain('Missing song title');
    expect(descriptions).toContain('Missing or generic artist');
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

  it('executes background worker step with retries for failed attempts returning WorkerStepResult', async () => {
    let callCount = 0;
    const mockHandler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 2) return false; // Fail attempt 1, succeed attempt 2
      return true;
    });

    const queue = new BackgroundEnrichmentQueue({ workerHandler: mockHandler, maxRetries: 3 });

    queue.enqueueEnrichment(201, 'song201.mp3', { title: 'drivers license', artist: 'Olivia Rodrigo' });

    // Step 1: Attempt 1 fails, returns retry_scheduled
    const step1 = await queue.processNextStep();
    expect(step1.status).toBe('retry_scheduled');
    expect(callCount).toBe(1);
    expect(queue.pendingCount).toBe(1);

    // Step 2: Attempt 2 succeeds, returns processed
    const step2 = await queue.processNextStep();
    expect(step2.status).toBe('processed');
    expect(callCount).toBe(2);
    expect(queue.processedCount).toBe(1);
    expect(queue.pendingCount).toBe(0);
  });

  it('persists and restores background jobs across app restarts via JobPersister', async () => {
    const persistedStorage: BackgroundEnrichmentJob[] = [];
    const mockPersister: JobPersister = {
      saveJob: vi.fn().mockImplementation(async (j: BackgroundEnrichmentJob) => {
        persistedStorage.push(j);
      }),
      deleteJob: vi.fn().mockImplementation(async (id: string) => {
        const idx = persistedStorage.findIndex((j) => j.id === id);
        if (idx !== -1) persistedStorage.splice(idx, 1);
      }),
      loadPendingJobs: vi.fn().mockResolvedValue([
        { id: 'job-p1', songId: 501, filePath: 'song501.mp3', enqueuedAt: Date.now(), attempts: 0, maxRetries: 3, status: 'pending' }
      ])
    };

    const queue = new BackgroundEnrichmentQueue({ persister: mockPersister });
    const restored = await queue.restorePersistedJobs();

    expect(restored).toBe(1);
    expect(queue.pendingCount).toBe(1);

    queue.enqueueEnrichment(502, 'song502.mp3');
    expect(mockPersister.saveJob).toHaveBeenCalled();
  });

  it('supports pausing and resuming worker processing', async () => {
    const mockHandler = vi.fn().mockResolvedValue(true);
    const queue = new BackgroundEnrichmentQueue({ workerHandler: mockHandler });

    queue.enqueueEnrichment(301, 'song301.mp3');
    queue.pause();

    const result = await queue.processNextStep();
    expect(result.status).toBe('paused');
    expect(queue.isPaused).toBe(true);

    queue.resume();
    expect(queue.isPaused).toBe(false);
  });
});
