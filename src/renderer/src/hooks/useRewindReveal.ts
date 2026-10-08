import { useEffect, useState } from 'react';

export const REWIND_REVEAL_EVENT = 'player/rewindReveal';
/** Drag position at or below this is treated as "rewound to the start". */
export const REWIND_REVEAL_EDGE_S = 0.5;

/**
 * True only when a drag parks the thumb at the very start of the track after coming from further
 * in. Edge-gated (not distance-gated) by design: ordinary mid-song scrubbing - however far back -
 * must never flip the cover, while a deliberate rewind-to-zero always works, even seconds into a
 * song.
 */
export function shouldRevealRewind(grabPos: number, dragPos: number): boolean {
  return grabPos > REWIND_REVEAL_EDGE_S && dragPos <= REWIND_REVEAL_EDGE_S;
}

/**
 * Subscribes to seekbar drag-back reveal signals. Resets whenever the track changes so a flipped
 * cover never leaks into the next song.
 */
let currentRevealState = false;

export function toggleRewindReveal(): void {
  currentRevealState = !currentRevealState;
  document.dispatchEvent(
    new CustomEvent(REWIND_REVEAL_EVENT, { detail: { active: currentRevealState } })
  );
}

export function setRewindRevealState(active: boolean): void {
  currentRevealState = active;
  document.dispatchEvent(new CustomEvent(REWIND_REVEAL_EVENT, { detail: { active } }));
}

export function useRewindReveal(songId?: number): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    currentRevealState = false;
    setRevealed(false);
  }, [songId]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (
        'detail' in e &&
        e.detail &&
        typeof (e.detail as { active?: unknown }).active === 'boolean'
      ) {
        currentRevealState = (e.detail as { active: boolean }).active;
        setRevealed(currentRevealState);
      }
    };
    document.addEventListener(REWIND_REVEAL_EVENT, handler);
    return () => document.removeEventListener(REWIND_REVEAL_EVENT, handler);
  }, []);

  return revealed;
}
