import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getAlbumsWithoutArtwork } from '../../src/main/db/queries/recovery';
import { libraryScheduler } from '../../src/main/workers/jobScheduler';
import { recoverLibraryAssets } from '../../src/main/core/recovery';

// Mock dependencies before importing
vi.mock('../../src/main/db/queries/recovery', () => ({
  getAlbumsWithoutArtwork: vi.fn().mockResolvedValue([]),
  getSongsWithoutWaveform: vi.fn().mockResolvedValue([]),
  getSongsWithoutReplayGain: vi.fn().mockResolvedValue([])
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
  beforeEach(() => {
    vi.clearAllMocks();
    libraryScheduler.start();
  });

  afterEach(() => {
    libraryScheduler.stop();
  });

  it('should not enqueue jobs if no albums are missing artwork', async () => {
    vi.mocked(getAlbumsWithoutArtwork).mockResolvedValueOnce([]);

    const enqueueSpy = vi.spyOn(libraryScheduler, 'enqueue');

    await recoverLibraryAssets();

    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('should enqueue ArtworkJobs for albums missing artwork', async () => {
    vi.mocked(getAlbumsWithoutArtwork).mockResolvedValueOnce([
      { albumId: 1, sampleSongPath: '/fake/path/song1.mp3', albumTitle: 'Album 1' },
      { albumId: 2, sampleSongPath: '/fake/path/song2.mp3', albumTitle: 'Album 2' }
    ]);

    const enqueueSpy = vi.spyOn(libraryScheduler, 'enqueue');

    await recoverLibraryAssets();

    expect(enqueueSpy).toHaveBeenCalledTimes(2);

    // Verify the enqueued jobs are of type 'artwork'
    expect(enqueueSpy.mock.calls[0][0].type).toBe('artwork');
    expect(enqueueSpy.mock.calls[1][0].type).toBe('artwork');
  });
});
