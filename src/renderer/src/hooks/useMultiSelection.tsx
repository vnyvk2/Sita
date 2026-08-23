import { useCallback } from 'react';

import { dispatch, store } from '../store/store';

export interface UseMultiSelectionReturn {
  updateMultipleSelections: (id: number, selectionType: QueueTypes, type: 'add' | 'remove') => void;
  toggleMultipleSelections: (
    isEnabled?: boolean,
    selectionType?: QueueTypes,
    addSelections?: number[],
    replaceSelections?: boolean
  ) => void;
}

/**
 * Hook for managing multiple selection state.
 *
 * Provides functions to add/remove individual selections and toggle the multi-selection mode
 * on/off. Used when selecting multiple songs, albums, artists, etc. for batch operations.
 *
 * @example
 *   ```tsx
 *   function ItemList() {
 *     const { updateMultipleSelections, toggleMultipleSelections } = useMultiSelection();
 *
 *     const handleSelect = (id: string) => {
 *       updateMultipleSelections(id, 'SONGS', 'add');
 *     };
 *
 *     const handleEnableMultiSelect = () => {
 *       toggleMultipleSelections(true, 'SONGS');
 *     };
 *   }
 *   ```;
 *
 * @returns Multi-selection management functions
 */
export function useMultiSelection(): UseMultiSelectionReturn {
  const updateMultipleSelections = useCallback(
    (id: number, selectionType: QueueTypes, type: 'add' | 'remove') => {
      // Prevent changing selection type mid-selection
      if (
        store.state.multipleSelectionsData.selectionType &&
        selectionType !== store.state.multipleSelectionsData.selectionType
      )
        return;

      const currentData = store.state.multipleSelectionsData;
      let currentSelections = [...currentData.multipleSelections];

      if (type === 'add') {
        if (currentSelections.includes(id)) return;
        currentSelections.push(id);
      } else if (type === 'remove') {
        if (!currentSelections.includes(id)) return;
        currentSelections = currentSelections.filter((selection) => selection !== id);
      }

      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          ...currentData,
          selectionType,
          multipleSelections: currentSelections
        } as MultipleSelectionData
      });
    },
    []
  );

  const toggleMultipleSelections = useCallback(
    (
      isEnabled?: boolean,
      selectionType?: QueueTypes,
      addSelections?: number[],
      replaceSelections = false
    ) => {
      const currentData = store.state.multipleSelectionsData;

      if (typeof isEnabled === 'boolean') {
        let newSelections = isEnabled ? [...currentData.multipleSelections] : [];

        if (Array.isArray(addSelections) && isEnabled === true) {
          if (replaceSelections) {
            newSelections = [...addSelections];
          } else {
            const set = new Set(newSelections);
            for (const item of addSelections) {
              set.add(item);
            }
            newSelections = Array.from(set);
          }
        }

        dispatch({
          type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
          data: {
            ...currentData,
            isEnabled,
            selectionType: isEnabled ? selectionType : undefined,
            multipleSelections: newSelections
          } as MultipleSelectionData
        });
      }
    },
    []
  );

  return {
    updateMultipleSelections,
    toggleMultipleSelections
  };
}
