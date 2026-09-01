import { lyricsQuery } from '@renderer/queries/lyrics';
import { QueryClient } from '@tanstack/react-query';
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('QueryCache Retention & Rapid Skip Workload (50-100 tracks)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 2 * 60 * 1000 // 2 minutes GC
        }
      }
    });

    (window as any).api = {
      lyrics: {
        getSongLyrics: vi.fn().mockImplementation((song) => {
          // Generate realistic 100-line parsed lyrics structure
          const parsedLyrics = [];
          for (let i = 0; i < 100; i++) {
            parsedLyrics.push({
              start: i * 3,
              end: (i + 1) * 3,
              originalText: `Track ${song.songTitle} - Line ${i + 1}: Sample lyrics text for profiling memory overhead.`
            });
          }
          return Promise.resolve({
            isOfflineLyricsAvailable: false,
            lyrics: {
              copyright: 'Music Publishing Inc',
              isSynced: true,
              offset: 0,
              parsedLyrics
            }
          });
        })
      }
    };
  });

  it('measures QueryCache entry count and behavior over 100 rapid song skips', async () => {
    const queryCache = queryClient.getQueryCache();

    // Baseline memory
    const beforeHeap = process.memoryUsage().heapUsed;

    // Simulate 100 rapid song skips
    for (let trackId = 1; trackId <= 100; trackId++) {
      const queryOptions = lyricsQuery.single({
        title: `Track #${trackId}`,
        artists: [`Artist #${trackId}`],
        album: `Album #${trackId}`,
        path: `/music/track_${trackId}.flac`,
        duration: 300,
        lyricsType: 'ANY',
        lyricsRequestType: 'ANY',
        saveLyricsAutomatically: 'NONE'
      });

      await queryClient.fetchQuery(queryOptions);
    }

    const afterHeap = process.memoryUsage().heapUsed;
    const allQueries = queryCache.getAll();
    expect(allQueries.length).toBe(100);

    const heapDeltaMB = (afterHeap - beforeHeap) / (1024 * 1024);
    console.log(
      `[QueryCache Benchmark] 100 cached SongLyrics heap delta: ~${heapDeltaMB.toFixed(2)} MB`
    );

    // Verify each query data is intact
    const firstQuery = allQueries[0];
    expect(firstQuery.state.data?.lyrics?.parsedLyrics?.length).toBe(100);

    // Test eviction of inactive queries
    queryClient.removeQueries({ type: 'inactive' });
    expect(queryCache.getAll().length).toBe(0);
  });
});
