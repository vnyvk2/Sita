// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll } from 'vitest';

beforeAll(() => {
  (window as any).api = {
    settings: {
      getUserSettings: vi.fn().mockResolvedValue({ language: 'en' })
    },
    properties: {
      isInDevelopment: false
    }
  };
});

import PlayerQueue from '../playerQueue';
import { QueuesManager } from '../queuesManager';
import { store } from '../../store/store';

describe('QueuesManager — Store Sync Optimization & structureVersion Invariant', () => {
  it('does NOT call replaceQueue or churn queues on unrelated store updates when structureVersion is unchanged', () => {
    const qManager = new QueuesManager();
    const queue = qManager.createQueue('Test Queue', [101, 102, 103]);

    // Force initialize setupStoreSync
    (qManager as any).setupStoreSync();
    (qManager as any).lastSyncedStructureVersions.set(queue.id, queue.structureVersion);

    const replaceQueueSpy = vi.spyOn(queue, 'replaceQueue');

    // Simulate an unrelated store update (e.g. volume or player state change)
    store.setState((state) => ({
      ...state,
      volume: 85
    }));

    // Invariant: Unrelated store updates must produce ZERO replaceQueue invocations
    expect(replaceQueueSpy).toHaveBeenCalledTimes(0);
  });

  it('audits PlayerQueue mutations to guarantee structureVersion increments on structural modifications', () => {
    const queue = new PlayerQueue([1, 2, 3], 0, undefined, undefined, 'q-audit');
    expect(queue.structureVersion).toBe(0);

    queue.addSongIdsToEnd([4]);
    expect(queue.structureVersion).toBe(1);

    queue.addSongIdsToNext([5, 6]);
    expect(queue.structureVersion).toBe(2);

    queue.addSongIdToNext(7);
    expect(queue.structureVersion).toBe(3);

    queue.addSongIdToEnd(8);
    expect(queue.structureVersion).toBe(4);

    queue.removeSongAtPosition(0);
    expect(queue.structureVersion).toBe(5);

    queue.shuffle();
    expect(queue.structureVersion).toBe(6);

    queue.restoreFromPositions([1, 0, 2, 3, 4, 5, 6]);
    expect(queue.structureVersion).toBe(7);

    queue.replaceQueue([10, 20], 0);
    expect(queue.structureVersion).toBe(8);

    queue.clear();
    expect(queue.structureVersion).toBe(9);
  });
});
