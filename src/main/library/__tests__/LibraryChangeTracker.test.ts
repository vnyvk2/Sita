import { describe, it, expect, beforeEach, vi } from 'vitest';

import libraryChangeTracker from '../LibraryChangeTracker';

describe('LibraryChangeTracker', () => {
  beforeEach(() => {
    libraryChangeTracker.reset();
  });

  it('should initialize with clean state', () => {
    const state = libraryChangeTracker.getState();
    expect(state.isDirty).toBe(false);
    expect(state.changedPaths).toEqual([]);
    expect(state.lastChangedAt).toBeNull();
  });

  it('should mark dirty when a folder watcher event occurs', () => {
    libraryChangeTracker.markDirty({
      path: 'D:\\Music\\Rock',
      source: 'folder-watcher'
    });

    const state = libraryChangeTracker.getState();
    expect(state.isDirty).toBe(true);
    expect(state.changedPaths).toContain('D:\\Music\\Rock');
    expect(state.lastChangedAt).toBeTypeOf('number');
  });

  it('should accumulate distinct changed paths without duplicates', () => {
    libraryChangeTracker.markDirty({
      path: 'D:\\Music\\Rock',
      source: 'folder-watcher'
    });
    libraryChangeTracker.markDirty({
      path: 'D:\\Music\\Rock',
      source: 'folder-watcher'
    });
    libraryChangeTracker.markDirty({
      path: 'D:\\Music\\Jazz',
      source: 'folder-watcher'
    });
    libraryChangeTracker.markDirty({
      path: 'D:\\Music',
      source: 'parent-watcher'
    });

    const state = libraryChangeTracker.getState();
    expect(state.isDirty).toBe(true);
    expect(state.changedPaths).toHaveLength(3);
    expect(state.changedPaths).toEqual(
      expect.arrayContaining(['D:\\Music\\Rock', 'D:\\Music\\Jazz', 'D:\\Music'])
    );
  });

  it('should emit changed event with state and entry payload', () => {
    const listener = vi.fn();
    libraryChangeTracker.on('changed', listener);

    libraryChangeTracker.markDirty({
      path: 'D:\\Music\\Classical',
      source: 'folder-watcher'
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const callArg = listener.mock.calls[0][0];
    expect(callArg.state.isDirty).toBe(true);
    expect(callArg.state.changedPaths).toContain('D:\\Music\\Classical');
    expect(callArg.entry).toEqual({
      path: 'D:\\Music\\Classical',
      source: 'folder-watcher'
    });

    libraryChangeTracker.off('changed', listener);
  });

  it('should cleanly reset state back to clean', () => {
    libraryChangeTracker.markDirty({
      path: 'D:\\Music\\Metal',
      source: 'folder-watcher'
    });
    expect(libraryChangeTracker.getState().isDirty).toBe(true);

    const listener = vi.fn();
    libraryChangeTracker.on('changed', listener);

    libraryChangeTracker.reset();

    const state = libraryChangeTracker.getState();
    expect(state.isDirty).toBe(false);
    expect(state.changedPaths).toEqual([]);
    expect(state.lastChangedAt).toBeNull();
    expect(listener).toHaveBeenCalledWith({
      state: { isDirty: false, changedPaths: [], lastChangedAt: null },
      entry: null
    });

    libraryChangeTracker.off('changed', listener);
  });
});
