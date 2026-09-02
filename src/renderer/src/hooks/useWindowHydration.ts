import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { SONG_WINDOW_GC_TIME, SONG_WINDOW_SIZE, SONG_WINDOW_STALE_TIME } from '../queries/songs';

interface WindowRange {
  startIndex: number;
  endIndex: number;
}

interface WindowBounds {
  firstWindow: number;
  lastWindow: number;
}

function computeWindowBounds(
  startIndex: number,
  endIndex: number,
  extraBefore: number,
  extraAfter: number,
  totalIds: number
): WindowBounds {
  if (totalIds === 0) return { firstWindow: 0, lastWindow: 0 };
  const start = Math.max(0, startIndex - extraBefore);
  const end = Math.min(totalIds, Math.max(endIndex + extraAfter, 1));
  const firstWindow = Math.floor(start / SONG_WINDOW_SIZE);
  const lastWindow = Math.floor(Math.max(end - 1, 0) / SONG_WINDOW_SIZE);
  return { firstWindow, lastWindow };
}

export function useWindowHydration(
  ids: readonly number[],
  idsVersion: number | string,
  options?: {
    enabled?: boolean;
    extraRowsBefore?: number;
    extraRowsAfter?: number;
    /**
     * Cache-key namespace; use a distinct prefix when list order is not library order (e.g.
     * queues).
     */
    keyPrefix?: string;
    /** Logical query/list identity to prevent cache collision across distinct filters/sorts */
    listIdentity?: string;
    /** Initial visible item index when restoring scroll position */
    initialIndex?: number;
  }
) {
  const {
    enabled = true,
    extraRowsBefore = 75,
    extraRowsAfter = 150,
    keyPrefix = 'songs',
    listIdentity = 'default',
    initialIndex = 0
  } = options ?? {};

  const queryClient = useQueryClient();

  // Snapped strictly to 200-row window chunks to prevent firing state updates on every scroll frame
  const [windowBounds, setWindowBounds] = useState<WindowBounds>(() =>
    computeWindowBounds(initialIndex, initialIndex, extraRowsBefore, extraRowsAfter, ids.length)
  );

  const handleRangeChange = useCallback(
    (range: WindowRange) => {
      const nextBounds = computeWindowBounds(
        range.startIndex,
        range.endIndex,
        extraRowsBefore,
        extraRowsAfter,
        ids.length
      );

      // Aligned chunk lookahead prefetching: prefetch the next window ahead in the background (0 React re-renders)
      if (enabled && ids.length > 0 && idsVersion) {
        const maxWindow = Math.floor(Math.max(ids.length - 1, 0) / SONG_WINDOW_SIZE);
        const lookaheadWindow = nextBounds.lastWindow + 1;
        if (lookaheadWindow <= maxWindow) {
          const lookaheadStart = lookaheadWindow * SONG_WINDOW_SIZE;
          const lookaheadEnd = Math.min(lookaheadStart + SONG_WINDOW_SIZE, ids.length);
          if (lookaheadStart < lookaheadEnd) {
            queryClient.prefetchQuery({
              queryKey: [keyPrefix, 'window', listIdentity, idsVersion, lookaheadStart],
              queryFn: () =>
                window.api.audioLibraryControls.getSongInfo(
                  ids.slice(lookaheadStart, lookaheadEnd),
                  undefined,
                  undefined,
                  undefined,
                  true
                ),
              staleTime: SONG_WINDOW_STALE_TIME,
              gcTime: SONG_WINDOW_GC_TIME
            });
          }
        }
      }

      setWindowBounds((prev) => {
        if (
          prev.firstWindow === nextBounds.firstWindow &&
          prev.lastWindow === nextBounds.lastWindow
        ) {
          return prev; // BAIL OUT: Zero state updates, Zero parent component re-renders!
        }
        return nextBounds;
      });
    },
    [extraRowsBefore, extraRowsAfter, ids.length, idsVersion, enabled, keyPrefix, listIdentity, queryClient]
  );

  const windows = useMemo<WindowRange[]>(() => {
    if (!enabled || ids.length === 0 || !idsVersion) {
      return [{ startIndex: 0, endIndex: Math.min(SONG_WINDOW_SIZE, ids.length) }];
    }

    const list: WindowRange[] = [];
    for (let w = windowBounds.firstWindow; w <= windowBounds.lastWindow; w += 1) {
      const windowStart = w * SONG_WINDOW_SIZE;
      list.push({
        startIndex: windowStart,
        endIndex: Math.min(windowStart + SONG_WINDOW_SIZE, ids.length)
      });
    }
    return list;
  }, [ids.length, idsVersion, windowBounds, enabled]);

  const queries = useQueries({
    queries: windows.map((win) => ({
      queryKey: [keyPrefix, 'window', listIdentity, idsVersion, win.startIndex],
      queryFn: () =>
        window.api.audioLibraryControls.getSongInfo(
          ids.slice(win.startIndex, win.endIndex),
          undefined,
          undefined,
          undefined,
          true
        ),
      staleTime: SONG_WINDOW_STALE_TIME,
      gcTime: SONG_WINDOW_GC_TIME,
      enabled
    }))
  });

  const itemsByIndex = useMemo(() => {
    const map = new Map<number, SongData>();
    queries.forEach((query, i) => {
      const win = windows[i];
      const data = query.data;
      if (!win || !data) return;

      const responseById = new Map<number, SongData>();
      for (const item of data) {
        const itemId = item.songId ?? (item as unknown as { id: number }).id;
        if (itemId !== undefined) {
          responseById.set(itemId, item);
        }
      }

      for (let k = 0; k < win.endIndex - win.startIndex; k += 1) {
        const requestedId = ids[win.startIndex + k];
        if (requestedId !== undefined) {
          const item = responseById.get(requestedId);
          if (item) {
            map.set(win.startIndex + k, item);
          }
        }
      }
    });
    return map;
  }, [queries, windows, ids]);

  const itemsByIndexRef = useRef(itemsByIndex);
  itemsByIndexRef.current = itemsByIndex;

  const idsRef = useRef(ids);
  idsRef.current = ids;

  const getItem = useCallback(
    (index: number) => {
      const targetId = idsRef.current[index];

      // 1. Fast path: check current itemsByIndex map in ref (O(1))
      const direct = itemsByIndexRef.current.get(index);
      if (direct) return direct;

      // 2. Direct synchronous queryClient cache fallback across windows
      const windowStart = Math.floor(index / SONG_WINDOW_SIZE) * SONG_WINDOW_SIZE;
      const cachedData = queryClient.getQueryData<SongData[]>([
        keyPrefix,
        'window',
        listIdentity,
        idsVersion,
        windowStart
      ]);

      if (cachedData && cachedData.length > 0) {
        if (targetId !== undefined) {
          const offset = index - windowStart;
          const candidate = cachedData[offset];
          const candidateId = candidate?.songId ?? (candidate as unknown as { id: number })?.id;
          if (candidateId === targetId) {
            itemsByIndexRef.current.set(index, candidate);
            return candidate;
          }
          const found = cachedData.find(
            (s) => (s.songId ?? (s as unknown as { id: number }).id) === targetId
          );
          if (found) {
            itemsByIndexRef.current.set(index, found);
            return found;
          }
        }
      }

      return undefined;
    },
    [queryClient, keyPrefix, listIdentity, idsVersion]
  );

  return { getItem, onRangeChange: handleRangeChange };
}
