import { useEffect, useState } from 'react';

/**
 * Custom hook to track the active lyric line index using a single global event listener.
 * Returns the index of the currently active line:
 * - `-1` for the intro placeholder line ('•••') before the first timestamp
 * - `0..N-1` for parsedLyrics[i]
 * - `null` when no lyric line is active (e.g. between distant lines or after the song ends)
 */
export function useActiveLyricIndex(lyrics?: SongLyrics | null): number | null {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!lyrics?.lyrics?.isSynced || !lyrics.lyrics.parsedLyrics?.length) {
      setActiveLineIndex(null);
      return undefined;
    }

    const { parsedLyrics, offset = 0 } = lyrics.lyrics;
    const hasIntroLine = (parsedLyrics[0]?.start || 0) !== 0;
    const introEnd = (parsedLyrics[0]?.start || 0) + offset;

    const handlePositionChange = (e: Event) => {
      if ('detail' in e && typeof e.detail === 'number') {
        const pos = e.detail;

        // Check intro line ('•••')
        if (hasIntroLine && pos >= 0 && pos < introEnd) {
          setActiveLineIndex((prev) => (prev !== -1 ? -1 : prev));
          return;
        }

        // Find matching lyric line
        let foundIndex: number | null = null;
        for (let i = 0; i < parsedLyrics.length; i += 1) {
          const line = parsedLyrics[i];
          const start = (line.start || 0) + offset;
          const end =
            line.end === Number.POSITIVE_INFINITY || !line.end
              ? Number.POSITIVE_INFINITY
              : line.end + offset;

          if (pos >= start && pos < end) {
            foundIndex = i;
            break;
          }
        }

        setActiveLineIndex((prev) => (prev !== foundIndex ? foundIndex : prev));
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
