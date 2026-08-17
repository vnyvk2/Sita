// @vitest-environment jsdom
import PlayerQueue from '@renderer/other/playerQueue';
import { songQuery } from '@renderer/queries/songs';
import { describe, expect, it } from 'vitest';

describe('PlayerQueue Membership & Structure Versioning (Phase 3 Invariants)', () => {
  it('initializes membershipVersion at 0', () => {
    const queue = new PlayerQueue([1, 2, 3], 0);
    expect(queue.membershipVersion).toBe(0);
    expect(queue.structureVersion).toBe(0);
  });

  it('does not increment membershipVersion or structureVersion when adding empty arrays', () => {
    const queue = new PlayerQueue([1, 2, 3], 0);
    queue.addSongIdsToEnd([]);
    queue.addSongIdsToNext([]);
    expect(queue.membershipVersion).toBe(0);
    expect(queue.structureVersion).toBe(0);
  });

  it('increments membershipVersion and structureVersion when songs are added', () => {
    const queue = new PlayerQueue([1, 2, 3], 0);
    queue.addSongIdsToEnd([4, 5]);
    expect(queue.membershipVersion).toBe(1);
    expect(queue.structureVersion).toBe(1);

    queue.addSongIdToNext(6);
    expect(queue.membershipVersion).toBe(2);
    expect(queue.structureVersion).toBe(2);

    queue.addSongIdToEnd(7);
    expect(queue.membershipVersion).toBe(3);
    expect(queue.structureVersion).toBe(3);
  });

  it('increments membershipVersion and structureVersion when songs are removed', () => {
    const queue = new PlayerQueue([1, 2, 3, 4], 0);
    const removed = queue.removeSongId(2);
    expect(removed).toBe(true);
    expect(queue.membershipVersion).toBe(1);
    expect(queue.structureVersion).toBe(1);

    const removedAtPos = queue.removeSongAtPosition(0);
    expect(removedAtPos).toBe(1);
    expect(queue.membershipVersion).toBe(2);
    expect(queue.structureVersion).toBe(2);

    // Attempting to remove non-existent song does not increment versions
    const nonExistent = queue.removeSongId(999);
    expect(nonExistent).toBe(false);
    expect(queue.membershipVersion).toBe(2);
    expect(queue.structureVersion).toBe(2);
  });

  it('increments membershipVersion when non-empty queue is cleared, but not when already empty', () => {
    const queue = new PlayerQueue([1, 2], 0);
    queue.clear();
    expect(queue.membershipVersion).toBe(1);
    expect(queue.structureVersion).toBe(1);

    queue.clear();
    expect(queue.membershipVersion).toBe(1);
  });

  it('SHUFFLE & RESTORE INVARIANT: increments structureVersion but leaves membershipVersion strictly unchanged', () => {
    const queue = new PlayerQueue([1, 2, 3, 4, 5], 0);
    const initialMembershipVersion = queue.membershipVersion;
    const initialStructureVersion = queue.structureVersion;

    // Shuffle
    queue.shuffle();
    expect(queue.membershipVersion).toBe(initialMembershipVersion);
    expect(queue.structureVersion).toBe(initialStructureVersion + 1);

    // Restore from shuffle
    queue.restoreFromShuffle();
    expect(queue.membershipVersion).toBe(initialMembershipVersion);
    expect(queue.structureVersion).toBe(initialStructureVersion + 2);
  });

  it('REORDER / REPLACE QUEUE INVARIANT: leaves membershipVersion unchanged if multiset is identical, increments if membership changed', () => {
    const queue = new PlayerQueue([10, 20, 30], 0);

    // Reorder same IDs [30, 10, 20]
    queue.replaceQueue([30, 10, 20]);
    expect(queue.membershipVersion).toBe(0); // UNCHANGED!
    expect(queue.structureVersion).toBe(1);

    // Replace with different IDs
    queue.replaceQueue([30, 10, 40]);
    expect(queue.membershipVersion).toBe(1); // CHANGED!
    expect(queue.structureVersion).toBe(2);
  });

  it('PLAYBACK ADVANCE INVARIANT: track movements do not increment membershipVersion or structureVersion', () => {
    const queue = new PlayerQueue([10, 20, 30], 0);
    queue.moveToPosition(1);
    expect(queue.membershipVersion).toBe(0);
    expect(queue.structureVersion).toBe(0);

    queue.moveToNext();
    expect(queue.membershipVersion).toBe(0);
    expect(queue.structureVersion).toBe(0);

    queue.moveToPrevious();
    expect(queue.membershipVersion).toBe(0);
    expect(queue.structureVersion).toBe(0);
  });
});

describe('songQuery.queue TanStack Query Key & Zero-IPC Shuffle Invariant', () => {
  it('produces lightweight collision-proof query keys based on queueId and membershipVersion', () => {
    const queue = new PlayerQueue([100, 200, 300], 0, undefined, undefined, 'queue-alpha');

    const key1 = songQuery.queue({
      songIds: queue.songIds,
      queueId: queue.id,
      membershipVersion: queue.membershipVersion
    }).queryKey;

    expect(key1).toEqual(['songs', 'queue', 'queue-alpha', 'v=0']);

    // When shuffled:
    queue.shuffle();
    const keyAfterShuffle = songQuery.queue({
      songIds: queue.songIds,
      queueId: queue.id,
      membershipVersion: queue.membershipVersion
    }).queryKey;

    // Zero-IPC Invariant: Query key is identical before and after shuffle!
    expect(keyAfterShuffle).toEqual(key1);

    // When membership changes (adding a song):
    queue.addSongIdToEnd(400);
    const keyAfterAdd = songQuery.queue({
      songIds: queue.songIds,
      queueId: queue.id,
      membershipVersion: queue.membershipVersion
    }).queryKey;

    expect(keyAfterAdd).toEqual(['songs', 'queue', 'queue-alpha', 'v=1']);
  });

  it('preserves membershipVersion and queryKey across multiple arbitrary reorderings', () => {
    const queue = new PlayerQueue([10, 20, 30, 40, 50], 0, undefined, undefined, 'queue-multi');

    const originalKey = songQuery.queue({
      songIds: queue.songIds,
      queueId: queue.id,
      membershipVersion: queue.membershipVersion
    }).queryKey;

    expect(originalKey).toEqual(['songs', 'queue', 'queue-multi', 'v=0']);

    // Reorder 1: [30, 50, 10, 40, 20]
    queue.replaceQueue([30, 50, 10, 40, 20]);
    expect(queue.membershipVersion).toBe(0);
    expect(
      songQuery.queue({
        songIds: queue.songIds,
        queueId: queue.id,
        membershipVersion: queue.membershipVersion
      }).queryKey
    ).toEqual(originalKey);

    // Reorder 2: [20, 10, 50, 30, 40]
    queue.replaceQueue([20, 10, 50, 30, 40]);
    expect(queue.membershipVersion).toBe(0);
    expect(
      songQuery.queue({
        songIds: queue.songIds,
        queueId: queue.id,
        membershipVersion: queue.membershipVersion
      }).queryKey
    ).toEqual(originalKey);
  });
});
