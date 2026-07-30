import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { smartPlaylistScheduler } from '../../../../../src/main/collections/engine/SmartPlaylistScheduler';
import { libraryEventBus } from '../../../../../src/main/events/LibraryEventBus';
import { db } from '../../../../../src/main/db/db';
import { smartPlaylistRules } from '../../../../../src/main/db/schema';
import { libraryScheduler } from '../../../../../src/main/workers/jobScheduler';

vi.mock('../../../../../src/main/workers/jobScheduler', () => ({
  libraryScheduler: {
    enqueue: vi.fn()
  }
}));

// Mock db.select
vi.mock('../../../../../src/main/db/db', () => ({
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

describe('SmartPlaylistScheduler', () => {
  const flushMicrotasks = async (count = 1) => {
    for (let i = 0; i < count; i++) {
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (smartPlaylistScheduler as any).dirtyPlaylists.clear();
    (smartPlaylistScheduler as any).debounceTimeout = null;
  });

  afterEach(() => {
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
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['artist', 'genre'] });
    
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
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['title', 'artist', 'genre', 'year'] });
    
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
});
