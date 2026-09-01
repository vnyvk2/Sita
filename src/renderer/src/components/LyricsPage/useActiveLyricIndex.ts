import { useEffect, useRef, useState } from 'react';

/** Binary search to find the active lyric index in O(log N) time */
function findActiveLyricIndex(
  parsedLyrics: ParsedLyricsLine[],
  pos: number,
  offset: number
): number | null {
  let low = 0;
  let high = parsedLyrics.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = parsedLyrics[mid];
    const start = (line.start || 0) + offset;
    const end =
      line.end === Number.POSITIVE_INFINITY || !line.end
        ? Number.POSITIVE_INFINITY
        : line.end + offset;

    if (pos < start) {
      high = mid - 1;
    } else if (pos >= end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return null;
}

/**
 * Custom hook to track the active lyric line index using a single global event listener. Employs
 * O(1) monotonic active line tracking during linear playback with O(log N) binary search fallback
 * on seeks and jumps.
 *
 * Returns the index of the currently active line: - `-1` for the intro placeholder line ('•••')
 * before the first timestamp - `0..N-1` for parsedLyrics[i] - `null` when no lyric line is active
 * (e.g. between distant lines or after the song ends)
 */
export function useActiveLyricIndex(lyrics?: SongLyrics | null): number | null {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const currentIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!lyrics?.lyrics?.isSynced || !lyrics.lyrics.parsedLyrics?.length) {
      setActiveLineIndex(null);
      currentIndexRef.current = null;
      return undefined;
    }

    const { parsedLyrics, offset = 0 } = lyrics.lyrics;
    const hasIntroLine = (parsedLyrics[0]?.start || 0) !== 0;
    const introEnd = (parsedLyrics[0]?.start || 0) + offset;

    const handlePositionChange = (e: Event) => {
      if (!('detail' in e) || typeof e.detail !== 'number') return;
      const pos = e.detail;

      // Check intro line ('•••')
      if (hasIntroLine && pos >= 0 && pos < introEnd) {
        if (currentIndexRef.current !== -1) {
          currentIndexRef.current = -1;
          setActiveLineIndex(-1);
        }
        return;
      }

      const curr = currentIndexRef.current;

      // 1. O(1) Fast-path: Still in current active line
      if (curr !== null && curr >= 0 && curr < parsedLyrics.length) {
        const line = parsedLyrics[curr];
        const start = (line.start || 0) + offset;
        const end =
          line.end === Number.POSITIVE_INFINITY || !line.end
            ? Number.POSITIVE_INFINITY
            : line.end + offset;

        if (pos >= start && pos < end) {
          return; // No state update needed, still in the active line
        }

        // 2. O(1) Fast-path: Monotonic progression to immediate next line (standard playback)
        if (curr + 1 < parsedLyrics.length) {
          const nextLine = parsedLyrics[curr + 1];
          const nextStart = (nextLine.start || 0) + offset;
          const nextEnd =
            nextLine.end === Number.POSITIVE_INFINITY || !nextLine.end
              ? Number.POSITIVE_INFINITY
              : nextLine.end + offset;

          if (pos >= nextStart && pos < nextEnd) {
            currentIndexRef.current = curr + 1;
            setActiveLineIndex(curr + 1);
            return;
          }
        }
      }

      // 3. O(log N) Fallback: Binary search for seeks, track jumps, or gap regions
      const foundIndex = findActiveLyricIndex(parsedLyrics, pos, offset);
      if (currentIndexRef.current !== foundIndex) {
        currentIndexRef.current = foundIndex;
        setActiveLineIndex(foundIndex);
      }
    };

    document.addEventListener('player/positionChange', handlePositionChange);
    return () => {
      document.removeEventListener('player/positionChange', handlePositionChange);
    };
  }, [lyrics]);

  return activeLineIndex;
}

export default useActiveLyricIndex;
