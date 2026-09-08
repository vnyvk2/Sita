// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../src/renderer/src/contexts/AppUpdateContext';
import useSelectAllHandler from '../../../../../src/renderer/src/hooks/useSelectAllHandler';
import { dispatch, store } from '../../../../../src/renderer/src/store/store';

describe('useSelectAllHandler Hook', () => {
  const toggleMultipleSelectionsMock = vi.fn();

  const mockContextValue = {
    toggleMultipleSelections: toggleMultipleSelectionsMock
  } as unknown as AppUpdateContextType;

  const createWrapper = () => {
    return ({ children }: { children: ReactNode }) => (
      <AppUpdateContext.Provider value={mockContextValue}>{children}</AppUpdateContext.Provider>
    );
  };

  const sampleSongs = Array.from({ length: 10 }, (_, i) => ({
    songId: i + 1,
    title: `Song ${i + 1}`
  }));

  beforeEach(() => {
    toggleMultipleSelectionsMock.mockClear();
    dispatch({
      type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
      data: {
        isEnabled: false,
        selectionType: 'songs',
        multipleSelections: []
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Callback Identity Stability: callback reference remains strictly identical across selection mutations', () => {
    const { result, rerender } = renderHook(
      () => useSelectAllHandler(sampleSongs, 'songs', 'songId'),
      { wrapper: createWrapper() }
    );

    const initialCallback = result.current;

    // Mutate selection: [1]
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [1]
        }
      });
    });
    rerender();
    expect(result.current).toBe(initialCallback);

    // Mutate selection: [1, 2, 3]
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [1, 2, 3]
        }
      });
    });
    rerender();
    expect(result.current).toBe(initialCallback);

    // Deselect: [3]
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [3]
        }
      });
    });
    rerender();
    expect(result.current).toBe(initialCallback);
  });

  it('Latest State at Invocation (Shift-Click Range): reads live store.state at invocation time without hook recreation', () => {
    const { result } = renderHook(() => useSelectAllHandler(sampleSongs, 'songs', 'songId'), {
      wrapper: createWrapper()
    });

    const handler = result.current;

    // Set initial selection to Song 3 without re-rendering or recreating hook
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [3]
        }
      });
    });

    // Invoke handler with upToId = 7 (shift-click on Song 7)
    act(() => {
      handler(7);
    });

    // Should slice from index of Song 3 (index 2) to index of Song 7 (index 6): [3, 4, 5, 6, 7]
    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(1);
    expect(toggleMultipleSelectionsMock).toHaveBeenCalledWith(true, 'songs', [3, 4, 5, 6, 7], true);

    // Now update selection to Song 8
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [8]
        }
      });
    });

    // Reverse shift-click: from Song 8 to Song 5
    act(() => {
      handler(5);
    });

    // Reverse slice from 8 down to 5: [8, 5, 6, 7] -> unique [8, 5, 6, 7]
    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(2);
    const lastCallArgs = toggleMultipleSelectionsMock.mock.calls[1];
    expect(lastCallArgs[0]).toBe(true);
    expect(lastCallArgs[1]).toBe('songs');
    expect(new Set(lastCallArgs[2])).toEqual(new Set([5, 6, 7, 8]));
  });

  it('Select All (Ctrl-A): selects all items in dataset when called with no arguments', () => {
    const { result } = renderHook(() => useSelectAllHandler(sampleSongs, 'songs', 'songId'), {
      wrapper: createWrapper()
    });

    // Initial partial selection: [2, 4]
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [2, 4]
        }
      });
    });

    act(() => {
      result.current(); // Select all
    });

    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(1);
    const calledIds: number[] = toggleMultipleSelectionsMock.mock.calls[0][2];
    expect(calledIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('First Item Selection (Empty Initial State): adds target ID when selection is empty', () => {
    const { result } = renderHook(() => useSelectAllHandler(sampleSongs, 'songs', 'songId'), {
      wrapper: createWrapper()
    });

    act(() => {
      result.current(5);
    });

    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(1);
    expect(toggleMultipleSelectionsMock).toHaveBeenCalledWith(true, 'songs', [5], true);
  });

  it('Flat number[] overload: selects all items and supports shift-click range selection', () => {
    const flatIds = [101, 102, 103, 104, 105];
    const { result } = renderHook(() => useSelectAllHandler(flatIds, 'songs'), {
      wrapper: createWrapper()
    });

    // Shift click to select range up to 103 starting with 101 selected
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [101]
        }
      });
    });

    act(() => {
      result.current(103);
    });

    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(1);
    expect(toggleMultipleSelectionsMock).toHaveBeenCalledWith(
      true,
      'songs',
      [101, 102, 103],
      true
    );

    // Ctrl-A: Select all
    act(() => {
      result.current();
    });

    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(2);
    expect(toggleMultipleSelectionsMock.mock.calls[1][2]).toEqual([101, 102, 103, 104, 105]);
  });

  it('Empty number[] array: handles empty array cleanly without crashing or unexpected selections', () => {
    const emptyIds: number[] = [];
    const { result } = renderHook(() => useSelectAllHandler(emptyIds, 'songs'), {
      wrapper: createWrapper()
    });

    // Calling select all on empty list
    act(() => {
      result.current();
    });

    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(1);
    expect(toggleMultipleSelectionsMock).toHaveBeenCalledWith(true, 'songs', [], true);

    // Shift click on an ID when list is empty
    act(() => {
      result.current(42);
    });

    expect(toggleMultipleSelectionsMock).toHaveBeenCalledTimes(2);
    expect(toggleMultipleSelectionsMock).toHaveBeenCalledWith(true, 'songs', [42], true);
  });
});
