import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useRef } from 'react';

import ListeningDataSession from '../other/listeningDataSession';
import type AudioPlayer from '../other/player';

/**
 * Custom hook to manage listening data recording sessions.
 *
 * This hook handles the recording of user listening data for analytics and statistics purposes. It
 * tracks: - Song playback duration - Pause/play events - Seek positions - Whether the song is from
 * a known source - Song repetitions
 *
 * Each listening session is tracked independently, and sessions are automatically managed when
 * songs change or repeat. The hook ensures only one session is active at a time and properly cleans
 * up when songs change.
 *
 * @example
 *   ```tsx
 *   function App() {
 *     const player = useAudioPlayer();
 *     const { recordListeningData } = useListeningData(player);
 *
 *     // Start recording when playing a song
 *     recordListeningData(songId, duration, false, true);
 *   }
 *   ```;
 *
 * @param player - The AudioPlayer instance or HTML audio element.
 *   AudioPlayer mirrors the element surface (addEventListener/currentTime)
 *   and routes through the native engine when it owns the sink.
 * @returns Object with the recordListeningData function
 */
export function useListeningData(player: AudioPlayer | HTMLAudioElement) {
  // Track the current listening session
  const recordRef = useRef<ListeningDataSession>(undefined);
  // Detach fn for AudioPlayer listeners (HTML path uses abort signals).
  const detachRef = useRef<(() => void) | undefined>(undefined);

  // AudioPlayer mirrors the element surface but takes only (event, fn):
  // no abort-signal options. Duck-type once per player instance.
  const isAudioPlayer =
    typeof (player as AudioPlayer).on === 'function' &&
    typeof (player as AudioPlayer).off === 'function';

  useEffect(() => {
    return () => {
      detachRef.current?.();
      detachRef.current = undefined;
    };
  }, []);

  // Sync A-B loop active status to pause wall-clock seconds accumulation
  const isAbLoopActive = useStore(store, (state) => state.player.abLoop?.phase === 'active');

  useEffect(() => {
    if (recordRef.current) {
      recordRef.current.isAbLoopActive = isAbLoopActive;
    }
  }, [isAbLoopActive]);

  /**
   * Records listening data for a song.
   *
   * Creates a new listening session to track how the user listens to a song. If a session already
   * exists for a different song, it stops the previous session before starting a new one. For
   * repeated songs, creates a new session instance.
   *
   * @param songId - The unique identifier of the song
   * @param duration - The total duration of the song in seconds
   * @param isRepeating - Whether this is a repeated playback of the same song
   * @param isKnownSource - Whether the song is from the app's library or an external source
   */
  const recordListeningData = useCallback(
    (songId: number, duration: number, isRepeating = false, isKnownSource = true) => {
      // Check if we need to create a new session
      if (recordRef?.current?.songId !== songId || isRepeating) {
        if (isRepeating) {
          console.warn(`Added another song record instance for the repetition of ${songId}`);
        }

        // Stop the previous session if it exists
        if (recordRef.current) {
          recordRef.current.stopRecording();
        }
        detachRef.current?.();
        detachRef.current = undefined;

        // Create new listening session
        const listeningDataSession = new ListeningDataSession(songId, duration, isKnownSource);
        listeningDataSession.isAbLoopActive = store.state.player.abLoop?.phase === 'active';
        listeningDataSession.recordListeningData();

        // Set up event listeners for the session.
        // AudioPlayer takes (event, fn) and needs manual detach; the HTML
        // element path keeps the abort-signal cleanup.
        const onPause = () => {
          listeningDataSession.isPaused = true;
        };
        const onPlay = () => {
          listeningDataSession.isPaused = false;
        };
        const onSeeked = () => {
          // Ignore seeks during active A-B loop to prevent analytics pollution
          if (!listeningDataSession.isAbLoopActive) {
            listeningDataSession.addSeekPosition = player.currentTime;
          }
        };
        if (isAudioPlayer) {
          const ap = player as AudioPlayer;
          ap.on('pause', onPause);
          ap.on('play', onPlay);
          ap.on('seeked', onSeeked);
          detachRef.current = () => {
            ap.off('pause', onPause);
            ap.off('play', onPlay);
            ap.off('seeked', onSeeked);
          };
        } else {
          const el = player as HTMLAudioElement;
          const { signal } = listeningDataSession.abortController;
          // Track pause events
          el.addEventListener('pause', onPause, { signal });
          // Track play events
          el.addEventListener('play', onPlay, { signal });
          // Track seek events (ignore during active A-B loop to prevent analytics pollution)
          el.addEventListener('seeked', onSeeked, { signal });
        }

        // Store the new session reference
        recordRef.current = listeningDataSession;
      }
    },
    [player]
  );

  return {
    recordListeningData
  };
}
