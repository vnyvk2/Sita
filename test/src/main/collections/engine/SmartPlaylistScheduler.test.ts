// Mock dependencies
vi.mock('@main/workers/jobScheduler', () => ({
  libraryScheduler: {
    enqueue: vi.fn()
  }
}));

// Mock db.select
vi.mock('@main/db/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn().mockResolvedValue([
        { playlistId: 1, dependencies: ['title'] },
        { playlistId: 2, dependencies: ['playCount'] },
        { playlistId: 3, dependencies: ['artist', 'genre'] },
        { playlistId: 4, dependencies: ['artist'] }, // For testing multiple playlists depending on the same field
        { playlistId: 5, dependencies: [] } // For testing playlist depending on no fields
      ])
    }))
  }
}));

import { smartPlaylistScheduler } from '@main/collections/engine/SmartPlaylistScheduler';
import { collectionEventBus } from '@main/collections/events/CollectionEventBus';
import { db } from '@main/db/db';
import { smartPlaylistRules } from '@main/db/schema';
import { libraryEventBus } from '@main/events/LibraryEventBus';
import { libraryScheduler } from '@main/workers/jobScheduler';

describe('SmartPlaylistScheduler', () => {
  const flushMicrotasks = async (count = 1) => {
    for (let i = 0; i < count; i++) {
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    smartPlaylistScheduler.reset();
    smartPlaylistScheduler.setupListeners();
  });

  afterEach(() => {
    smartPlaylistScheduler.cleanup();
    vi.useRealTimers();
  });

  it('should ignore events if dependencies do not match', async () => {
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['year'] });

    // Fast-forward debounce
    await vi.runAllTimersAsync();

    // Nothing queued because no playlist cares about 'year'
    expect(libraryScheduler.enqueue).not.toHaveBeenCalled();
  });

  it('should queue jobs for affected playlists', async () => {
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['title'] });

    // Wait for the async db query to resolve and then timer
    await Promise.resolve(); // drain microtask queue
    await vi.runAllTimersAsync();

    // Playlist 1 cares about title
    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(1);
    expect((libraryScheduler.enqueue as any).mock.calls[0][0].playlistId).toBe(1);
  });

  it('should debounce rapid duplicate events and only enqueue once per playlist', async () => {
    // Fire the same event 3 times rapidly
    libraryEventBus.emitEvent('SongPlayCountChanged', { songId: 1 });
    libraryEventBus.emitEvent('SongPlayCountChanged', { songId: 1 });
    libraryEventBus.emitEvent('SongPlayCountChanged', { songId: 1 });

    await Promise.resolve();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    // Playlist 2 cares about playCount. Even though 3 events fired, it should only be queued once.
    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(1);
    expect((libraryScheduler.enqueue as any).mock.calls[0][0].playlistId).toBe(2);
  });

  it('should queue playlist when one of its multiple dependencies matches', async () => {
    // Event changes artist, playlist 3 depends on artist AND genre
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['artist'] });

    await Promise.resolve();
    await vi.runAllTimersAsync();

    // Playlist 3 and 4 care about artist
    const queuedIds = (libraryScheduler.enqueue as any).mock.calls.map((c: any) => c[0].playlistId);
    expect(queuedIds).toContain(3);
  });

  it('should only queue playlist once when it matches multiple changing fields', async () => {
    // Event changes both artist and genre, playlist 3 depends on both
    libraryEventBus.emitEvent('SongMetadataChanged', {
      songId: 1,
      changedFields: ['artist', 'genre']
    });

    await Promise.resolve();
    await vi.runAllTimersAsync();

    // Playlist 3 should only be queued once
    const queuedIds = (libraryScheduler.enqueue as any).mock.calls.map((c: any) => c[0].playlistId);
    expect(queuedIds.filter((id: number) => id === 3).length).toBe(1);
  });

  it('should queue all playlists that depend on the same changed field', async () => {
    // Both playlist 3 and playlist 4 depend on 'artist'
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['artist'] });

    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(2);
    const queuedIds = (libraryScheduler.enqueue as any).mock.calls.map((c: any) => c[0].playlistId);
    expect(queuedIds).toContain(3);
    expect(queuedIds).toContain(4);
  });

  it('should never queue a playlist that depends on no fields', async () => {
    // Playlist 5 has empty dependencies. It should never be queued by a metadata change.
    libraryEventBus.emitEvent('SongMetadataChanged', {
      songId: 1,
      changedFields: ['title', 'artist', 'genre', 'year']
    });

    await Promise.resolve();
    await vi.runAllTimersAsync();

    const queuedIds = (libraryScheduler.enqueue as any).mock.calls.map((c: any) => c[0].playlistId);
    expect(queuedIds).not.toContain(5);
  });

  it('should debounce rapid burst of 100 metadata events into a single queue operation per affected playlist', async () => {
    // Simulate a burst of 100 song updates (e.g. bulk edit or scanning)
    for (let i = 0; i < 100; i++) {
      libraryEventBus.emitEvent('SongMetadataChanged', { songId: i, changedFields: ['title'] });
    }

    // Drain microtasks for all 100 events
    await flushMicrotasks(100);

    await vi.runAllTimersAsync();

    // Playlist 1 cares about 'title'. Even after 100 events, it should be queued exactly once.
    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(1);
    expect((libraryScheduler.enqueue as any).mock.calls[0][0].playlistId).toBe(1);
  });

  it('should single-flight rule fetching and reuse cached rules across multiple events', async () => {
    const selectSpy = db.select as any;
    selectSpy.mockClear();

    // Fire 5 distinct events concurrently
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['title'] });
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 2, changedFields: ['artist'] });
    libraryEventBus.emitEvent('SongPlayCountChanged', { songId: 3 });

    await flushMicrotasks(5);

    // db.select should only have been called once despite multiple concurrent events
    expect(selectSpy).toHaveBeenCalledTimes(1);

    // Another event fired later while cache is hot
    libraryEventBus.emitEvent('SongFavoriteChanged', { songId: 4 });
    await flushMicrotasks(5);

    // Still only called once because rules are cached in memory
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cached rules when collection event is received', async () => {
    const selectSpy = db.select as any;
    selectSpy.mockClear();

    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['title'] });
    await flushMicrotasks(5);
    expect(selectSpy).toHaveBeenCalledTimes(1);

    // Emit collection modified event
    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      collectionId: 1,
      name: 'New Name'
    });

    // Fire next event
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 2, changedFields: ['title'] });
    await flushMicrotasks(5);

    // db.select should have been called again after cache invalidation
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });

  it('should unregister all listeners and cancel pending timers on cleanup', async () => {
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['title'] });
    await flushMicrotasks(5);

    smartPlaylistScheduler.cleanup();

    // Advancing timers should not execute any queued flush
    await vi.runAllTimersAsync();
    expect(libraryScheduler.enqueue).not.toHaveBeenCalled();

    // Emitting event after cleanup should not trigger any scheduler action
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 2, changedFields: ['title'] });
    await flushMicrotasks(5);
    await vi.runAllTimersAsync();
    expect(libraryScheduler.enqueue).not.toHaveBeenCalled();
  });
});
