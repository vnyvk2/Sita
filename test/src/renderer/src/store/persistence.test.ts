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
