import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { processSongsWithWorkerPool } from '../../../../src/main/core/songWorkerPool';
import { tryToParseSong } from '../../../../src/main/parseSong/parseSong';
import { libraryScheduler } from '../../../../src/main/workers/jobScheduler';
import { ArtworkJob } from '../../../../src/main/workers/jobs/artworkJob';

vi.mock('../../../../src/main/parseSong/parseSong', () => ({
  tryToParseSong: vi.fn()
}));

vi.mock('../../../../src/main/workers/jobScheduler', () => ({
  libraryScheduler: {
    enqueue: vi.fn()
  }
}));

vi.mock('../../../../src/main/db/db', () => ({
  db: {}
}));

describe('songWorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse songs with bounded concurrency and queue artwork jobs', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' }
    ];

    (tryToParseSong as Mock).mockResolvedValueOnce({
      newAlbum: { id: 1, title: 'Album 1' }
    }).mockResolvedValueOnce({
      relevantAlbum: { id: 2, title: 'Album 2' }
    });

    const updateProgress = vi.fn();

    await processSongsWithWorkerPool(songs, undefined, updateProgress, 2);

    expect(tryToParseSong).toHaveBeenCalledTimes(2);
    expect(tryToParseSong).toHaveBeenCalledWith('/test/1.mp3', undefined, false, false);
    expect(tryToParseSong).toHaveBeenCalledWith('/test/2.mp3', undefined, false, false);

    expect(updateProgress).toHaveBeenCalledTimes(2);

    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(2);
    // ArtworkJob arguments: albumId, path, title, scheduler
    expect(libraryScheduler.enqueue).toHaveBeenNthCalledWith(1, expect.any(ArtworkJob));
  });

  it('should deduplicate album artwork jobs', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' }
    ];

    // Both songs belong to the same album
    (tryToParseSong as Mock).mockResolvedValue({
      relevantAlbum: { id: 1, title: 'Same Album' }
    });

    await processSongsWithWorkerPool(songs, undefined, undefined, 2);

    expect(tryToParseSong).toHaveBeenCalledTimes(2);
    // Should only enqueue one artwork job for album ID 1
    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(1);
  });

  it('should abort cleanly when abortSignal is aborted', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' },
      { songPath: '/test/3.mp3' }
    ];

    const controller = new AbortController();
    
    // Abort during the first parse
    (tryToParseSong as Mock).mockImplementation(async (path) => {
      if (path === '/test/1.mp3') {
        controller.abort();
      }
      return { relevantAlbum: { id: 1, title: 'Album 1' } };
    });

    // We pass maxConcurrency = 1 to ensure it processes sequentially and stops early
    await processSongsWithWorkerPool(songs, controller.signal, undefined, 1);

    // Should only parse the first song, and stop.
    expect(tryToParseSong).toHaveBeenCalledTimes(1);
    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(0);
  });
});
