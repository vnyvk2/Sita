// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  getSelectedIdSet,
  getSelectedSongsSet,
  useSongSelection
} from '../../../../../src/renderer/src/contexts/MultipleSelectionContext';
import { dispatch } from '../../../../../src/renderer/src/store/store';

describe('MultipleSelectionContext', () => {
  it('constructs Set once per array reference and performs O(1) lookups', () => {
    expect(getSelectedIdSet).toBe(getSelectedSongsSet);

    const array1 = [10, 20, 30];
    const set1 = getSelectedIdSet(array1);
    const set2 = getSelectedIdSet(array1);

    expect(set1).toBe(set2); // Stable cached reference
    expect(set1.has(10)).toBe(true);
    expect(set1.has(99)).toBe(false);

    const array2 = [10, 20, 30, 40];
    const set3 = getSelectedIdSet(array2);
    expect(set3).not.toBe(set1);
    expect(set3.has(40)).toBe(true);
  });

  it('performs constant-time selection lookups reacting to store state', () => {
    dispatch({
      type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
      data: {
        isEnabled: true,
        selectionType: 'songs',
        multipleSelections: [10, 20, 30]
      }
    });

    const { result: song10 } = renderHook(() => useSongSelection(10));
    const { result: song99 } = renderHook(() => useSongSelection(99));

    expect(song10.current.isEnabled).toBe(true);
    expect(song10.current.isSelected).toBe(true);

    expect(song99.current.isEnabled).toBe(true);
    expect(song99.current.isSelected).toBe(false);

    // Clean up store state
    dispatch({
      type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
      data: {
        isEnabled: false,
        selectionType: undefined,
        multipleSelections: []
      }
    });
  });
});
