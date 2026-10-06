import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import {
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import calculateTime from '../../../utils/calculateTime';
import debounce from '../../../utils/debounce';

interface FullScreenSeekbarProps {
  className?: string;
  onSeek?: (position: number) => void;
}

export const FullScreenSeekbar = ({ className = '', onSeek }: FullScreenSeekbarProps) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateSongPosition } = useContext(AppUpdateContext);

  const duration = currentSongData?.duration || 0;
  const showRemainingTime = preferences?.showSongRemainingTime ?? false;

  // Refs for zero-rerender DOM mutations
  const trackRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const elapsedTextRef = useRef<HTMLSpanElement>(null);
  const remainingTextRef = useRef<HTMLButtonElement>(null);

  // Dragging and interaction state
  const isDraggingRef = useRef(false);
  const dragPosRef = useRef(0);
  const isMouseWheelRef = useRef(false);
  const hoverRafRef = useRef<number | null>(null);

  // Stable callback refs so debounce / listeners don't churn on identity change
  const updateSongPositionRef = useRef(updateSongPosition);
  updateSongPositionRef.current = updateSongPosition;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  // Cleanup ref for active window drag listeners
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const cancelActiveDragListeners = () => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cancelActiveDragListeners();
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  // Debounced seek for wheel scrubbing
  const debouncedSeekRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    debouncedSeekRef.current = debounce((pos: number) => {
      isMouseWheelRef.current = false;
      updateSongPositionRef.current(pos);
      if (onSeekRef.current) onSeekRef.current(pos);
    }, 200);

    return () => {
      debouncedSeekRef.current?.cancel();
    };
  }, []);

  // Tooltip hover state
  const [hoverData, setHoverData] = useState<{ x: number; time: string } | null>(null);

  // Helper to format MM:SS
  const formatTime = useCallback((seconds: number) => {
    const t = calculateTime(Math.max(0, Math.floor(seconds)));
    return `${t.minutes}:${t.seconds}`;
  }, []);

  // Update DOM time labels without triggering React component re-renders
  const updateLabels = useCallback(
    (pos: number) => {
      if (elapsedTextRef.current) {
        elapsedTextRef.current.textContent = formatTime(pos);
      }
      if (remainingTextRef.current) {
        const remaining = Math.max(0, duration - pos);
        const text = showRemainingTime ? `-${formatTime(remaining)}` : formatTime(duration);
        remainingTextRef.current.textContent = text;
      }
    },
    [duration, formatTime, showRemainingTime]
  );

  // Keep screen-reader slider value in sync without re-rendering (ref was stale at render time)
  const [a11yPos, setA11yPos] = useState(0);
  const syncA11yPosition = useCallback((pos: number) => {
    const safe = Number.isFinite(pos) ? Math.max(0, pos) : 0;
    setA11yPos(safe);
    if (trackRef.current) {
      trackRef.current.setAttribute('aria-valuenow', String(Math.round(safe)));
      trackRef.current.setAttribute('aria-valuetext', formatTime(safe));
    }
  }, [formatTime]);

  // Sync with audio engine playback position
  const handlePositionChange = useCallback(
    (e: Event) => {
      if ('detail' in e && typeof e.detail === 'number') {
        const currentPos = e.detail as number;

        if (!isDraggingRef.current && !isMouseWheelRef.current) {
          dragPosRef.current = currentPos;
          const liveDuration = duration > 0 ? duration : 0;
          const percent =
            liveDuration > 0 ? Math.min(100, Math.max(0, (currentPos / liveDuration) * 100)) : 0;

          if (progressBarRef.current) {
            progressBarRef.current.style.width = `${percent}%`;
          }
          updateLabels(currentPos);
          syncA11yPosition(currentPos);
        }
      }
    },
    [duration, updateLabels, syncA11yPosition]
  );

  useEffect(() => {
    document.addEventListener('player/positionChange', handlePositionChange);
    return () => document.removeEventListener('player/positionChange', handlePositionChange);
  }, [handlePositionChange]);

  // Reset bar on track change (songId only — duration/labels settling must not reset mid-song)
  const songId = currentSongData?.songId;
  useEffect(() => {
    dragPosRef.current = 0;
    isDraggingRef.current = false;
    isMouseWheelRef.current = false;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = '0%';
    }
    updateLabels(0);
    syncA11yPosition(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  // Re-apply labels when duration resolves late or remaining/total toggles,
  // without resetting progress to 0.
  useEffect(() => {
    updateLabels(dragPosRef.current);
  }, [duration, showRemainingTime, updateLabels]);

  // Seed from live position on mount (entering fullscreen mid-song)
  useEffect(() => {
    try {
      const pos = (window as unknown as { __NORA_LAST_POSITION__?: number })
        .__NORA_LAST_POSITION__;
      if (typeof pos === 'number' && Number.isFinite(pos) && pos > 0) {
        dragPosRef.current = pos;
        updateLabels(pos);
        syncA11yPosition(pos);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute position from clientX
  const getPositionFromX = useCallback(
    (clientX: number) => {
      if (!trackRef.current || duration <= 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const commitDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      const finalPos = dragPosRef.current;
      updateSongPositionRef.current(finalPos);
      if (onSeekRef.current) onSeekRef.current(finalPos);
    }
  }, []);

  // Handle mousedown to start scrubbing
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      if (trackRef.current && trackRef.current.getBoundingClientRect().width <= 0) return;
      cancelActiveDragListeners();
      isDraggingRef.current = true;

      const newPos = getPositionFromX(e.clientX);
      dragPosRef.current = newPos;

      const percent = duration > 0 ? (newPos / duration) * 100 : 0;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${percent}%`;
      }
      updateLabels(newPos);
      syncA11yPosition(newPos);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const currentPos = getPositionFromX(moveEvent.clientX);
        dragPosRef.current = currentPos;

        const currentPercent = duration > 0 ? (currentPos / duration) * 100 : 0;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${currentPercent}%`;
        }
        updateLabels(currentPos);
        syncA11yPosition(currentPos);
      };

      const cleanup = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('blur', handleWindowBlur);
        dragCleanupRef.current = null;
      };

      const handleMouseUp = () => {
        commitDragEnd();
        cleanup();
      };

      const handleWindowBlur = () => {
        commitDragEnd();
        cleanup();
      };

      dragCleanupRef.current = cleanup;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('blur', handleWindowBlur);
    },
    [duration, getPositionFromX, updateLabels, syncA11yPosition, commitDragEnd]
  );

  // Handle touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (duration <= 0 || !e.touches[0]) return;
      if (trackRef.current && trackRef.current.getBoundingClientRect().width <= 0) return;
      cancelActiveDragListeners();
      isDraggingRef.current = true;

      const touch = e.touches[0];
      const newPos = getPositionFromX(touch.clientX);
      dragPosRef.current = newPos;

      const percent = duration > 0 ? (newPos / duration) * 100 : 0;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${percent}%`;
      }
      updateLabels(newPos);
      syncA11yPosition(newPos);

      const handleTouchMove = (moveEvent: TouchEvent) => {
        if (!isDraggingRef.current || !moveEvent.touches[0]) return;
        const currentPos = getPositionFromX(moveEvent.touches[0].clientX);
        dragPosRef.current = currentPos;

        const currentPercent = duration > 0 ? (currentPos / duration) * 100 : 0;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${currentPercent}%`;
        }
        updateLabels(currentPos);
        syncA11yPosition(currentPos);
      };

      const cleanup = () => {
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchcancel', handleTouchCancel);
        dragCleanupRef.current = null;
      };

      const handleTouchEnd = () => {
        commitDragEnd();
        cleanup();
      };

      const handleTouchCancel = () => {
        // OS interruption: release drag but keep last committed position updating
        isDraggingRef.current = false;
        cleanup();
      };

      dragCleanupRef.current = cleanup;
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchCancel);
    },
    [duration, getPositionFromX, updateLabels, syncA11yPosition, commitDragEnd]
  );

  // Hover scrub tooltip (rAF-throttled to avoid per-pixel re-renders)
  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || duration <= 0) return;
      const clientX = e.clientX;
      if (hoverRafRef.current !== null) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        if (rect.width <= 0) return;
        const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const hoverTime = (relativeX / rect.width) * duration;
        setHoverData({
          x: relativeX,
          time: formatTime(hoverTime)
        });
      });
    },
    [duration, formatTime]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverRafRef.current !== null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    setHoverData(null);
  }, []);

  // Wheel scrubbing
  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      isMouseWheelRef.current = true;

      const step = preferences?.seekbarScrollInterval ?? 5;
      const delta = e.deltaY < 0 ? step : -step;
      const currentPos = Number.isFinite(dragPosRef.current) ? dragPosRef.current : 0;
      const nextPos = Math.max(0, Math.min(duration, currentPos + delta));
      dragPosRef.current = nextPos;

      const percent = (nextPos / duration) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${percent}%`;
      }
      updateLabels(nextPos);
      syncA11yPosition(nextPos);

      debouncedSeekRef.current?.(nextPos);
    },
    [duration, preferences?.seekbarScrollInterval, updateLabels, syncA11yPosition]
  );

  const seekByKeyboard = useCallback(
    (pos: number) => {
      if (duration <= 0) return;
      const nextPos = Math.max(0, Math.min(duration, pos));
      dragPosRef.current = nextPos;
      const percent = (nextPos / duration) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${percent}%`;
      }
      updateLabels(nextPos);
      syncA11yPosition(nextPos);
      updateSongPositionRef.current(nextPos);
      if (onSeekRef.current) onSeekRef.current(nextPos);
    },
    [duration, updateLabels, syncA11yPosition]
  );

  const handleSliderKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = preferences?.seekbarScrollInterval ?? 5;
      const currentPos = Number.isFinite(dragPosRef.current) ? dragPosRef.current : 0;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          seekByKeyboard(currentPos - step);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          seekByKeyboard(currentPos + step);
          break;
        case 'Home':
          e.preventDefault();
          seekByKeyboard(0);
          break;
        case 'End':
          e.preventDefault();
          seekByKeyboard(duration);
          break;
        case 'PageDown':
          e.preventDefault();
          seekByKeyboard(currentPos - step * 2);
          break;
        case 'PageUp':
          e.preventDefault();
          seekByKeyboard(currentPos + step * 2);
          break;
        default:
          break;
      }
    },
    [duration, preferences?.seekbarScrollInterval, seekByKeyboard]
  );

  // Toggle remaining vs total duration
  const toggleRemainingTime = useCallback(() => {
    const nextVal = !showRemainingTime;
    storage.preferences.setPreferences('showSongRemainingTime', nextVal);
    // Re-apply labels immediately so button text doesn't lag until next tick
    const pos = Number.isFinite(dragPosRef.current) ? dragPosRef.current : 0;
    const remaining = Math.max(0, duration - pos);
    if (elapsedTextRef.current) {
      elapsedTextRef.current.textContent = formatTime(pos);
    }
    if (remainingTextRef.current) {
      const text = !showRemainingTime ? `-${formatTime(remaining)}` : formatTime(duration);
      remainingTextRef.current.textContent = text;
    }
  }, [showRemainingTime, duration, formatTime]);

  return (
    <div
      data-testid="fullscreen-seekbar"
      className={`fullscreen-seekbar group/seekbar relative flex w-full items-center gap-3 select-none ${className}`}
    >
      {/* Elapsed Time */}
      <span
        ref={elapsedTextRef}
        data-testid="fullscreen-elapsed-time"
        className="min-w-[42px] text-right font-mono text-xs text-white/70 tabular-nums"
      >
        00:00
      </span>

      {/* Seekbar Track Hit-box (h-6 for generous hit target) */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek track"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(a11yPos)}
        aria-valuetext={`${formatTime(a11yPos)} of ${formatTime(duration)}`}
        className="relative flex h-6 flex-1 cursor-pointer items-center"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onKeyDown={handleSliderKeyDown}
      >
        {/* Track Rail */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/20 backdrop-blur-md transition-[height] duration-150 group-hover/seekbar:h-2">
          {/* Progress Fill */}
          <div
            ref={progressBarRef}
            data-testid="fullscreen-seekbar-progress"
            className="h-full rounded-full bg-white shadow-xs transition-none"
            style={{ width: '0%' }}
          />
        </div>

        {/* Hover Scrub Preview Tooltip */}
        {hoverData && (
          <div
            data-testid="fullscreen-seekbar-tooltip"
            className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[11px] font-medium text-white shadow-lg backdrop-blur-lg"
            style={{ left: `${hoverData.x}px` }}
          >
            {hoverData.time}
          </div>
        )}
      </div>

      {/* Remaining / Total Duration */}
      <button
        ref={remainingTextRef}
        type="button"
        data-testid="fullscreen-remaining-time"
        onClick={toggleRemainingTime}
        title={showRemainingTime ? 'Show total duration' : 'Show remaining time'}
        className="min-w-[42px] cursor-pointer text-left font-mono text-xs text-white/70 tabular-nums transition-colors hover:text-white"
      >
        {showRemainingTime ? '-00:00' : '00:00'}
      </button>
    </div>
  );
};

export default FullScreenSeekbar;
