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

import { store } from '../../store/store';
import { bumpLibraryVersion, getLibraryVersion } from '../libraryVersion';
import PlayerQueue from '../playerQueue';
import { QueuesManager } from '../queuesManager';

const CANONICAL_METADATA = {
  queueType: 'songs' as const,
  isCanonical: true,
  title: 'All Songs'
};

function createCanonical(manager: QueuesManager, songIds: number[]) {
  return manager.getOrCreateCanonicalQueue({ songIds, ...CANONICAL_METADATA });
}

describe('QueuesManager — Canonical All Songs Queue invariants', () => {
  it('Invariant 1/3/5: creates the canonical queue once and reuses it on repeated plays', () => {
    const manager = new QueuesManager();

    const first = createCanonical(manager, [1, 2, 3]);
    expect(first).toBeDefined();
    expect(first!.getMetadata().isCanonical).toBe(true);
    expect(manager.queues.length).toBe(1);

    const second = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3],
      startSongId: 2,
      ...CANONICAL_METADATA
    });

    expect(second).toBe(first);
    expect(manager.queues.length).toBe(1);
    expect(manager.findCanonicalQueue()).toBe(first);
  });

  it('Invariant 3: fast path navigates without structural churn and preserves shuffle state', () => {
    const manager = new QueuesManager();
    const queue = createCanonical(manager, [1, 2, 3, 4, 5])!;
    const structureVersionBefore = queue.structureVersion;

    queue.shuffle();
    const shuffledStructureVersion = queue.structureVersion;
    const hadShuffleHistory = !!queue.queueBeforeShuffle;

    manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3, 4, 5],
      startSongId: 4,
      ...CANONICAL_METADATA
    });

    // Pure navigation: position moved onto the requested song, nothing else changed
    expect(queue.currentSongId).toBe(4);
    expect(queue.structureVersion).toBe(shuffledStructureVersion);
    expect(!!queue.queueBeforeShuffle).toBe(hadShuffleHistory);
    expect(queue.getMetadata().isCanonical).toBe(true);
    expect(structureVersionBefore).toBeLessThan(shuffledStructureVersion);
  });

  it('Invariant 7: stale canonical queue rebuilds in place with refreshed version stamp', () => {
    const manager = new QueuesManager();
    const queue = createCanonical(manager, [1, 2, 3])!;
    const queueId = queue.id;
    const versionBefore = getLibraryVersion();

    bumpLibraryVersion();
    expect(getLibraryVersion()).toBeGreaterThan(versionBefore);

    const rebuilt = manager.getOrCreateCanonicalQueue({
      songIds: [7, 8, 9, 10],
      ...CANONICAL_METADATA
    })!;

    // Same stable identity, replaced projection
    expect(rebuilt.id).toBe(queueId);
    expect(rebuilt.getAllSongIds()).toEqual([7, 8, 9, 10]);
    expect(rebuilt.getMetadata().builtAtLibraryVersion).toBe(getLibraryVersion());
    expect(rebuilt.getMetadata().isCanonical).toBe(true);
    expect(manager.queues.length).toBe(1);
  });

  it('Invariant 4/5: removing a song detaches the queue, keeps the edit, and next play builds a fresh canonical queue', () => {
    const manager = new QueuesManager();
    const queue = createCanonical(manager, [1, 2, 3])!;
    const originalTitle = queue.getMetadata().title;

    const removed = queue.removeSongId(2);
    expect(removed).toBe(true);

    // Detached: keeps the edit, loses canonical identity, renamed away from "All Songs"
    expect(queue.getMetadata().isCanonical).toBe(false);
    expect(queue.getAllSongIds()).toEqual([1, 3]);
    expect(queue.getMetadata().title).toMatch(/^Queue \d+$/);
    expect(queue.getMetadata().title).not.toBe(originalTitle);
    expect(manager.findCanonicalQueue()).toBeUndefined();

    const fresh = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3],
      ...CANONICAL_METADATA
    })!;

    expect(fresh).not.toBe(queue);
    expect(fresh.getMetadata().isCanonical).toBe(true);
    expect(fresh.hasSongId(2)).toBe(true);

    // Invariant 1: exactly one canonical queue
    expect(manager.queues.filter((q) => q.getMetadata().isCanonical).length).toBe(1);
  });

  it('Invariant 4: playNext / addSongIdToEnd / clear are structural edits that detach', () => {
    const manager = new QueuesManager();
    const queue = createCanonical(manager, [1, 2, 3])!;
    queue.playNext([99]);
    expect(queue.getMetadata().isCanonical).toBe(false);

    const second = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3],
      ...CANONICAL_METADATA
    })!;
    second.addSongIdToEnd(42);
    expect(second.getMetadata().isCanonical).toBe(false);

    const third = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3],
      ...CANONICAL_METADATA
    })!;
    third.clear();
    expect(third.getMetadata().isCanonical).toBe(false);
  });

  it('Invariant 4: shuffle and restoreFromShuffle are playback state and never detach', () => {
    const manager = new QueuesManager();
    const queue = createCanonical(manager, [1, 2, 3, 4])!;

    queue.shuffle();
    expect(queue.getMetadata().isCanonical).toBe(true);
    expect(queue.getMetadata().title).toBe('All Songs');

    queue.restoreFromShuffle();
    expect(queue.getMetadata().isCanonical).toBe(true);
  });

  it('Invariant 4: store-sync driven replaceQueue does not detach', () => {
    const manager = new QueuesManager();
    const queue = createCanonical(manager, [1, 2, 3])!;

    (manager as any).setupStoreSync();
    (manager as any).lastSyncedStructureVersions.set(queue.id, queue.structureVersion - 1);

    const replaceQueueSpy = vi.spyOn(queue, 'replaceQueue');
    store.setState((state) => ({ ...state }));

    // The guarded in-place sync path ran...
    expect(replaceQueueSpy).toHaveBeenCalledTimes(1);
    // ...and the queue survived as canonical
    expect(queue.getMetadata().isCanonical).toBe(true);
  });

  it('Invariant 8: contextual createQueue never produces a canonical queue', () => {
    const manager = new QueuesManager();
    const contextual = manager.createQueue('All Songs: Rock', [5, 6]);

    expect(contextual.getMetadata().isCanonical).toBeUndefined();
    expect(contextual.getMetadata().title).toBe('All Songs: Rock');
    expect(manager.findCanonicalQueue()).toBeUndefined();
  });

  it('Invariant 6: currentSongId setter never appends to a canonical queue', () => {
    const canonical = new PlayerQueue([1, 2, 3], 0, undefined, {
      queueType: 'songs',
      isCanonical: true
    });
    canonical.currentSongId = 999;
    expect(canonical.length).toBe(3);

    const normal = new PlayerQueue([1, 2, 3]);
    normal.currentSongId = 999;
    expect(normal.length).toBe(4);
    expect(normal.currentSongId).toBe(999);
  });

  it('Invariant 1: duplicate canonical queues collapse at boot', () => {
    const manager = new QueuesManager();
    const a = new PlayerQueue([1], 0, undefined, { queueType: 'songs', isCanonical: true });
    const b = new PlayerQueue([2], 0, undefined, { queueType: 'songs', isCanonical: true });
    manager.queues.push(a, b);
    (manager as any).bindQueueEvents(a);
    (manager as any).bindQueueEvents(b);

    (manager as any).enforceSingleCanonicalQueue();

    expect(a.getMetadata().isCanonical).toBe(true);
    expect(b.getMetadata().isCanonical).toBe(false);
  });

  it('Detached queue titles never collide with existing Queue N tabs', () => {
    const manager = new QueuesManager();
    const canonical = createCanonical(manager, [1, 2])!;
    manager.createQueue('Queue 3', [9]);

    canonical.removeSongId(1);

    expect(canonical.getMetadata().title).toMatch(/^Queue \d+$/);
    const titles = manager.queues.map((q) => q.getMetadata().title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('Deleting the canonical queue is allowed; the next All Songs play recreates it', () => {
    const manager = new QueuesManager();
    const queue = createCanonical(manager, [1, 2, 3])!;

    manager.deleteQueue(queue.id);
    expect(manager.findCanonicalQueue()).toBeUndefined();

    const recreated = manager.getOrCreateCanonicalQueue({
      songIds: [4, 5],
      ...CANONICAL_METADATA
    })!;
    expect(recreated.getMetadata().isCanonical).toBe(true);
    expect(recreated.id).not.toBe(queue.id);
  });

  it('P0 (Invariant 9): a changed sorting order rebuilds the projection in the new arrangement', () => {
    const manager = new QueuesManager();
    const queue = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3],
      sortingOrder: 'aToZ',
      ...CANONICAL_METADATA
    })!;
    const queueId = queue.id;

    const rebuilt = manager.getOrCreateCanonicalQueue({
      songIds: [3, 2, 1],
      sortingOrder: 'zToA',
      startSongId: 2,
      ...CANONICAL_METADATA
    })!;

    // Same identity, re-arranged projection, position lands via the NEW array
    expect(rebuilt.id).toBe(queueId);
    expect(rebuilt.getAllSongIds()).toEqual([3, 2, 1]);
    expect(rebuilt.currentSongId).toBe(2);
    expect(rebuilt.getMetadata().sortingOrder).toBe('zToA');
    expect(rebuilt.getMetadata().isCanonical).toBe(true);
  });

  it('P0 (Invariant 9): a sorting change while shuffled keeps the permutation untouched', () => {
    const manager = new QueuesManager();
    const queue = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3, 4, 5],
      sortingOrder: 'aToZ',
      ...CANONICAL_METADATA
    })!;
    queue.shuffle();
    const structureVersionAfterShuffle = queue.structureVersion;
    const shuffleHistory = queue.queueBeforeShuffle ? [...queue.queueBeforeShuffle] : undefined;
    expect(shuffleHistory).toBeDefined();

    manager.getOrCreateCanonicalQueue({
      songIds: [5, 4, 3, 2, 1],
      sortingOrder: 'zToA',
      startSongId: 4,
      ...CANONICAL_METADATA
    });

    // Fast path: navigation only; the new sort is adopted at the next un-shuffled rebuild
    expect(queue.currentSongId).toBe(4);
    expect(queue.structureVersion).toBe(structureVersionAfterShuffle);
    expect(queue.queueBeforeShuffle).toEqual(shuffleHistory);
    expect(queue.getMetadata().sortingOrder).toBe('aToZ');
    expect(queue.getMetadata().isCanonical).toBe(true);
  });

  it('P1 (Invariant 7): caller-attested versions keep cache races stale instead of poisoning the stamp', () => {
    const manager = new QueuesManager();
    const initial = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2],
      ...CANONICAL_METADATA
    })!;
    const baselineVersion = initial.getMetadata().builtAtLibraryVersion!;
    const replaceQueueSpy = vi.spyOn(initial, 'replaceQueue');

    // IPC structural event lands first; React Query still serves pre-update data
    bumpLibraryVersion();

    manager.getOrCreateCanonicalQueue({
      songIds: [1, 2], // lagging cache IDs
      builtAtLibraryVersion: baselineVersion,
      ...CANONICAL_METADATA
    });

    // Rebuilt from lagging data but stamped honestly — NOT marked fresh at the live version
    expect(replaceQueueSpy).toHaveBeenCalledTimes(1);
    expect(initial.getMetadata().builtAtLibraryVersion).toBe(baselineVersion);

    // Next request with refetched data recovers fully and stamps the live version
    bumpLibraryVersion();
    const recovered = manager.getOrCreateCanonicalQueue({
      songIds: [1, 2, 3],
      ...CANONICAL_METADATA
    })!;

    expect(recovered.id).toBe(initial.id);
    expect(recovered.getAllSongIds()).toEqual([1, 2, 3]);
    expect(recovered.getMetadata().builtAtLibraryVersion).toBe(getLibraryVersion());
  });
});
