// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetPersistenceForTesting,
  dispatch,
  flushPendingLocalStorage,
  store
} from '../../../../../src/renderer/src/store/store';
import storage from '../../../../../src/renderer/src/utils/localStorage';

describe('store.ts dual-class persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(storage, 'setLocalStorage').mockImplementation(() => {});
    __resetPersistenceForTesting();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetPersistenceForTesting();
  });

  it('skips setLocalStorage when localStorage reference has not changed', () => {
    // Non-localStorage action (e.g. selection data)
    dispatch({
      type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
      data: {
        isEnabled: true,
        selectionType: 'songs',
        multipleSelections: [1, 2, 3]
      }
    });

    vi.advanceTimersByTime(500);
    expect(storage.setLocalStorage).not.toHaveBeenCalled();
  });

  it('skips setLocalStorage on high-frequency UPDATE_SONG_POSITION dispatches', () => {
    // Simulate high-frequency (100ms) playback position ticks
    for (let pos = 1; pos <= 10; pos += 1) {
      dispatch({
        type: 'UPDATE_SONG_POSITION',
        data: pos * 0.5
      });
    }

    vi.advanceTimersByTime(1000);
    expect(storage.setLocalStorage).not.toHaveBeenCalled();
  });

  it('coalesces multiple rapid preference updates within the 250ms window into a single write', () => {
    const prev = store.state.localStorage;
    const update1 = {
      ...prev,
      preferences: { ...prev.preferences, theme: 'dark' as const }
    };
    const update2 = {
      ...prev,
      preferences: { ...prev.preferences, theme: 'light' as const }
    };
    const update3 = {
      ...prev,
      preferences: { ...prev.preferences, theme: 'system' as const }
    };

    dispatch({ type: 'UPDATE_LOCAL_STORAGE', data: update1 });
    vi.advanceTimersByTime(100);
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    dispatch({ type: 'UPDATE_LOCAL_STORAGE', data: update2 });
    vi.advanceTimersByTime(100);
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    dispatch({ type: 'UPDATE_LOCAL_STORAGE', data: update3 });
    vi.advanceTimersByTime(200);
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    // Advance past the final 250ms debounce window
    vi.advanceTimersByTime(60);
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(storage.setLocalStorage).toHaveBeenCalledWith(update3);
  });

  it('debounces non-queue preference changes by 250ms', () => {
    const prev = store.state.localStorage;
    const updated = {
      ...prev,
      preferences: {
        ...prev.preferences,
        theme: 'dark'
      }
    };

    dispatch({
      type: 'UPDATE_LOCAL_STORAGE',
      data: updated
    });

    // Not written immediately
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    // Advance 200ms - still pending
    vi.advanceTimersByTime(200);
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    // Advance past 250ms - written once
    vi.advanceTimersByTime(60);
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(storage.setLocalStorage).toHaveBeenCalledWith(updated);
  });

  it('immediately writes when queue changes and cancels pending debounced writes', () => {
    const prev = store.state.localStorage;
    const prefsUpdated = {
      ...prev,
      preferences: {
        ...prev.preferences,
        theme: 'light'
      }
    };

    // Trigger debounced preference change
    dispatch({
      type: 'UPDATE_LOCAL_STORAGE',
      data: prefsUpdated
    });
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    // Now trigger a queue change
    const queueUpdated = {
      ...prefsUpdated,
      queue: [10, 20, 30]
    };

    dispatch({
      type: 'UPDATE_LOCAL_STORAGE',
      data: queueUpdated
    });

    // Should write immediately once with the latest state (containing both prefs and queue)
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(storage.setLocalStorage).toHaveBeenCalledWith(queueUpdated);

    // Advancing timers should not cause a second write
    vi.advanceTimersByTime(500);
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
  });

  it('flushPendingLocalStorage immediately commits pending debounced writes', () => {
    const prev = store.state.localStorage;
    const updated = {
      ...prev,
      preferences: {
        ...prev.preferences,
        theme: 'system'
      }
    };

    dispatch({
      type: 'UPDATE_LOCAL_STORAGE',
      data: updated
    });

    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    flushPendingLocalStorage();
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(storage.setLocalStorage).toHaveBeenCalledWith(updated);
  });
});
