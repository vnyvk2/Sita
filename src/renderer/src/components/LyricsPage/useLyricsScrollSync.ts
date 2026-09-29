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
  const isUserBrowsingRef = useRef(false);

  useEffect(() => {
    isUserBrowsingRef.current = isUserBrowsing;
  }, [isUserBrowsing]);

  // Check active line visibility relative to container viewport
  const checkVisibility = useCallback(() => {
    const container = containerRef.current;
    if (!container || activeLineIndex === null || !isSynced) {
      setDirection(null);
      setIsUserBrowsing(false);
      return;
    }

    const activeEl = container.querySelector('[data-active-line="true"]') as HTMLElement | null;
    if (!activeEl) {
      setDirection(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    // 20px threshold to prevent jitter when right on the boundary
    const isAbove = activeRect.bottom < containerRect.top + 20;
    const isBelow = activeRect.top > containerRect.bottom - 20;

    if (isAbove) {
      setDirection('up');
      setIsUserBrowsing(true);
    } else if (isBelow) {
      setDirection('down');
      setIsUserBrowsing(true);
    } else {
      setDirection(null);
      setIsUserBrowsing(false);
    }
  }, [activeLineIndex, isSynced, containerRef]);

  // Listen to scroll events (handles wheel, touch, scrollbar dragging, keys)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        checkVisibility();
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [checkVisibility, containerRef]);

  // Re-check after active line changes
  useEffect(() => {
    const timer = setTimeout(() => {
      checkVisibility();
    }, 60);
    return () => clearTimeout(timer);
  }, [activeLineIndex, checkVisibility]);

  // Reset browsing state on song change
  useEffect(() => {
    setIsUserBrowsing(false);
    setDirection(null);
  }, [songId]);

  // Mathematically precise snap back to active line inside container
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

  const handleToggleScrollMode = useCallback(() => {
    const next = scrollMode === 'auto' ? 'manual' : 'auto';
    storage.preferences.setPreferences('lyricsScrollMode', next);
  }, [scrollMode]);

  return {
    scrollMode,
    isAutoScrolling: scrollMode === 'auto' && !isUserBrowsing,
    isUserBrowsing,
    direction,
    showSnapBack: isSynced && direction !== null && activeLineIndex !== null,
    handleSnapBack,
    handleToggleScrollMode
  };
}

export default useLyricsScrollSync;
