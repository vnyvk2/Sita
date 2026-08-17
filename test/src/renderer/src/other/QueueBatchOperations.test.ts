// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import PlayerQueue from '@renderer/other/playerQueue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Phase 5: Batch Queue Operations & Algorithmic Optimizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Single-Pass Batch Removal: removeSongsAtPositions', () => {
    it('returns false and does not mutate or bump versions on empty or out-of-bounds inputs', () => {
      const q = new PlayerQueue([101, 102, 103], 1);
      const initialStructureVersion = q.structureVersion;
      const initialMembershipVersion = q.membershipVersion;

      // Empty set
      expect(q.removeSongsAtPositions(new Set())).toBe(false);
      expect(q.songIds).toEqual([101, 102, 103]);
      expect(q.position).toBe(1);
      expect(q.structureVersion).toBe(initialStructureVersion);
      expect(q.membershipVersion).toBe(initialMembershipVersion);

      // Out of bounds positions
      expect(q.removeSongsAtPositions([-1, 99, 100])).toBe(false);
      expect(q.songIds).toEqual([101, 102, 103]);
      expect(q.position).toBe(1);
      expect(q.structureVersion).toBe(initialStructureVersion);
      expect(q.membershipVersion).toBe(initialMembershipVersion);
    });

    it('correctly shifts position when removing songs strictly before current position', () => {
      // Queue: [100, 101, 102, 103, 104], position: 3 (song 103)
      const q = new PlayerQueue([100, 101, 102, 103, 104], 3);
      const queueChangeSpy = vi.fn();
      const positionChangeSpy = vi.fn();
      q.on('queueChange', queueChangeSpy);
      q.on('positionChange', positionChangeSpy);

      // Remove indices 0 and 1 (songs 100 and 101)
      const success = q.removeSongsAtPositions([0, 1]);
      expect(success).toBe(true);
      expect(q.songIds).toEqual([102, 103, 104]);
      // Active song was 103 (index 3). 2 items removed before it -> new index = 1
      expect(q.position).toBe(1);
      expect(q.currentSongId).toBe(103);
      expect(q.structureVersion).toBe(1);
      expect(q.membershipVersion).toBe(1);
      expect(queueChangeSpy).toHaveBeenCalledTimes(1);
      expect(positionChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('retains position index when removing songs strictly after current position', () => {
      // Queue: [100, 101, 102, 103, 104], position: 1 (song 101)
      const q = new PlayerQueue([100, 101, 102, 103, 104], 1);
      const positionChangeSpy = vi.fn();
      q.on('positionChange', positionChangeSpy);

      // Remove indices 3 and 4
      const success = q.removeSongsAtPositions([3, 4]);
      expect(success).toBe(true);
      expect(q.songIds).toEqual([100, 101, 102]);
      expect(q.position).toBe(1);
      expect(q.currentSongId).toBe(101);
      expect(q.structureVersion).toBe(1);
      expect(q.membershipVersion).toBe(1);
      // Position index didn't change and current song was not removed -> no positionChange event
      expect(positionChangeSpy).not.toHaveBeenCalled();
    });

    it('correctly clamps position when active song is removed', () => {
      // Queue: [100, 101, 102, 103], position: 2 (song 102)
      const q = new PlayerQueue([100, 101, 102, 103], 2);
      const positionChangeSpy = vi.fn();
      q.on('positionChange', positionChangeSpy);

      // Remove active song (index 2) along with index 0
      const success = q.removeSongsAtPositions([0, 2]);
      expect(success).toBe(true);
      expect(q.songIds).toEqual([101, 103]);
      // Old pos was 2. 1 removed before it -> new index slot is 2 - 1 = 1 (song 103)
      expect(q.position).toBe(1);
      expect(q.currentSongId).toBe(103);
      expect(positionChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('resets position to 0 when all songs are removed', () => {
      const q = new PlayerQueue([100, 101, 102], 2);
      const success = q.removeSongsAtPositions([0, 1, 2]);
      expect(success).toBe(true);
      expect(q.songIds).toEqual([]);
      expect(q.position).toBe(0);
      expect(q.currentSongId).toBeNull();
    });

    it('removes first, active, and last positions simultaneously', () => {
      // Queue: [10, 20, 30, 40, 50], position: 2 (30)
      const q = new PlayerQueue([10, 20, 30, 40, 50], 2);
      // Remove index 0 (10), index 2 (30 - active), index 4 (50)
      const success = q.removeSongsAtPositions([0, 2, 4]);
      expect(success).toBe(true);
      expect(q.songIds).toEqual([20, 40]);
      // Active was 2. 1 removed before -> slot index 1 (40)
      expect(q.position).toBe(1);
      expect(q.currentSongId).toBe(40);
    });
  });

  describe('2. Single-Pass Batch Removal: removeSongIds with Duplicates', () => {
    it('removes all occurrences of duplicate IDs in a single pass', () => {
      const q = new PlayerQueue([10, 20, 10, 30, 10], 3); // position 3 is song 30
      const success = q.removeSongIds([10]);
      expect(success).toBe(true);
      expect(q.songIds).toEqual([20, 30]);
      // Before index 3 (30), two 10s were removed -> new position = 3 - 2 = 1 (30)
      expect(q.position).toBe(1);
      expect(q.currentSongId).toBe(30);
      expect(q.structureVersion).toBe(1);
      expect(q.membershipVersion).toBe(1);
    });

    it('returns false and performs no-op when none of the IDs exist in queue', () => {
      const q = new PlayerQueue([10, 20, 30], 1);
      expect(q.removeSongIds([999, 888])).toBe(false);
      expect(q.songIds).toEqual([10, 20, 30]);
      expect(q.position).toBe(1);
      expect(q.structureVersion).toBe(0);
      expect(q.membershipVersion).toBe(0);
    });
  });

  describe('3. Batch vs. Sequential Removal Equivalence', () => {
    it('produces identical songIds and position as sequential removal across varied scenarios', () => {
      // Test across multiple deterministic configurations
      const scenarios = [
        { initial: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], pos: 5, removePositions: [1, 3, 5, 7] },
        { initial: [5, 4, 3, 2, 1], pos: 0, removePositions: [0, 2, 4] },
        { initial: [10, 20, 30, 40, 50], pos: 4, removePositions: [0, 1, 2, 3] },
        { initial: [1, 2, 1, 2, 1, 2], pos: 3, removePositions: [0, 1, 4] }
      ];

      for (const { initial, pos, removePositions } of scenarios) {
        const batchQ = new PlayerQueue([...initial], pos);
        batchQ.removeSongsAtPositions(new Set(removePositions));

        // Sequential removal from high index to low index to maintain valid indices
        const seqQ = new PlayerQueue([...initial], pos);
        const sortedDesc = [...removePositions].sort((a, b) => b - a);
        for (const p of sortedDesc) {
          seqQ.removeSongAtPosition(p);
        }

        expect(batchQ.songIds).toEqual(seqQ.songIds);
        expect(batchQ.position).toBe(seqQ.position);
        expect(batchQ.currentSongId).toBe(seqQ.currentSongId);
      }
    });
  });

  describe('4. Batch playNext with Incoming Duplicates & Existing Queue Cleanup', () => {
    it('removes existing occurrences and inserts incoming batch cleanly', () => {
      // Queue: [100, 101, 102, 103, 104], playing 101 (position 1)
      const q = new PlayerQueue([100, 101, 102, 103, 104], 1);

      // playNext with IDs [104, 102, 104] (contains duplicate in incoming batch)
      q.playNext([104, 102, 104]);

      // 102 and 104 were removed from old positions, and inserted right after 101 (pos 1)
      // Remaining before insertion: [100, 101, 103], position 1 (101)
      // Inserted after pos 1: [104, 102, 104]
      // Expected: [100, 101, 104, 102, 104, 103]
      expect(q.songIds).toEqual([100, 101, 104, 102, 104, 103]);
      expect(q.position).toBe(1);
      expect(q.currentSongId).toBe(101);
    });

    it('executes playNext atomically with exactly +1 version increment and 1 queueChange event', () => {
      const q = new PlayerQueue([100, 101, 102, 103, 104], 1);
      const queueChangeSpy = vi.fn();
      const positionChangeSpy = vi.fn();
      q.on('queueChange', queueChangeSpy);
      q.on('positionChange', positionChangeSpy);

      const initialStructureVersion = q.structureVersion;
      const initialMembershipVersion = q.membershipVersion;

      // playNext with multiple tracks
      q.playNext([104, 102, 104]);

      // Must be atomic: exactly +1, not +2
      expect(q.structureVersion).toBe(initialStructureVersion + 1);
      expect(q.membershipVersion).toBe(initialMembershipVersion + 1);
      expect(queueChangeSpy).toHaveBeenCalledTimes(1);

      // Position remained on song 101 at index 1 -> no spurious positionChange event
      expect(positionChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('5. Occurrence-Preserving O(N) Shuffle & Restore with Duplicates', () => {
    it('correctly shuffles and restores exact sequence with duplicate song IDs', () => {
      const originalQueue = [10, 20, 10, 30, 20, 10, 40];
      const q = new PlayerQueue([...originalQueue], 3); // current is 30 at index 3

      const { shuffledQueue, positions } = q.shuffle();

      // Shuffled queue keeps current song (30) at index 0
      expect(shuffledQueue[0]).toBe(30);
      expect(q.position).toBe(0);
      expect(q.currentSongId).toBe(30);
      expect(shuffledQueue.length).toBe(originalQueue.length);

      // Multiset equality: sorted items match exactly
      expect([...shuffledQueue].sort()).toEqual([...originalQueue].sort());

      // Restore from position mapping
      q.restoreFromPositions(positions, 30);
      expect(q.songIds).toEqual(originalQueue);
      expect(q.position).toBe(3);
      expect(q.currentSongId).toBe(30);
    });

    it('shuffles and restores large queues (10,000 items) accurately', () => {
      const largeQueue = Array.from({ length: 10000 }, (_, i) => (i % 500) + 1);
      const q = new PlayerQueue([...largeQueue], 250);

      const { shuffledQueue, positions } = q.shuffle();
      expect(shuffledQueue.length).toBe(10000);
      expect(shuffledQueue[0]).toBe(largeQueue[250]);

      q.restoreFromPositions(positions, largeQueue[250]);
      expect(q.songIds).toEqual(largeQueue);
      expect(q.position).toBe(250);
    });
  });

  describe('6. Version & Event Invariant for Batch Operations', () => {
    it('increments versions exactly once and emits exactly one queueChange event per batch', () => {
      const largeQueue = Array.from({ length: 5000 }, (_, i) => i + 1);
      const q = new PlayerQueue(largeQueue, 2500);

      const queueChangeSpy = vi.fn();
      q.on('queueChange', queueChangeSpy);

      const toRemovePositions = new Set(Array.from({ length: 500 }, (_, i) => i * 2));
      const initialStructureVersion = q.structureVersion;
      const initialMembershipVersion = q.membershipVersion;

      q.removeSongsAtPositions(toRemovePositions);

      // Versions must increment by exactly +1, not +500
      expect(q.structureVersion).toBe(initialStructureVersion + 1);
      expect(q.membershipVersion).toBe(initialMembershipVersion + 1);
      expect(queueChangeSpy).toHaveBeenCalledTimes(1);
      expect(q.songIds.length).toBe(4500);
    });
  });
});
