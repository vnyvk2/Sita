import { useCallback, useContext, useEffect, useRef } from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';

const useSkipLyricsLines = (lyrics?: SongLyrics | null) => {
  const { updateSongPosition } = useContext(AppUpdateContext);
  // A pending one-shot position listener. Replaced (not stacked) on repeat
  // shortcut presses, and removed on unmount — while paused no position
  // events fire, so stale `once` listeners would otherwise pile up.
  const pendingSkipRef = useRef<((e: Event) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (pendingSkipRef.current) {
        document.removeEventListener('player/positionChange', pendingSkipRef.current);
        pendingSkipRef.current = null;
      }
    };
  }, []);

  const skipLyricsLines = useCallback(
    (option: 'previous' | 'next' = 'next') => {
      if (lyrics?.lyrics.isSynced) {
        const { isSynced, parsedLyrics } = lyrics.lyrics;

        if (isSynced) {
          // Drop a previous pending skip so rapid presses don't queue N seeks
          if (pendingSkipRef.current) {
            document.removeEventListener('player/positionChange', pendingSkipRef.current);
            pendingSkipRef.current = null;
          }
          const handlePosition = (e: Event) => {
            pendingSkipRef.current = null;
            if ('detail' in e && !Number.isNaN(e.detail)) {
              const songPosition = e.detail as number;

              for (let i = 0; i < parsedLyrics.length; i += 1) {
                const { start = 0, end = 0 } = parsedLyrics[i];

                const isInRange = songPosition > start && songPosition < end;
                if (isInRange) {
                  if (option === 'next' && parsedLyrics[i + 1])
                    updateSongPosition(parsedLyrics[i + 1].start || 0);
                  else if (option === 'previous' && parsedLyrics[i - 1])
                    updateSongPosition(parsedLyrics[i - 1].start || 0);
                }
              }
            }
          };
          pendingSkipRef.current = handlePosition;
          document.addEventListener('player/positionChange', handlePosition, { once: true });
        }
      }
    },
    [lyrics?.lyrics, updateSongPosition]
  );

  const manageLyricsPageKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowUp') skipLyricsLines('previous');
      else if (e.altKey && e.key === 'ArrowDown') skipLyricsLines('next');
    },
    [skipLyricsLines]
  );

  useEffect(() => {
    window.addEventListener('keydown', manageLyricsPageKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', manageLyricsPageKeyboardShortcuts);
    };
  }, [manageLyricsPageKeyboardShortcuts]);

  return { skipLyricsLines };
};

export default useSkipLyricsLines;
