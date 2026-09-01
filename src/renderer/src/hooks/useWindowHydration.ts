import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { SONG_WINDOW_GC_TIME, SONG_WINDOW_SIZE, SONG_WINDOW_STALE_TIME } from '../queries/songs';

interface WindowRange {
  startIndex: number;
  endIndex: number;
}

/**
 * Hydrates SongData for the visible region of an ID-first list.
 *
 * Rows are fetched in aligned windows of SONG_WINDOW_SIZE; `getItem` returns
 * undefined for indices that are not hydrated yet so callers can render a
 * layout-stable skeleton placeholder.
 */
export function useWindowHydration(
  ids: readonly number[],
  idsVersion: number | string,
  options?: {
    enabled?: boolean;
    extraRowsBefore?: number;
    extraRowsAfter?: number;
    /** Cache-key namespace; use a distinct prefix when list order is not library order (e.g. queues). */
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

  const [visibleRange, setVisibleRange] = useState<WindowRange>(() => ({
    startIndex: Math.max(0, initialIndex),
    endIndex: Math.max(0, initialIndex)
  }));

  const handleRangeChange = useCallback((range: WindowRange) => {
    setVisibleRange((prev) => {
      if (prev.startIndex === range.startIndex && prev.endIndex === range.endIndex) {
        return prev;
      }
      return { startIndex: range.startIndex, endIndex: range.endIndex };
    });
  }, []);

  const windows = useMemo<WindowRange[]>(() => {
    if (!enabled || ids.length === 0 || !idsVersion) {
      return [{ startIndex: 0, endIndex: Math.min(SONG_WINDOW_SIZE, ids.length) }];
    }

    let start = Math.max(0, visibleRange.startIndex - extraRowsBefore);
    let end = Math.min(ids.length, Math.max(visibleRange.endIndex + extraRowsAfter, 1));

    if (end <= start) {
      start = 0;
      end = Math.min(SONG_WINDOW_SIZE, ids.length);
    }

    const firstWindow = Math.floor(start / SONG_WINDOW_SIZE);
    const lastWindow = Math.floor(Math.max(end - 1, 0) / SONG_WINDOW_SIZE);

    const list: WindowRange[] = [];
    for (let w = firstWindow; w <= lastWindow; w += 1) {
      const windowStart = w * SONG_WINDOW_SIZE;
      list.push({
        startIndex: windowStart,
        endIndex: Math.min(windowStart + SONG_WINDOW_SIZE, ids.length)
      });
    }
    return list;
  }, [ids, idsVersion, visibleRange, enabled, extraRowsBefore, extraRowsAfter]);

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
        responseById.set(item.songId, item);
      }

      for (let k = 0; k < (win.endIndex - win.startIndex); k += 1) {
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

  const getItem = useCallback(
    (index: number) => {
      // 1. Fast path: check current itemsByIndex map
      const direct = itemsByIndex.get(index);
      if (direct) return direct;

      // 2. Direct synchronous queryClient cache fallback!
      // Bypasses the 1-frame React state update lag when Virtuoso renders
      // before setVisibleRange has flushed the new window into `queries`.
      const windowStart = Math.floor(index / SONG_WINDOW_SIZE) * SONG_WINDOW_SIZE;
      const cachedData = queryClient.getQueryData<SongData[]>([
        keyPrefix,
        'window',
        listIdentity,
        idsVersion,
        windowStart
      ]);

      if (cachedData && cachedData.length > 0) {
        const targetId = ids[index];
        if (targetId !== undefined) {
          const offset = index - windowStart;
          if (cachedData[offset]?.songId === targetId) {
            return cachedData[offset];
          }
          return cachedData.find((s) => s.songId === targetId);
        }
      }

      return undefined;
    },
    [itemsByIndex, queryClient, keyPrefix, listIdentity, idsVersion, ids]
  );

  return { getItem, onRangeChange: handleRangeChange };
}
