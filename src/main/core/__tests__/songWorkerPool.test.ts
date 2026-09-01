import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tryToParseSong } from '../../parseSong/parseSong';
import { ArtworkJob } from '../../workers/jobs/artworkJob';
import { LyricsJob } from '../../workers/jobs/lyricsJob';
import { ReplayGainJob } from '../../workers/jobs/replayGainJob';
import { WaveformJob } from '../../workers/jobs/waveformJob';
import { libraryScheduler } from '../../workers/jobScheduler';
import { processSongsWithWorkerPool, type SongPoolInput } from '../songWorkerPool';

vi.mock('../../parseSong/parseSong', () => ({
  tryToParseSong: vi.fn()
}));

vi.mock('../../workers/jobScheduler', () => ({
  libraryScheduler: {
    enqueue: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}));

describe('songWorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process all songs with bounded concurrency', async () => {
    const input: SongPoolInput[] = Array.from({ length: 15 }, (_, i) => ({
      songPath: `C:\\Music\\Song_${i}.mp3`,
      folderId: 1
    }));

    let currentConcurrency = 0;
    let maxObservedConcurrency = 0;
    const concurrencyLimit = 4;

    vi.mocked(tryToParseSong).mockImplementation(async (path) => {
      currentConcurrency++;
      if (currentConcurrency > maxObservedConcurrency) {
        maxObservedConcurrency = currentConcurrency;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
      currentConcurrency--;

      const id = parseInt(path.split('_')[1], 10);
      return {
        songData: { id, title: `Song ${id}` },
        relevantAlbum: { id: 100, title: 'Album 1' }
      } as any;
    });

    const progressCalls: Array<[number, number]> = [];
    const result = await processSongsWithWorkerPool(
      input,
      undefined,
      (curr, total) => progressCalls.push([curr, total]),
      concurrencyLimit
    );

    expect(result.successCount).toBe(15);
    expect(result.errorCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(maxObservedConcurrency).toBeLessThanOrEqual(concurrencyLimit);
    expect(tryToParseSong).toHaveBeenCalledTimes(15);
    expect(progressCalls.length).toBe(15);
  });

  it('should isolate individual song failures and record error details without crashing', async () => {
    const input: SongPoolInput[] = [
      { songPath: 'C:\\Music\\Good1.mp3' },
      { songPath: 'C:\\Music\\Bad.mp3' },
      { songPath: 'C:\\Music\\Good2.mp3' }
    ];

    vi.mocked(tryToParseSong).mockImplementation(async (path) => {
      if (path.includes('Bad.mp3')) {
        throw new Error('Corrupt ID3 frame');
      }
      return {
        songData: { id: 1, title: 'Good Song' }
      } as any;
    });

    const result = await processSongsWithWorkerPool(input, undefined, undefined, 2);

    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]).toEqual({
      path: 'C:\\Music\\Bad.mp3',
      error: 'Corrupt ID3 frame'
    });
  });

  it('should record an error if tryToParseSong returns no songData', async () => {
    const input: SongPoolInput[] = [{ songPath: 'C:\\Music\\Empty.mp3' }];

    vi.mocked(tryToParseSong).mockResolvedValue(undefined);

    const result = await processSongsWithWorkerPool(input);

    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].error).toContain('tryToParseSong returned no songData');
  });

  it('should enqueue ArtworkJob per unique album and asset jobs per song upon completion', async () => {
    const input: SongPoolInput[] = [
      { songPath: 'C:\\Music\\Album1_Track1.mp3' },
      { songPath: 'C:\\Music\\Album1_Track2.mp3' },
      { songPath: 'C:\\Music\\Album2_Track1.mp3' }
    ];

    vi.mocked(tryToParseSong).mockImplementation(async (path) => {
      if (path.includes('Album1_Track1')) {
        return {
          songData: { id: 1, title: 'Track 1' },
          relevantAlbum: { id: 10, title: 'Album 1' }
        } as any;
      }
      if (path.includes('Album1_Track2')) {
        return {
          songData: { id: 2, title: 'Track 2' },
          relevantAlbum: { id: 10, title: 'Album 1' }
        } as any;
      }
      return {
        songData: { id: 3, title: 'Track 3' },
        relevantAlbum: { id: 20, title: 'Album 2' }
      } as any;
    });

    await processSongsWithWorkerPool(input);

    // Should enqueue exactly 2 ArtworkJobs (Album 10 and Album 20)
    const enqueuedJobs = vi.mocked(libraryScheduler.enqueue).mock.calls.map((call) => call[0]);
    const artworkJobs = enqueuedJobs.filter((job) => job instanceof ArtworkJob);
    const waveformJobs = enqueuedJobs.filter((job) => job instanceof WaveformJob);
    const replayGainJobs = enqueuedJobs.filter((job) => job instanceof ReplayGainJob);
    const lyricsJobs = enqueuedJobs.filter((job) => job instanceof LyricsJob);

    expect(artworkJobs).toHaveLength(2);
    expect(waveformJobs).toHaveLength(3);
    expect(replayGainJobs).toHaveLength(3);
    expect(lyricsJobs).toHaveLength(3);
  });

  it('should stop dispatching work and avoid enqueuing post-scan jobs when aborted', async () => {
    const input: SongPoolInput[] = Array.from({ length: 10 }, (_, i) => ({
      songPath: `C:\\Music\\Song_${i}.mp3`
    }));

    const controller = new AbortController();

    vi.mocked(tryToParseSong).mockImplementation(async () => {
      controller.abort();
      return {
        songData: { id: 1, title: 'Song 1' },
        relevantAlbum: { id: 1, title: 'Album 1' }
      } as any;
    });

    await processSongsWithWorkerPool(input, controller.signal, undefined, 2);

    // When aborted, post-scan asset jobs are not dispatched
    expect(libraryScheduler.enqueue).not.toHaveBeenCalled();
  });

  it('should handle empty input array cleanly', async () => {
    const result = await processSongsWithWorkerPool([]);

    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(tryToParseSong).not.toHaveBeenCalled();
  });
});
