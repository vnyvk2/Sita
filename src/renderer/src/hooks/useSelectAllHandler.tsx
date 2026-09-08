import { useCallback, useContext, useMemo } from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';
import { store } from '../store/store';

const slice = (arr: number[], start: number, end: number) => {
  if (start > end) {
    return arr.slice(end, start + 1).reverse();
  }
  return arr.slice(start, end + 1);
};

// Overload 1: Flat number array (e.g. filteredSongIds, currentQueue)
function useSelectAllHandler(
  arr: number[],
  selectionType: QueueTypes
): (upToId?: number) => void;

// Overload 2: Array of objects with an ID property
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useSelectAllHandler<Obj extends Record<string, any>>(
  arr: Obj[],
  selectionType: QueueTypes,
  idProperty: keyof Obj
): (upToId?: number) => void;

// Implementation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useSelectAllHandler<Obj extends Record<string, any>>(
  arr: Obj[] | number[],
  selectionType: QueueTypes,
  idProperty?: keyof Obj
) {
  const { toggleMultipleSelections } = useContext(AppUpdateContext);

  // Extract flat ID array and build O(1) index map.
  // Branch on overload shape (idProperty presence), not on arr[0] inspection,
  // so empty number[] correctly resolves to [] instead of falling through.
  const { idList, indexById } = useMemo(() => {
    const ids: number[] =
      idProperty === undefined
        ? (arr as number[])
        : (arr as Obj[]).map((prop) => prop[idProperty] as number);

    const map = new Map<number, number>();
    for (let i = 0; i < ids.length; i += 1) {
      map.set(ids[i], i);
    }
    return { idList: ids, indexById: map };
  }, [arr, idProperty]);

  const selectAllHandler = useCallback(
    (upToId?: number) => {
      const multipleSelectionsData = store.state.multipleSelectionsData;
      const ids: number[] = [...multipleSelectionsData.multipleSelections];

      if (upToId !== undefined) {
        if (multipleSelectionsData.multipleSelections.length > 0) {
          const currIndex = indexById.get(upToId);
          const lastAddedId = multipleSelectionsData.multipleSelections.at(-1);
          const lastAddedIndex = lastAddedId !== undefined ? indexById.get(lastAddedId) : undefined;

          if (lastAddedIndex !== undefined && currIndex !== undefined) {
            const selectedIds = slice(idList, lastAddedIndex, currIndex);
            ids.push(...selectedIds);
          }
        } else {
          ids.push(upToId);
        }
      } else {
        if (idList.length !== multipleSelectionsData.multipleSelections.length) {
          ids.push(...idList);
        }
      }

      const uniqueIds = new Set(ids);
      toggleMultipleSelections(true, selectionType, [...uniqueIds], true);
    },
    [idList, indexById, selectionType, toggleMultipleSelections]
  );

  return selectAllHandler;
}

export default useSelectAllHandler;
