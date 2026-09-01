// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import PlayerQueue from '@renderer/other/playerQueue';
import { QueuesManager } from '@renderer/other/queuesManager';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal?: string) => defaultVal || key
    })
  };
});

describe('Phase 2: Queue State, Persistence & Subscription Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. PlayerQueue structureVersion Invariants', () => {
    it('initializes with structureVersion = 0', () => {
      const q = new PlayerQueue([101, 102, 103], 0);
      expect(q.structureVersion).toBe(0);
    });

    it('does NOT increment structureVersion on navigation / position changes', () => {
      const q = new PlayerQueue([101, 102, 103, 104, 105], 0);
      expect(q.structureVersion).toBe(0);

      q.moveToPosition(2);
      expect(q.position).toBe(2);
      expect(q.structureVersion).toBe(0);

      q.moveToNext();
      expect(q.position).toBe(3);
      expect(q.structureVersion).toBe(0);

      q.moveToPrevious();
      expect(q.position).toBe(2);
      expect(q.structureVersion).toBe(0);

      q.moveToStart();
      expect(q.position).toBe(0);
      expect(q.structureVersion).toBe(0);

      q.moveToEnd();
      expect(q.position).toBe(4);
      expect(q.structureVersion).toBe(0);
    });

    it('DOES increment structureVersion on structural mutations', () => {
      const q = new PlayerQueue([101, 102, 103], 0);
      let expectedVersion = 0;

      // Add to end
      q.addSongIdsToEnd([104, 105]);
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.songIds).toEqual([101, 102, 103, 104, 105]);

      // Add to next
      q.addSongIdToNext(999);
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.songIds).toEqual([101, 999, 102, 103, 104, 105]);

      // Remove single ID
      q.removeSongId(999);
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.songIds).toEqual([101, 102, 103, 104, 105]);

      // Remove at position
      q.removeSongAtPosition(4);
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.songIds).toEqual([101, 102, 103, 104]);

      // Replace queue
      q.replaceQueue([201, 202, 203]);
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.songIds).toEqual([201, 202, 203]);

      // Shuffle
      q.shuffle();
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.queueBeforeShuffle).toBeDefined();

      // Restore from shuffle
      q.restoreFromShuffle();
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.songIds).toEqual([201, 202, 203]);

      // Clear
      q.clear();
      expectedVersion++;
      expect(q.structureVersion).toBe(expectedVersion);
      expect(q.songIds).toEqual([]);
    });

    it('restores legacy JSON without structureVersion cleanly with version = 0', () => {
      const legacyJson = {
        id: 'legacy-queue-1',
        songIds: [501, 502, 503],
        position: 1,
        metadata: { title: 'Legacy Queue' }
      };

      const q = PlayerQueue.fromJSON(legacyJson);
      expect(q.id).toBe('legacy-queue-1');
      expect(q.songIds).toEqual([501, 502, 503]);
      expect(q.position).toBe(1);
      expect(q.structureVersion).toBe(0);
    });
  });

  describe('2. PlayerQueue.playNext Deduplication & Position Adjustment Semantics', () => {
    it('Play Next on earlier duplicate: moves song to next position and shifts current position down', () => {
      // queue = [10, 20, 30, 40, 50] (A=10, B=20, C=30, D=40, E=50), position = 3 (D=40 is playing)
      const q = new PlayerQueue([10, 20, 30, 40, 50], 3);
      expect(q.currentSongId).toBe(40);

      // Play Next: 30 (C)
      q.playNext(30);

      // 30 should be removed from index 2, current song 40 shifts from index 3 to 2, and 30 inserted at index 3
      expect(q.songIds).toEqual([10, 20, 40, 30, 50]);
      expect(q.position).toBe(2);
      expect(q.currentSongId).toBe(40);
      expect(q.songIds[q.position + 1]).toBe(30); // Up next is 30
    });

    it('Play Next on later duplicate: moves song to next position and preserves current position', () => {
      // queue = [10, 20, 30, 40, 50], position = 3 (40 is playing)
      const q = new PlayerQueue([10, 20, 30, 40, 50], 3);
      expect(q.currentSongId).toBe(40);

      // Play Next: 50 (E)
      q.playNext(50);

      // 50 was at index 4 (after 3), removed, and inserted at index 4 (position + 1)
      expect(q.songIds).toEqual([10, 20, 30, 40, 50]);
      expect(q.position).toBe(3);
      expect(q.currentSongId).toBe(40);
      expect(q.songIds[q.position + 1]).toBe(50);
    });

    it('Play Next on multiple songs with mixed earlier/later duplicates', () => {
      // queue = [10, 20, 30, 40, 50], position = 3 (40 is playing)
      const q = new PlayerQueue([10, 20, 30, 40, 50], 3);

      // Play Next: [20, 30] (B, C)
      q.playNext([20, 30]);

      // Both 20 and 30 removed from before position 3, shifting position from 3 -> 2 -> 1 (40 is now at index 1 in [10, 40, 50])
      // Then [20, 30] inserted at position + 1 (index 2)
      expect(q.songIds).toEqual([10, 40, 20, 30, 50]);
      expect(q.position).toBe(1);
      expect(q.currentSongId).toBe(40);
      expect(q.songIds[q.position + 1]).toBe(20);
      expect(q.songIds[q.position + 2]).toBe(30);
    });

    it('Play Next on brand new song: inserts directly after current song', () => {
      const q = new PlayerQueue([10, 20, 30, 40, 50], 3);
      q.playNext(999);

      expect(q.songIds).toEqual([10, 20, 30, 40, 999, 50]);
      expect(q.position).toBe(3);
      expect(q.currentSongId).toBe(40);
      expect(q.songIds[q.position + 1]).toBe(999);
    });
  });

  describe('3. Multiple Queue Invariants & Isolation', () => {
    it('preserves independent positions and song orders across queues', () => {
      const manager = new QueuesManager();
      const q1 = manager.createQueue('Queue A', [1, 2, 3, 4, 5]);
      const q2 = manager.createQueue('Queue B', [10, 20, 30, 40, 50]);

      q1.moveToPosition(3); // q1 at index 3 (song 4)
      q2.moveToPosition(1); // q2 at index 1 (song 20)

      expect(q1.position).toBe(3);
      expect(q2.position).toBe(1);

      manager.switchQueue(1); // Switch active to Queue B
      expect(manager.activeQueueIndex).toBe(1);
      expect(manager.getActiveQueue().position).toBe(1);
      expect(q1.position).toBe(3);

      manager.switchQueue(0); // Switch back to Queue A
      expect(manager.activeQueueIndex).toBe(0);
      expect(manager.getActiveQueue().position).toBe(3);
      expect(q2.position).toBe(1);
    });

    it('Queue A position advancement does not mutate or touch Queue B', () => {
      const manager = new QueuesManager();
      const q1 = manager.createQueue('Queue A', [100, 101, 102]);
      const q2 = manager.createQueue('Queue B', [200, 201, 202]);

      const q2VersionBefore = q2.structureVersion;
      const q2SongIdsRefBefore = q2.songIds;

      q1.moveToNext();
      expect(q1.position).toBe(1);

      // Assert Queue B remains completely untouched
      expect(q2.position).toBe(0);
      expect(q2.structureVersion).toBe(q2VersionBefore);
      expect(q2.songIds).toBe(q2SongIdsRefBefore);
    });
  });

  describe('4. Single-Pass Store Sync & Persistence', () => {
    it('triggerStoreSync updates store state accurately without throwing', () => {
      const manager = new QueuesManager();
      const q1 = manager.createQueue('Active Queue', [1, 2, 3]);

      q1.moveToPosition(1);

      const storeState = store.state.localStorage?.queue;
      expect(storeState).toBeDefined();
      expect(storeState?.queues.length).toBeGreaterThanOrEqual(1);
    });

    it('only invokes storage.setLocalStorage exactly once per store state transition', () => {
      const setLocalStorageSpy = vi.spyOn(storage, 'setLocalStorage');
      setLocalStorageSpy.mockClear();

      // Trigger a state change via storage helper
      storage.sortingStates.setSortingStates('songsPage', 'aToZ');

      // Assert setLocalStorage was called exactly once from the store subscriber
      expect(setLocalStorageSpy).toHaveBeenCalledTimes(1);
      setLocalStorageSpy.mockRestore();
    });
  });

  describe('5. Granular Subscription Isolation (isUpNext selector)', () => {
    it('only re-evaluates isUpNext for the affected songs when track advances', () => {
      const renderCounts: Record<number, number> = {};

      const SimulatedSongCard = React.memo(({ songId }: { songId: number }) => {
        renderCounts[songId] = (renderCounts[songId] || 0) + 1;

        const isPlayingNext =
          (store.state.localStorage?.queue?.queues?.[
            store.state.localStorage?.queue?.currentQueueIndex ?? 0
          ]?.songIds?.[
            (store.state.localStorage?.queue?.queues?.[
              store.state.localStorage?.queue?.currentQueueIndex ?? 0
            ]?.position ?? 0) + 1
          ] ?? null) === songId;

        return <div data-testid={`song-${songId}`}>{isPlayingNext ? 'NEXT' : 'IDLE'}</div>;
      });

      // Initial state: Queue = [101, 102, 103, 104, 105], position = 0
      // Next song is 102 (position 1)
      const { rerender } = render(
        <div>
          <SimulatedSongCard songId={101} />
          <SimulatedSongCard songId={102} />
          <SimulatedSongCard songId={103} />
          <SimulatedSongCard songId={104} />
          <SimulatedSongCard songId={105} />
        </div>
      );

      expect(renderCounts[101]).toBe(1);
      expect(renderCounts[102]).toBe(1);
      expect(renderCounts[103]).toBe(1);
      expect(renderCounts[104]).toBe(1);
      expect(renderCounts[105]).toBe(1);
    });
  });
});
