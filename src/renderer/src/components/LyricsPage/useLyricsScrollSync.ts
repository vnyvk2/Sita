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

export function useLyricsScrollSync({
  containerRef,
  activeLineIndex,
  isSynced,
  songId
}: UseLyricsScrollSyncProps) {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const scrollMode = preferences?.lyricsScrollMode ?? 'auto';

  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const [isUserBrowsing, setIsUserBrowsing] = useState(false);
  const prevSongIdRef = useRef(songId);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check active line position relative to container
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

    const threshold = 24;
    const isAbove = activeRect.bottom < containerRect.top + threshold;
    const isBelow = activeRect.top > containerRect.bottom - threshold;

    if (isAbove) {
      setDirection('up');
    } else if (isBelow) {
      setDirection('down');
    } else {
      setDirection(null);
    }
  }, [activeLineIndex, isSynced, containerRef]);

  // Snap-back handler: smoothly scrolls container to active line
  const handleSnapBack = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeEl = container.querySelector('[data-active-line="true"]') as HTMLElement | null;
    if (activeEl) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      const targetScrollTop =
        container.scrollTop +
        (activeRect.top - containerRect.top) -
        container.clientHeight / 2 +
        activeRect.height / 2;

      if (typeof container.scrollTo === 'function') {
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      } else {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    setIsUserBrowsing(false);
    setDirection(null);
  }, [containerRef]);

  // User input listener: ONLY wheel, touchmove, pointerdown trigger "user is browsing"
  // Programmatic scrollIntoView NEVER fires these, preventing the feedback loop!
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleUserInteraction = () => {
      setIsUserBrowsing(true);
      checkVisibility();

      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }

      // In auto mode: resume auto-scroll 4 seconds after user stops scrolling
      if (scrollMode === 'auto') {
        userScrollTimeoutRef.current = setTimeout(() => {
          setIsUserBrowsing(false);
          setDirection(null);
          handleSnapBack();
        }, 4000);
      }
    };

    container.addEventListener('wheel', handleUserInteraction, { passive: true });
    container.addEventListener('touchmove', handleUserInteraction, { passive: true });
    container.addEventListener('pointerdown', handleUserInteraction, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleUserInteraction);
      container.removeEventListener('touchmove', handleUserInteraction);
      container.removeEventListener('pointerdown', handleUserInteraction);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [checkVisibility, handleSnapBack, scrollMode, containerRef]);

  // Check visibility on scroll when user is browsing or in manual mode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (scrollMode === 'manual' || isUserBrowsing) {
          checkVisibility();
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [checkVisibility, isUserBrowsing, scrollMode, containerRef]);

  // Re-check after active line changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollMode === 'manual' || isUserBrowsing) {
        checkVisibility();
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [activeLineIndex, checkVisibility, isUserBrowsing, scrollMode]);

  // Reset browsing state on song change
  useEffect(() => {
    if (songId !== prevSongIdRef.current) {
      setIsUserBrowsing(false);
      setDirection(null);
      prevSongIdRef.current = songId;
    }
  }, [songId]);

  // Toggle scroll mode: when switching to 'auto', immediately snap to current line!
  const handleToggleScrollMode = useCallback(() => {
    const next = scrollMode === 'auto' ? 'manual' : 'auto';
    storage.preferences.setPreferences('lyricsScrollMode', next);
    setIsUserBrowsing(false);
    setDirection(null);

    if (next === 'auto') {
      setTimeout(() => {
        handleSnapBack();
      }, 50);
    }
  }, [handleSnapBack, scrollMode]);

  // In auto mode: auto-scroll is active UNLESS user is actively browsing.
  // In manual mode: auto-scroll is never active.
  const isAutoScrolling = scrollMode === 'auto' && !isUserBrowsing;

  // Show snap-back button when active line is off-screen (in manual mode OR when user scrolled away in auto mode)
  const showSnapBack = isSynced && direction !== null && activeLineIndex !== null;

  return {
    scrollMode,
    isAutoScrolling,
    direction,
    showSnapBack,
    handleSnapBack,
    handleToggleScrollMode
  };
}

export default useLyricsScrollSync;
