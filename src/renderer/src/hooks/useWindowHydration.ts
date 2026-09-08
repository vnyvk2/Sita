import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { SONG_WINDOW_GC_TIME, SONG_WINDOW_SIZE, SONG_WINDOW_STALE_TIME } from '../queries/songs';
import { scrollTrace } from '../utils/scrollTrace';

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
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const coordListIdentity = `${keyPrefix}:${listIdentity}`;
  const generationRef = useRef(0);
  const lookaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bump generation token and clear pending lookaheads when list version changes
  const prevIdsVersionRef = useRef(idsVersion);
  if (prevIdsVersionRef.current !== idsVersion) {
    prevIdsVersionRef.current = idsVersion;
    generationRef.current += 1;
    if (lookaheadTimerRef.current) {
      clearTimeout(lookaheadTimerRef.current);
    }
  }

  // Snapped strictly to 200-row window chunks to prevent firing state updates on every scroll frame
  const [windowBounds, setWindowBounds] = useState<WindowBounds>(() =>
    computeWindowBounds(initialIndex, initialIndex, extraRowsBefore, extraRowsAfter, ids.length)
  );

  const scheduleLookahead = useCallback(
    (bounds: WindowBounds, token: number) => {
      if (!enabled || ids.length === 0 || !idsVersion) return;
      const maxWindow = Math.floor(Math.max(ids.length - 1, 0) / SONG_WINDOW_SIZE);

      // Forward lookahead
      const lookaheadForward = bounds.lastWindow + 1;
      if (lookaheadForward <= maxWindow) {
        const lookaheadStart = lookaheadForward * SONG_WINDOW_SIZE;
        const lookaheadEnd = Math.min(lookaheadStart + SONG_WINDOW_SIZE, ids.length);
        if (lookaheadStart < lookaheadEnd) {
          scrollTrace.onRequestScheduled(lookaheadStart, true);
          queryClient.prefetchQuery({
            queryKey: [keyPrefix, 'window', listIdentity, idsVersion, lookaheadStart],
            queryFn: async () => {
              scrollTrace.onRequestStarted(lookaheadStart);
              const t0 = performance.now();
              try {
                const res = await window.api.audioLibraryControls.getSongInfo(
                  idsRef.current.slice(lookaheadStart, lookaheadEnd),
                  undefined,
                  undefined,
                  undefined,
                  true,
                  {
                    generationToken: token,
                    priority: 'lookahead',
                    listIdentity: coordListIdentity
                  }
                );
                if (res && 'cancelled' in res && res.cancelled) {
                  const err = new Error(`Lookahead window ${lookaheadStart} cancelled (generation ${token})`);
                  err.name = 'AbortError';
                  throw err;
                }
                scrollTrace.onRequestResolved(lookaheadStart, performance.now() - t0, res?.length ?? 0);
                return res as SongData[];
              } catch (e) {
                scrollTrace.onRequestResolved(lookaheadStart, performance.now() - t0, 0);
                throw e;
              }
            },
            staleTime: SONG_WINDOW_STALE_TIME,
            gcTime: SONG_WINDOW_GC_TIME
          });
        }
      }

      // Backward lookahead
      const lookaheadBackward = bounds.firstWindow - 1;
      if (lookaheadBackward >= 0) {
        const lookaheadStart = lookaheadBackward * SONG_WINDOW_SIZE;
        const lookaheadEnd = Math.min(lookaheadStart + SONG_WINDOW_SIZE, ids.length);
        if (lookaheadStart < lookaheadEnd) {
          scrollTrace.onRequestScheduled(lookaheadStart, true);
          queryClient.prefetchQuery({
            queryKey: [keyPrefix, 'window', listIdentity, idsVersion, lookaheadStart],
            queryFn: async () => {
              scrollTrace.onRequestStarted(lookaheadStart);
              const t0 = performance.now();
              try {
                const res = await window.api.audioLibraryControls.getSongInfo(
                  idsRef.current.slice(lookaheadStart, lookaheadEnd),
                  undefined,
                  undefined,
                  undefined,
                  true,
                  {
                    generationToken: token,
                    priority: 'lookahead',
                    listIdentity: coordListIdentity
                  }
                );
                if (res && 'cancelled' in res && res.cancelled) {
                  const err = new Error(`Lookahead window ${lookaheadStart} cancelled (generation ${token})`);
                  err.name = 'AbortError';
                  throw err;
                }
                scrollTrace.onRequestResolved(lookaheadStart, performance.now() - t0, res?.length ?? 0);
                return res as SongData[];
              } catch (e) {
                scrollTrace.onRequestResolved(lookaheadStart, performance.now() - t0, 0);
                throw e;
              }
            },
            staleTime: SONG_WINDOW_STALE_TIME,
            gcTime: SONG_WINDOW_GC_TIME
          });
        }
      }
    },
    [enabled, ids.length, idsVersion, queryClient, keyPrefix, listIdentity, coordListIdentity]
  );

  const handleRangeChange = useCallback(
    (range: WindowRange) => {
      scrollTrace.onRangeChanged(range);
      const nextBounds = computeWindowBounds(
        range.startIndex,
        range.endIndex,
        extraRowsBefore,
        extraRowsAfter,
        ids.length
      );

      // Debounce lookahead prefetching by 100ms: during rapid scrolling, intermediate lookaheads
      // are suppressed completely, eliminating tens of obsolete IPC requests
      if (lookaheadTimerRef.current) {
        clearTimeout(lookaheadTimerRef.current);
      }
      lookaheadTimerRef.current = setTimeout(() => {
        scheduleLookahead(nextBounds, generationRef.current);
      }, 100);

      setWindowBounds((prev) => {
        if (
          prev.firstWindow === nextBounds.firstWindow &&
          prev.lastWindow === nextBounds.lastWindow
        ) {
          return prev; // BAIL OUT: Zero state updates, Zero parent component re-renders!
        }
        generationRef.current += 1;

        // Cancel in-flight queries for windows that are now evicted from the active range
        for (let w = prev.firstWindow; w <= prev.lastWindow; w += 1) {
          if (w < nextBounds.firstWindow || w > nextBounds.lastWindow) {
            const evictedStart = w * SONG_WINDOW_SIZE;
            queryClient.cancelQueries({
              queryKey: [keyPrefix, 'window', listIdentity, idsVersion, evictedStart]
            });
          }
        }

        return nextBounds;
      });
    },
    [extraRowsBefore, extraRowsAfter, ids.length, idsVersion, keyPrefix, listIdentity, queryClient, scheduleLookahead]
  );

  // Clear pending lookahead timers on unmount
  useEffect(() => {
    return () => {
      if (lookaheadTimerRef.current) {
        clearTimeout(lookaheadTimerRef.current);
      }
    };
  }, []);

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
      queryFn: async () => {
        const token = generationRef.current;
        scrollTrace.onRequestScheduled(win.startIndex, false);
        scrollTrace.onRequestStarted(win.startIndex);
        const t0 = performance.now();
        try {
          const res = await window.api.audioLibraryControls.getSongInfo(
            ids.slice(win.startIndex, win.endIndex),
            undefined,
            undefined,
            undefined,
            true,
            {
              generationToken: token,
              priority: 'target',
              listIdentity: coordListIdentity
            }
          );
          if (res && 'cancelled' in res && res.cancelled) {
            const err = new Error(`Target window ${win.startIndex} cancelled (generation ${token})`);
            err.name = 'AbortError';
            throw err;
          }
          scrollTrace.onRequestResolved(win.startIndex, performance.now() - t0, res?.length ?? 0);
          return res as SongData[];
        } catch (e) {
          scrollTrace.onRequestResolved(win.startIndex, performance.now() - t0, 0);
          throw e;
        }
      },
      staleTime: SONG_WINDOW_STALE_TIME,
      gcTime: SONG_WINDOW_GC_TIME,
      retry: false,
      enabled
    }))
  });

  const itemsByIndex = useMemo(() => {
    const map = new Map<number, SongData>();
    queries.forEach((query, i) => {
      const win = windows[i];
      const data = query.data;
      if (!win || !data || !Array.isArray(data)) return;

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

  // Lazily-built Map<songId, SongData> per window for O(1) fallback lookups
  // instead of linear Array.find scans in the hot render path.
  const windowLookupCacheRef = useRef(new Map<number, Map<number, SongData>>());
  const windowLookupVersionRef = useRef(idsVersion);
  // Clear the lookup cache when the IDs version changes
  if (windowLookupVersionRef.current !== idsVersion) {
    windowLookupCacheRef.current.clear();
    windowLookupVersionRef.current = idsVersion;
  }

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

      if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        if (targetId !== undefined) {
          const offset = index - windowStart;
          const candidate = cachedData[offset];
          const candidateId = candidate?.songId ?? (candidate as unknown as { id: number })?.id;
          if (candidateId === targetId) {
            itemsByIndexRef.current.set(index, candidate);
            return candidate;
          }
          // Lazily build a Map<songId, SongData> for this window on first miss,
          // then use O(1) lookups for subsequent misses instead of O(n) Array.find.
          let windowMap = windowLookupCacheRef.current.get(windowStart);
          if (!windowMap) {
            windowMap = new Map<number, SongData>();
            for (const s of cachedData) {
              const id = s.songId ?? (s as unknown as { id: number }).id;
              if (id !== undefined) windowMap.set(id, s);
            }
            windowLookupCacheRef.current.set(windowStart, windowMap);
          }
          const found = windowMap.get(targetId);
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
