import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getLyricScrollBehavior } from './lyricsUtils';

interface UseLyricsScrollSyncProps {
  containerRef: React.RefObject<HTMLElement | null>;
  activeLineIndex: number | null;
  isSynced: boolean;
  songId?: number;
}

// Scroll events arriving inside this window after a programmatic scroll are
// part of the smooth-scroll animation, not the user.
const PROGRAMMATIC_SCROLL_QUIET_MS = 800;

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
  // Timestamp of the last programmatic (auto-follow / snap-back) scroll. Scroll
  // events arriving inside the quiet window are part of an animation, not the user.
  const lastProgrammaticScrollRef = useRef(0);

  const markProgrammaticScroll = useCallback(() => {
    lastProgrammaticScrollRef.current = performance.now();
  }, []);

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

      markProgrammaticScroll();
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: getLyricScrollBehavior()
        });
      } else {
        activeEl.scrollIntoView({ behavior: getLyricScrollBehavior(), block: 'center' });
      }
    }

    setIsUserBrowsing(false);
    setDirection(null);
  }, [containerRef, markProgrammaticScroll]);

  // Shared entry into browsing state with auto-mode resume arming.
  const enterBrowsing = useCallback(() => {
    setIsUserBrowsing(true);
    checkVisibility();

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = null;
    }

    // In auto mode: resume auto-scroll 4 seconds after user stops scrolling
    if (scrollMode === 'auto') {
      userScrollTimeoutRef.current = setTimeout(() => {
        setIsUserBrowsing(false);
        setDirection(null);
        handleSnapBack();
      }, 4000);
    }
  }, [checkVisibility, handleSnapBack, scrollMode]);

  // User input listener: wheel, touchmove, and background pointerdown trigger
  // "user is browsing". Clicks landing on a lyric line are seeks, not browsing:
  // the view must follow the jump instead of freezing for 4 seconds.
  // Programmatic scrollIntoView NEVER fires these, preventing the feedback loop!
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleUserInteraction = (e: Event) => {
      // Right/middle-click (e.g. lyric context menu) is not browsing intent.
      if (e instanceof PointerEvent && e.pointerType === 'mouse' && e.button !== 0) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('[data-lyric-line]')) {
        // Seek click (or AB-loop toggle): follow the jump, don't suspend tracking.
        if (userScrollTimeoutRef.current) {
          clearTimeout(userScrollTimeoutRef.current);
          userScrollTimeoutRef.current = null;
        }
        setIsUserBrowsing(false);
        setDirection(null);
        return;
      }

      enterBrowsing();
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
  }, [enterBrowsing, containerRef]);

  // Check visibility on scroll when user is browsing or in manual mode.
  // Also ENTER browsing here: keyboard scrolling and scrollbar-thumb dragging
  // fire scroll events without wheel/touch/pointerdown, so without this the
  // next active-line change would yank the view away mid-read. Scroll events
  // inside the programmatic quiet window belong to our own smooth animation.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (scrollMode === 'manual' || isUserBrowsing) {
          checkVisibility();
        } else if (isSynced) {
          const sinceProgrammatic = performance.now() - lastProgrammaticScrollRef.current;
          if (sinceProgrammatic > PROGRAMMATIC_SCROLL_QUIET_MS) {
            enterBrowsing();
          }
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [checkVisibility, enterBrowsing, isSynced, isUserBrowsing, scrollMode, containerRef]);

  // Re-check after active line changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollMode === 'manual' || isUserBrowsing) {
        checkVisibility();
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [activeLineIndex, checkVisibility, isUserBrowsing, scrollMode]);

  // Reset browsing state on song change and rewind to the top so the new
  // track doesn't open mid-list at the previous song's scroll offset.
  useEffect(() => {
    if (songId !== prevSongIdRef.current) {
      setIsUserBrowsing(false);
      setDirection(null);
      prevSongIdRef.current = songId;
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
        userScrollTimeoutRef.current = null;
      }
      const container = containerRef.current;
      if (container && container.scrollTop !== 0) {
        markProgrammaticScroll();
        container.scrollTop = 0;
      }
    }
  }, [songId, containerRef, markProgrammaticScroll]);

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

  // Container-owned auto-follow. Centers the active line with a container-local
  // scrollTo so ancestor scrollers are never disturbed (Element.scrollIntoView
  // would bubble through every scrollable parent up to the document).
  useEffect(() => {
    if (!isAutoScrolling || !isSynced || activeLineIndex === null) return;
    const container = containerRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-active-line="true"]') as HTMLElement | null;
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const targetScrollTop =
      container.scrollTop +
      (activeRect.top - containerRect.top) -
      container.clientHeight / 2 +
      activeRect.height / 2;

    markProgrammaticScroll();
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: getLyricScrollBehavior()
      });
    } else {
      container.scrollTop = Math.max(0, targetScrollTop);
    }
  }, [activeLineIndex, isAutoScrolling, isSynced, containerRef, markProgrammaticScroll]);

  // Show snap-back button when active line is off-screen (in manual mode OR when user scrolled away in auto mode)
  const showSnapBack = isSynced && direction !== null && activeLineIndex !== null;

  return {
    scrollMode,
    isAutoScrolling,
    direction,
    showSnapBack,
    handleSnapBack,
    handleToggleScrollMode,
    markProgrammaticScroll
  };
}

export default useLyricsScrollSync;
