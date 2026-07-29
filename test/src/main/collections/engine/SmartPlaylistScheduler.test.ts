import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartPlaylistScheduler } from '../../../../../src/main/collections/engine/SmartPlaylistScheduler';
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
        { playlistId: 2, dependencies: ['playCount'] }
      ])
    }))
  }
}));

describe('SmartPlaylistScheduler', () => {
  let scheduler: SmartPlaylistScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    scheduler = new SmartPlaylistScheduler(); // this sets up listeners
  });

  afterEach(() => {
    vi.useRealTimers();
    libraryEventBus.removeAllListeners();
  });

  it('should ignore events if dependencies do not match', async () => {
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['artist'] });
    
    // Fast-forward debounce
    await vi.runAllTimersAsync();
    
    // Nothing queued because no playlist cares about 'artist'
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
});
