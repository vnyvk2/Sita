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

  // Sync with audio engine playback position
  const handlePositionChange = useCallback(
    (e: Event) => {
      if ('detail' in e && typeof e.detail === 'number') {
        const currentPos = e.detail as number;

        if (!isDraggingRef.current && !isMouseWheelRef.current) {
          const liveDuration = duration > 0 ? duration : currentPos;
          const percent =
            liveDuration > 0 ? Math.min(100, Math.max(0, (currentPos / liveDuration) * 100)) : 0;

          if (progressBarRef.current) {
            progressBarRef.current.style.width = `${percent}%`;
          }
          updateLabels(currentPos);
        }
      }
    },
    [duration, updateLabels]
  );

  useEffect(() => {
    document.addEventListener('player/positionChange', handlePositionChange);
    return () => document.removeEventListener('player/positionChange', handlePositionChange);
  }, [handlePositionChange]);

  // Reset bar on track change
  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = '0%';
    }
    updateLabels(0);
  }, [currentSongData?.songId, updateLabels]);

  // Compute position from clientX
  const getPositionFromX = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  // Handle mousedown to start scrubbing
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      isDraggingRef.current = true;

      const newPos = getPositionFromX(e.clientX);
      dragPosRef.current = newPos;

      const percent = (newPos / duration) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${percent}%`;
      }
      updateLabels(newPos);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const currentPos = getPositionFromX(moveEvent.clientX);
        dragPosRef.current = currentPos;

        const currentPercent = (currentPos / duration) * 100;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${currentPercent}%`;
        }
        updateLabels(currentPos);
      };

      const handleMouseUp = () => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          const finalPos = dragPosRef.current;
          updateSongPosition(finalPos);
          if (onSeek) onSeek(finalPos);
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [duration, getPositionFromX, onSeek, updateLabels, updateSongPosition]
  );

  // Handle touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (duration <= 0 || !e.touches[0]) return;
      isDraggingRef.current = true;

      const touch = e.touches[0];
      const newPos = getPositionFromX(touch.clientX);
      dragPosRef.current = newPos;

      const percent = (newPos / duration) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${percent}%`;
      }
      updateLabels(newPos);

      const handleTouchMove = (moveEvent: TouchEvent) => {
        if (!isDraggingRef.current || !moveEvent.touches[0]) return;
        const currentPos = getPositionFromX(moveEvent.touches[0].clientX);
        dragPosRef.current = currentPos;

        const currentPercent = (currentPos / duration) * 100;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${currentPercent}%`;
        }
        updateLabels(currentPos);
      };

      const handleTouchEnd = () => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          const finalPos = dragPosRef.current;
          updateSongPosition(finalPos);
          if (onSeek) onSeek(finalPos);
        }
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      };

      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd);
    },
    [duration, getPositionFromX, onSeek, updateLabels, updateSongPosition]
  );

  // Hover scrub tooltip
  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || duration <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const hoverTime = (relativeX / rect.width) * duration;

      setHoverData({
        x: relativeX,
        time: formatTime(hoverTime)
      });
    },
    [duration, formatTime]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverData(null);
  }, []);

  // Wheel scrubbing
  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      isMouseWheelRef.current = true;

      const step = preferences?.seekbarScrollInterval ?? 5;
      const delta = e.deltaY < 0 ? step : -step;
      const currentPos = dragPosRef.current || 0;
      const nextPos = Math.max(0, Math.min(duration, currentPos + delta));
      dragPosRef.current = nextPos;

      const percent = (nextPos / duration) * 100;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${percent}%`;
      }
      updateLabels(nextPos);

      debounce(() => {
        isMouseWheelRef.current = false;
        updateSongPosition(nextPos);
        if (onSeek) onSeek(nextPos);
      }, 200)();
    },
    [duration, onSeek, preferences?.seekbarScrollInterval, updateLabels, updateSongPosition]
  );

  // Toggle remaining vs total duration
  const toggleRemainingTime = useCallback(() => {
    const nextVal = !showRemainingTime;
    storage.preferences.setPreferences('showSongRemainingTime', nextVal);
  }, [showRemainingTime]);

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
        aria-valuemax={duration}
        aria-valuenow={dragPosRef.current}
        className="relative flex h-6 flex-1 cursor-pointer items-center"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
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
