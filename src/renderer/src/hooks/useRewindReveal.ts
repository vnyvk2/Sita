import { useEffect, useState } from 'react';

export const REWIND_REVEAL_EVENT = 'player/rewindReveal';
export const REWIND_REVEAL_MIN_THRESHOLD_S = 5;
export const REWIND_REVEAL_MAX_THRESHOLD_S = 15;

/**
 * Drag-back distance (seconds) that flips the now-playing cover to its credits back. Scales with
 * track length so short songs stay reachable while long ones still require deliberate intent.
 */
export function rewindRevealThreshold(duration: number): number {
  if (!duration || duration <= 0) return 10;
  return Math.min(
    REWIND_REVEAL_MAX_THRESHOLD_S,
    Math.max(REWIND_REVEAL_MIN_THRESHOLD_S, duration * 0.08)
  );
}

export function shouldRevealRewind(grabPos: number, dragPos: number, duration: number): boolean {
  return grabPos - dragPos >= rewindRevealThreshold(duration);
}

/**
 * Subscribes to seekbar drag-back reveal signals. Resets whenever the track changes so a flipped
 * cover never leaks into the next song.
 */
export function useRewindReveal(songId?: number): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [songId]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (
        'detail' in e &&
        e.detail &&
        typeof (e.detail as { active?: unknown }).active === 'boolean'
      ) {
        setRevealed((e.detail as { active: boolean }).active);
      }
    };
    document.addEventListener(REWIND_REVEAL_EVENT, handler);
    return () => document.removeEventListener(REWIND_REVEAL_EVENT, handler);
  }, []);

  return revealed;
}
