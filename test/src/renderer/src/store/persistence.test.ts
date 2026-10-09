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

  it('debounces queue changes by 500ms and coalesces pending updates', () => {
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
      queue: {
        queues: [
          {
            id: 'test-queue',
            songIds: [10, 20, 30],
            position: 0
          }
        ],
        currentQueueIndex: 0
      }
    };

    dispatch({
      type: 'UPDATE_LOCAL_STORAGE',
      data: queueUpdated as any
    });

    // Debounced by 500ms, so not written immediately
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    // Advance 400ms - still pending
    vi.advanceTimersByTime(400);
    expect(storage.setLocalStorage).not.toHaveBeenCalled();

    // Advance past 500ms - written once with latest cumulative state
    vi.advanceTimersByTime(150);
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
    expect(storage.setLocalStorage).toHaveBeenCalledWith(queueUpdated);
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

  it('skips setLocalStorage and schedules ZERO writes when position changes with preserved array references', () => {
    const prev = store.state.localStorage;
    const songIds = [1, 2, 3];
    const initialQueue = {
      queues: [
        {
          id: 'test-queue',
          songIds,
          position: 0
        }
      ],
      currentQueueIndex: 0
    };

    // Prime the store so prevLocalStorage has this queue
    store.setState((state) => ({
      ...state,
      localStorage: { ...prev, queue: initialQueue as any },
      queueUpdateKind: undefined
    }));
    flushPendingLocalStorage();
    vi.clearAllMocks();

    // Position-only update via spread (preserving songIds reference, exactly as syncQueuePositionOnly does)
    const positionOnlyQueueState = {
      ...prev,
      queue: {
        ...initialQueue,
        queues: initialQueue.queues.map((q) => ({
          ...q,
          position: 2
        }))
      }
    };

    store.setState((state) => ({
      ...state,
      localStorage: positionOnlyQueueState as any,
      queueUpdateKind: 'position'
    }));

    // Advance through what would have been the debounce window
    vi.advanceTimersByTime(1000);
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(0);
  });

  it('fails closed and schedules a write if position update clones arrays instead of preserving references', () => {
    const prev = store.state.localStorage;
    const songIds = [1, 2, 3];
    const initialQueue = {
      queues: [
        {
          id: 'test-queue',
          songIds,
          position: 0
        }
      ],
      currentQueueIndex: 0
    };

    // Prime the store with initialQueue
    store.setState((state) => ({
      ...state,
      localStorage: { ...prev, queue: initialQueue as any },
      queueUpdateKind: undefined
    }));
    flushPendingLocalStorage();
    vi.clearAllMocks();

    // Writer incorrectly clones songIds array on position change
    const clonedArrayQueueState = {
      ...prev,
      queue: {
        ...initialQueue,
        queues: initialQueue.queues.map((q) => ({
          ...q,
          songIds: [...q.songIds], // cloned array reference
          position: 2
        }))
      }
    };

    store.setState((state) => ({
      ...state,
      localStorage: clonedArrayQueueState as any,
      queueUpdateKind: 'position'
    }));

    vi.advanceTimersByTime(550);
    // Reference check fails closed: write is scheduled safely
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
  });

  it('does NOT skip setLocalStorage if queue changed structurally even when kind is position', () => {
    const prev = store.state.localStorage;
    const initialQueue = {
      queues: [
        {
          id: 'test-queue',
          songIds: [1, 2, 3],
          position: 0
        }
      ],
      currentQueueIndex: 0
    };

    // Prime the store with initialQueue
    store.setState((state) => ({
      ...state,
      localStorage: { ...prev, queue: initialQueue as any },
      queueUpdateKind: undefined
    }));
    flushPendingLocalStorage();
    vi.clearAllMocks();

    // Another writer mutates songIds (structural change) while kind is set to 'position'
    const mutatedQueue = {
      queues: [
        {
          id: 'test-queue',
          songIds: [1, 2, 3, 4],
          position: 0
        }
      ],
      currentQueueIndex: 0
    };

    store.setState((state) => ({
      ...state,
      localStorage: { ...prev, queue: mutatedQueue as any },
      queueUpdateKind: 'position'
    }));

    vi.advanceTimersByTime(550);
    // Because songIds reference changed, isStructuralQueueEqual returned false and scheduled persistence
    expect(storage.setLocalStorage).toHaveBeenCalledTimes(1);
  });
});
