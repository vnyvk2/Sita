import { useCallback, useEffect, useRef, useState } from 'react';

export const HEART_BURST_DURATION_MS = 850;

/**
 * Hook to manage the lifecycle of the heart burst animation. Handles state, animation restart with
 * requestAnimationFrame, and safe timer/rAF cleanup.
 */
export function useHeartBurst(durationMs = HEART_BURST_DURATION_MS) {
  const [isBursting, setIsBursting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const triggerBurst = useCallback(() => {
    cleanup();
    setIsBursting(false);

    // Use double rAF to guarantee DOM sees isBursting=false before re-triggering animation
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        setIsBursting(true);
        timerRef.current = setTimeout(() => {
          setIsBursting(false);
          timerRef.current = null;
        }, durationMs);
      });
    });
  }, [cleanup, durationMs]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { isBursting, triggerBurst };
}

export default useHeartBurst;
