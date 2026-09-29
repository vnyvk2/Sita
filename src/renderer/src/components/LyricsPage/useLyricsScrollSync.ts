import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseLyricsScrollSyncProps {
  containerRef: React.RefObject<HTMLElement | null>;
  activeLineIndex: number | null;
  isSynced: boolean;
  songId?: number;
}

/**
 * Manages lyrics scroll sync state.
 *
 * - `isAutoScrolling` is purely driven by user preference (`auto` vs `manual`).
 *   It is NEVER influenced by browsing state — that was the bug.
 * - The snap-back button only appears in MANUAL mode when the active line
 *   is scrolled out of the visible viewport.
 * - Direction (`up` / `down`) tells you where the active line is relative
 *   to the current viewport so the button arrow points the right way.
 */
export function useLyricsScrollSync({
  containerRef,
  activeLineIndex,
  isSynced,
  songId
}: UseLyricsScrollSyncProps) {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const scrollMode = preferences?.lyricsScrollMode ?? 'auto';
  const isAutoScrolling = scrollMode === 'auto';

  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const prevSongIdRef = useRef(songId);

  // Check whether the active lyric line is visible in the scroll container
  const checkVisibility = useCallback(() => {
    const container = containerRef.current;
    if (!container || activeLineIndex === null || !isSynced) {
      setDirection(null);
      return;
    }

    const activeEl = container.querySelector('[data-active-line="true"]') as HTMLElement | null;
    if (!activeEl) {
      setDirection(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    const threshold = 20;
    const isAbove = activeRect.bottom < containerRect.top + threshold;
    const isBelow = activeRect.top > containerRect.bottom - threshold;

    if (isAbove) setDirection('up');
    else if (isBelow) setDirection('down');
    else setDirection(null);
  }, [activeLineIndex, isSynced, containerRef]);

  // Listen to scroll events for manual-mode visibility tracking
  useEffect(() => {
    // Only track in manual mode — in auto mode LyricLine handles everything
    if (isAutoScrolling) {
      setDirection(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkVisibility);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isAutoScrolling, checkVisibility, containerRef]);

  // Re-check after active line changes (only in manual mode)
  useEffect(() => {
    if (isAutoScrolling) return;
    const timer = setTimeout(checkVisibility, 80);
    return () => clearTimeout(timer);
  }, [activeLineIndex, isAutoScrolling, checkVisibility]);

  // Reset on song change
  useEffect(() => {
    if (songId !== prevSongIdRef.current) {
      setDirection(null);
      prevSongIdRef.current = songId;
    }
  }, [songId]);

  // Snap back to active line
  const handleSnapBack = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeEl = container.querySelector('[data-active-line="true"]') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setDirection(null);
  }, [containerRef]);

  const handleToggleScrollMode = useCallback(() => {
    const next = scrollMode === 'auto' ? 'manual' : 'auto';
    storage.preferences.setPreferences('lyricsScrollMode', next);
  }, [scrollMode]);

  return {
    scrollMode,
    // isAutoScrolling is PURELY preference-driven. Never gated by browsing state.
    isAutoScrolling,
    direction,
    // Snap-back only shows in manual mode when the line is off-screen
    showSnapBack: !isAutoScrolling && isSynced && direction !== null && activeLineIndex !== null,
    handleSnapBack,
    handleToggleScrollMode
  };
}

export default useLyricsScrollSync;
