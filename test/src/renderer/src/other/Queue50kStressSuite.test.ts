// @vitest-environment jsdom
import PlayerQueue from '@renderer/other/playerQueue';
import {
  calculateQueueSuffixDurations,
  getRemainingQueueDuration
} from '@renderer/utils/queueDuration';
import { afterAll, describe, expect, it, vi } from 'vitest';

type BenchmarkRecord = {
  operation: string;
  n: string;
  timeMs: string;
  versionDelta: string;
  eventCount: string;
};

const benchmarkResults: BenchmarkRecord[] = [];

const recordBenchmark = (
  operation: string,
  n: number | string,
  startTime: number,
  endTime: number,
  versionDelta = '+1',
  eventCount = '1'
) => {
  const elapsed = (endTime - startTime).toFixed(2);
  benchmarkResults.push({
    operation,
    n: typeof n === 'number' ? (n >= 1000 ? `${n / 1000}k` : `${n}`) : n,
    timeMs: `${elapsed} ms`,
    versionDelta,
    eventCount
  });
};

describe('Phase 6: Automated 50k Queue Stress Suite & Performance Instrumentation', () => {
  afterAll(() => {
    // Print formatted benchmark summary table
    console.log('\n========================================================================');
    console.log('               NORA QUEUE 50K/100K PERFORMANCE BENCHMARK REPORT          ');
    console.log('========================================================================');
    console.table(benchmarkResults);
    console.log('========================================================================\n');
  });

  describe('1. Multi-Tier Scale Benchmarks (1k, 10k, 50k, 100k)', () => {
    const tiers = [1000, 10000, 50000, 100000];

    for (const N of tiers) {
      it(`benchmarks single-pass batch removal at N = ${N}`, () => {
        const songIds = Array.from({ length: N }, (_, i) => i + 1);
        const q = new PlayerQueue(songIds, Math.floor(N / 2));
        const toRemovePositions = new Set(
          Array.from({ length: Math.min(500, Math.floor(N / 10)) }, (_, i) => i * 2)
        );

        const initialStructure = q.structureVersion;
        const initialMembership = q.membershipVersion;

        const t0 = performance.now();
        const success = q.removeSongsAtPositions(toRemovePositions);
        const t1 = performance.now();

        expect(success).toBe(true);
        expect(q.structureVersion).toBe(initialStructure + 1);
        expect(q.membershipVersion).toBe(initialMembership + 1);

        recordBenchmark('removeSongsAtPositions (500)', N, t0, t1);
      });

      it(`benchmarks atomic playNext at N = ${N}`, () => {
        const songIds = Array.from({ length: N }, (_, i) => i + 1);
        const q = new PlayerQueue(songIds, Math.floor(N / 2));
        const incomingIds = [N - 1, N - 2, N - 3, N - 4, N - 5];

        const initialStructure = q.structureVersion;
        const initialMembership = q.membershipVersion;

        const t0 = performance.now();
        q.playNext(incomingIds);
        const t1 = performance.now();

        expect(q.structureVersion).toBe(initialStructure + 1);
        expect(q.membershipVersion).toBe(initialMembership); // pure reorder

        recordBenchmark('playNext existing reorder (5)', N, t0, t1, '+1 s / +0 m');
      });

      it(`benchmarks O(N) Fisher-Yates shuffle and restore at N = ${N}`, () => {
        const originalQueue = Array.from({ length: N }, (_, i) => i + 1);
        const currentSong = originalQueue[Math.floor(N / 2)];
        const q = new PlayerQueue([...originalQueue], Math.floor(N / 2));

        const t0 = performance.now();
        const { shuffledQueue, positions } = q.shuffle();
        const t1 = performance.now();

        expect(shuffledQueue.length).toBe(N);
        expect(shuffledQueue[0]).toBe(currentSong);

        recordBenchmark('shuffle (O(N) index tracking)', N, t0, t1);

        const t2 = performance.now();
        q.restoreFromPositions(positions, currentSong);
        const t3 = performance.now();

        expect(q.songIds).toEqual(originalQueue);
        recordBenchmark('restoreFromPositions', N, t2, t3);
      });

      it(`benchmarks toJSON() serialization at N = ${N}`, () => {
        const songIds = Array.from({ length: N }, (_, i) => i + 1);
        const q = new PlayerQueue(songIds, Math.floor(N / 2));

        const t0 = performance.now();
        const serialized = q.toJSON();
        const t1 = performance.now();

        expect(serialized.songIds.length).toBe(N);
        recordBenchmark('toJSON() serialization', N, t0, t1, 'N/A', 'N/A');
      });
    }
  });

  describe('2. Batch Removal Invariants under 50k Load', () => {
    it('removes 5,000 scattered positions from a 50,000 song queue with strict invariants', () => {
      const N = 50000;
      const songIds = Array.from({ length: N }, (_, i) => i + 1000);
      const activeIndex = 25005;
      const activeSongId = songIds[activeIndex];

      const q = new PlayerQueue(songIds, activeIndex);
      const queueChangeSpy = vi.fn();
      const positionChangeSpy = vi.fn();
      q.on('queueChange', queueChangeSpy);
      q.on('positionChange', positionChangeSpy);

      const initialStructure = q.structureVersion;
      const initialMembership = q.membershipVersion;

      // Remove every 10th position (5,000 items total: 0, 10, 20, ..., 49990)
      const positionsToRemove = new Set(Array.from({ length: 5000 }, (_, i) => i * 10));

      const t0 = performance.now();
      const success = q.removeSongsAtPositions(positionsToRemove);
      const t1 = performance.now();

      expect(success).toBe(true);
      expect(q.songIds.length).toBe(45000);

      // Invariant 1: Versions increment by exactly +1 (not +5,000)
      expect(q.structureVersion).toBe(initialStructure + 1);
      expect(q.membershipVersion).toBe(initialMembership + 1);

      // Invariant 2: Exactly 1 queueChange event emitted
      expect(queueChangeSpy).toHaveBeenCalledTimes(1);

      // Invariant 3: Active song preserved without out-of-bounds drift
      // 2,501 items were removed before activeIndex (25,005 - 2,501 = 22,504)
      expect(q.position).toBe(22504);
      expect(q.currentSongId).toBe(activeSongId);
      expect(q.songIds[22504]).toBe(activeSongId);

      recordBenchmark('remove 5,000 positions', N, t0, t1);
    });

    it('removes 2,500 distinct IDs from a 50,000 song queue with duplicate multiplicities', () => {
      const N = 50000;
      // 5,000 unique IDs repeated 10 times = 50,000 items
      const songIds = Array.from({ length: N }, (_, i) => (i % 5000) + 1);
      const q = new PlayerQueue(songIds, 25000);

      const queueChangeSpy = vi.fn();
      q.on('queueChange', queueChangeSpy);

      // Remove IDs 1 to 2,500 (removes 2,500 * 10 = 25,000 items in total)
      const idsToRemove = new Set(Array.from({ length: 2500 }, (_, i) => i + 1));

      const t0 = performance.now();
      const success = q.removeSongIds(idsToRemove);
      const t1 = performance.now();

      expect(success).toBe(true);
      expect(q.songIds.length).toBe(25000);

      // Remaining IDs should only be in [2501, 5000]
      const minId = Math.min(...q.songIds.slice(0, 100));
      expect(minId).toBeGreaterThan(2500);

      expect(q.structureVersion).toBe(1);
      expect(q.membershipVersion).toBe(1);
      expect(queueChangeSpy).toHaveBeenCalledTimes(1);

      recordBenchmark('remove 25,000 duplicate items by ID', N, t0, t1);
    });
  });

  describe('3. Heavy-Duplicate Occurrence-Preserving Shuffle & Restore (50k & 100k)', () => {
    it('accurately shuffles and restores 50 unique IDs repeated 1,000 times (50,000 items)', () => {
      const N = 50000;
      // 50 unique IDs repeated 1,000 times
      const originalQueue = Array.from({ length: N }, (_, i) => (i % 50) + 1);
      const activePosition = 12345;
      const currentSong = originalQueue[activePosition];

      const q = new PlayerQueue([...originalQueue], activePosition);

      const t0 = performance.now();
      const { shuffledQueue, positions } = q.shuffle();
      const t1 = performance.now();

      expect(shuffledQueue.length).toBe(N);
      expect(shuffledQueue[0]).toBe(currentSong);
      expect(q.position).toBe(0);

      recordBenchmark('shuffle 50k heavy duplicates', N, t0, t1);

      const t2 = performance.now();
      q.restoreFromPositions(positions, currentSong);
      const t3 = performance.now();

      // Proves 100% exact occurrence identity restoration (not just multiset equality)
      expect(q.songIds).toEqual(originalQueue);
      expect(q.position).toBe(activePosition);
      expect(q.currentSongId).toBe(currentSong);

      recordBenchmark('restore 50k heavy duplicates', N, t2, t3);
    });
  });

  describe('4. Active Position Boundary Extremes at 50,000 Scale', () => {
    it('handles removal and playNext when active position is at the very beginning (0)', () => {
      const q = new PlayerQueue(Array.from({ length: 50000 }, (_, i) => i + 1), 0);
      expect(q.currentSongId).toBe(1);

      // playNext with song 50000
      q.playNext([50000]);
      expect(q.position).toBe(0);
      expect(q.currentSongId).toBe(1);
      expect(q.songIds[1]).toBe(50000);

      // Remove position 0 (active song)
      q.removeSongsAtPositions([0]);
      expect(q.position).toBe(0);
      expect(q.currentSongId).toBe(50000);
    });

    it('handles removal and playNext when active position is at the very end (N - 1)', () => {
      const N = 50000;
      const q = new PlayerQueue(Array.from({ length: N }, (_, i) => i + 1), N - 1);
      expect(q.currentSongId).toBe(N);

      // Remove active song at end
      q.removeSongsAtPositions([N - 1]);
      expect(q.position).toBe(N - 2);
      expect(q.currentSongId).toBe(N - 1);

      // playNext at end
      q.playNext([999999]);
      expect(q.position).toBe(N - 2);
      expect(q.songIds[N - 1]).toBe(999999);
    });
  });

  describe('5. Production Suffix-Sum Duration Engine Benchmark (50k & 100k)', () => {
    const scales = [50000, 100000];

    for (const N of scales) {
      it(`benchmarks single backward pass Float64Array suffix calculation at N = ${N}`, () => {
        const songIds = Array.from({ length: N }, (_, i) => (i % 1000) + 1);
        // Build mock queuedSongsMap
        const queuedSongsMap = new Map<number, { duration: number }>();
        for (let id = 1; id <= 1000; id++) {
          queuedSongsMap.set(id, { duration: 180 + (id % 120) });
        }

        // Execute exact production suffix sum computation from queueDuration utility
        const t0 = performance.now();
        const { suffixDurations, queueDuration } = calculateQueueSuffixDurations(
          songIds,
          queuedSongsMap
        );
        const t1 = performance.now();

        expect(suffixDurations).not.toBeNull();
        expect(suffixDurations!.length).toBe(N);
        expect(queueDuration).not.toBe('0:00');

        // Verify O(1) remaining duration query
        const queryPos = Math.floor(N / 2);
        const remainingDuration = getRemainingQueueDuration(suffixDurations, queryPos);
        expect(remainingDuration).not.toBe('0:00');

        recordBenchmark('suffix sum duration (backward pass)', N, t0, t1, 'O(1) query', 'N/A');
      });
    }
  });
});
