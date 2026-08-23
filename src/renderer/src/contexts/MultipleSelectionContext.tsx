import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';

let cachedArrayRef: number[] | null = null;
let cachedSet: Set<number> = new Set();

/**
 * Returns a cached Set<number> derived from the canonical multipleSelections array.
 * Reconstructed ONCE per array identity change.
 */
export function getSelectedSongsSet(selections: number[]): Set<number> {
  if (selections !== cachedArrayRef) {
    cachedArrayRef = selections;
    cachedSet = new Set(selections);
  }
  return cachedSet;
}

/**
 * Hook to check if a specific song is selected in constant O(1) time.
 * Automatically bails out of re-rendering when the selection boolean is unchanged.
 */
export function useSongSelection(songId: number) {
  const isSelected = useStore(store, (state) => {
    const data = state.multipleSelectionsData;
    if (!data.isEnabled || data.selectionType !== 'songs') {
      return false;
    }
    const set = getSelectedSongsSet(data.multipleSelections);
    return set.has(songId);
  });

  const isEnabled = useStore(
    store,
    (state) =>
      state.multipleSelectionsData.isEnabled &&
      state.multipleSelectionsData.selectionType === 'songs'
  );

  return {
    isSelected,
    isEnabled
  };
}
