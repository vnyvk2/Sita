import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../../src/main/db/queries/recovery', () => ({
  getAlbumsWithoutArtwork: vi.fn(),
}));

vi.mock('../../src/main/db/queries/genres', () => ({
  reconcileExistingMultiGenres: vi.fn().mockResolvedValue({ reconciledCount: 0 })
}));

vi.mock('../../src/main/workers/jobs/artworkJob', () => {
  return {
    ArtworkJob: class {
      id: string;
      type = 'artwork';
      albumId: number;
      path: string;
      execute = vi.fn();
      
      constructor(albumId: number, path: string) {
        this.id = `artwork_${albumId}`;
        this.albumId = albumId;
        this.path = path;
      }
    }
  };
});

describe('Crash Recovery (Startup Sync)', () => {
  let recoverLibraryAssets: typeof import('../../src/main/core/recovery').recoverLibraryAssets;
  let getAlbumsWithoutArtwork: any;
  let JobScheduler: any;
  let scheduler: any;

  beforeEach(async () => {
    vi.resetModules();
    
    // Import mocked module
    const recoveryQueries = await import('../../src/main/db/queries/recovery');
    getAlbumsWithoutArtwork = recoveryQueries.getAlbumsWithoutArtwork;
    
    const jobSchedulerModule = await import('../../src/main/workers/jobScheduler');
    JobScheduler = jobSchedulerModule.JobScheduler;
    scheduler = jobSchedulerModule.libraryScheduler;
    
    const recoveryModule = await import('../../src/main/core/recovery');
    recoverLibraryAssets = recoveryModule.recoverLibraryAssets;
    
    scheduler.start();
  });

  afterEach(() => {
    scheduler.stop();
    vi.clearAllMocks();
  });

  it('should not enqueue jobs if no albums are missing artwork', async () => {
    getAlbumsWithoutArtwork.mockResolvedValueOnce([]);
    
    const enqueueSpy = vi.spyOn(scheduler, 'enqueue');
    
    await recoverLibraryAssets();
    
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('should enqueue ArtworkJobs for albums missing artwork', async () => {
    getAlbumsWithoutArtwork.mockResolvedValueOnce([
      { albumId: 1, sampleSongPath: '/fake/path/song1.mp3' },
      { albumId: 2, sampleSongPath: '/fake/path/song2.mp3' }
    ]);
    
    const enqueueSpy = vi.spyOn(scheduler, 'enqueue');
    
    await recoverLibraryAssets();
    
    expect(enqueueSpy).toHaveBeenCalledTimes(2);
    
    // Verify the enqueued jobs are of type 'artwork'
    expect(enqueueSpy.mock.calls[0][0].type).toBe('artwork');
    expect(enqueueSpy.mock.calls[1][0].type).toBe('artwork');
  });
});
