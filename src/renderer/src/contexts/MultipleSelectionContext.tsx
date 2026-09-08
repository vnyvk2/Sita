import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';

const selectionSetCache = new WeakMap<number[], Set<number>>();

/**
 * Returns a memoized Set<number> derived from the canonical multipleSelections array reference.
 * Garbage-collected automatically when the array reference is replaced.
 * Generic over all selection types (songs, albums, artists, genres, playlists):
 * every card selector shares one Set build per array identity instead of
 * each running an O(N) Array.includes scan per store dispatch.
 */
export function getSelectedIdSet(selections: number[]): Set<number> {
  let set = selectionSetCache.get(selections);
  if (!set) {
    set = new Set(selections);
    selectionSetCache.set(selections, set);
  }
  return set;
}

/** Alias kept for existing song-row callers. */
export const getSelectedSongsSet = getSelectedIdSet;

/**
 * Hook to check if a specific song is selected in constant O(1) time. Automatically bails out of
 * re-rendering when the selection boolean is unchanged.
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
