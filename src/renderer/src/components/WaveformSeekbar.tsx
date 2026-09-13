import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import calculateTime from '../utils/calculateTime';
import debounce from '../utils/debounce';

type Props = {
  id?: string;
  name?: string;
  className?: string;
  sliderOpacity?: number;
  onSeek?: (currentPosition: number) => void;
};

const WAVEFORM_RESOLUTION = 200;

/**
 * Generates a deterministic, organic audio wave envelope when real indexed waveform data is
 * unavailable (e.g. unindexed track, unsupported codec, or loading state).
 */
function generateSynthesizedWaveform(seed: number, count = WAVEFORM_RESOLUTION): Float32Array {
  const peaks = new Float32Array(count);
  const s = Math.abs(seed || 1);

  for (let i = 0; i < count; i++) {
    const t = i / count;
    // Layered harmonic sine waves for musical envelope
    const harmonic1 = Math.sin(t * Math.PI); // Global bell curve
    const harmonic2 = Math.sin(t * Math.PI * (4 + (s % 5))) * 0.25;
    const harmonic3 = Math.sin(t * Math.PI * (12 + (s % 7))) * 0.15;
    const noise = Math.sin(i * 137.5 + s) * 0.1;

    let val = harmonic1 * 0.65 + harmonic2 + harmonic3 + noise;
    val = Math.max(0.08, Math.min(1.0, val));
    peaks[i] = val;
  }
  return peaks;
}

/**
 * High-performance Canvas waveform scrubber optimized for minimal React re-renders. Draws
 * dual-colored waveform peaks (played vs unplayed) with sub-pixel DPR scaling and zero React state
 * churn during continuous playback.
 */
const WaveformSeekbar = ({ id, name, className = '', onSeek }: Props) => {
  const player = useAudioPlayer();
  const abLoop = useStore(store, (state) => state.player.abLoop);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateSongPosition } = useContext(AppUpdateContext);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const peaksRef = useRef<Float32Array | null>(null);
  const durationRef = useRef(currentSongData.duration || 0);
  durationRef.current = currentSongData.duration || 0;

  const shiftDragStartPosRef = useRef<number | null>(null);
  const isShiftDraggingRef = useRef(false);
  const draggedMarkerRef = useRef<'A' | 'B' | null>(null);
  const localPreviewRangeRef = useRef<{ a: number; b: number } | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('pointer');

  const getEffectiveDuration = useCallback((): number => {
    return durationRef.current || store.state.currentSongData?.duration || 0;
  }, []);

  const progressPercentRef = useRef(0); // 0.0 to 1.0
  const isDraggingRef = useRef(false);
  const isHoveredRef = useRef(false);
  const hoverPercentRef = useRef<number | null>(null);

  const requestSeqRef = useRef(0);
  const [tooltipState, setTooltipState] = useState<{ visible: boolean; x: number; time: string }>({
    visible: false,
    x: 0,
    time: '0:00'
  });

  // Re-draw canvas cleanly using stored peaks and progress percent
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;

    // Synchronize physical and logical dimensions with DPR
    const targetPhysicalWidth = Math.floor(width * dpr);
    const targetPhysicalHeight = Math.floor(height * dpr);

    if (canvas.width !== targetPhysicalWidth || canvas.height !== targetPhysicalHeight) {
      canvas.width = targetPhysicalWidth;
      canvas.height = targetPhysicalHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const peaks = peaksRef.current;
    if (!peaks || peaks.length === 0) {
      ctx.restore();
      return;
    }

    // Resolve theme colors dynamically from root styles
    const rootStyle = getComputedStyle(document.documentElement);
    const rootElStyle = getComputedStyle(
      document.getElementById('root') || document.documentElement
    );

    const highlightColorRaw =
      rootElStyle.getPropertyValue('--font-color-highlight').trim() ||
      rootStyle.getPropertyValue('--font-color-highlight').trim() ||
      '142 71% 45%';

    const seekbarBgRaw =
      rootElStyle.getPropertyValue('--seekbar-background-color').trim() ||
      rootStyle.getPropertyValue('--seekbar-background-color').trim() ||
      '240 5% 26%';

    const playedColor = `hsl(${highlightColorRaw})`;
    const unplayedColor = `hsl(${seekbarBgRaw})`;
    const hoverColor = `hsl(${highlightColorRaw} / 0.75)`;

    const totalBars = Math.min(peaks.length, Math.max(40, Math.floor(width / 3.5)));
    const barWidth = Math.max(1.5, width / totalBars - 1.2);
    const barGap = (width - totalBars * barWidth) / (totalBars - 1 || 1);

    const progress = progressPercentRef.current;
    const hoverProgress = hoverPercentRef.current;

    for (let i = 0; i < totalBars; i++) {
      // Resample peaks array to match totalBars
      const peakIndex = Math.min(peaks.length - 1, Math.floor((i / totalBars) * peaks.length));
      const normalizedPeak = peaks[peakIndex] || 0.1;

      // Vertical bar height (min 4px, max 85% container height)
      const minBarHeight = 4;
      const maxBarHeight = height * 0.85;
      const barHeight = Math.max(minBarHeight, normalizedPeak * maxBarHeight);
      const x = i * (barWidth + barGap);
      const y = (height - barHeight) / 2;

      const barProgress = i / totalBars;
      const isPlayed = barProgress <= progress;
      const isHoverCovered = hoverProgress !== null && barProgress <= hoverProgress;

      ctx.beginPath();
      // Draw rounded vertical pill with fallback for browsers without roundRect
      const radius = Math.min(barWidth / 2, 2);
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, barWidth, barHeight, radius);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }

      if (isPlayed) {
        ctx.fillStyle = playedColor;
      } else if (isHoverCovered) {
        ctx.fillStyle = hoverColor;
      } else {
        ctx.fillStyle = unplayedColor;
      }
      ctx.fill();
    }

    // Draw active playhead scrubber indicator line (solid) when hovered or dragged
    if (isHoveredRef.current || isDraggingRef.current) {
      const playheadX = progress * width;
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${highlightColorRaw})`;
      ctx.lineWidth = 1.5;
      ctx.moveTo(playheadX, 2);
      ctx.lineTo(playheadX, height - 2);
      ctx.stroke();
    }

    // Draw distinct hover guide line if hovering (and not dragging or overlapping playhead)
    if (isHoveredRef.current && !isDraggingRef.current && hoverProgress !== null) {
      const hoverX = hoverProgress * width;
      const playheadX = progress * width;
      if (Math.abs(hoverX - playheadX) > 3) {
        ctx.beginPath();
        ctx.strokeStyle = `hsl(${highlightColorRaw} / 0.5)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.moveTo(hoverX, 2);
        ctx.lineTo(hoverX, height - 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw A-B Loop highlight band & markers
    const totalDuration = getEffectiveDuration();
    const preview = localPreviewRangeRef.current;
    let curA: number | null = null;
    let curB: number | null = null;
    let isLoopActive = false;

    if (preview) {
      curA = preview.a;
      curB = preview.b;
      isLoopActive = true;
    } else if (abLoop?.phase === 'active' && abLoop.pointA !== null && abLoop.pointB !== null) {
      curA = abLoop.pointA;
      curB = abLoop.pointB;
      isLoopActive = true;
    } else if (abLoop?.phase === 'armed' && abLoop.pointA !== null) {
      curA = abLoop.pointA;
      curB = null;
      isLoopActive = false;
    }

    if (isLoopActive && curA !== null && curB !== null && totalDuration > 0) {
      const startPct = Math.max(0, Math.min(1, curA / totalDuration));
      const endPct = Math.max(0, Math.min(1, curB / totalDuration));
      const xA = startPct * width;
      const xB = endPct * width;
      const bandW = Math.max(2, xB - xA);

      ctx.save();
      ctx.fillStyle = `hsl(${highlightColorRaw} / 0.20)`;
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(xA, 1, bandW, height - 2, 3);
      } else {
        ctx.fillRect(xA, 1, bandW, height - 2);
      }
      ctx.fill();
      ctx.restore();
    }

    const drawMarker = (markerX: number, label: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${highlightColorRaw})`;
      ctx.lineWidth = 1.5;
      ctx.moveTo(markerX, 0);
      ctx.lineTo(markerX, height);
      ctx.stroke();

      const badgeW = 14;
      const badgeH = 13;
      const badgeX = Math.max(0, Math.min(width - badgeW, markerX - badgeW / 2));
      ctx.fillStyle = `hsl(${highlightColorRaw})`;
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(badgeX, 0, badgeW, badgeH, [0, 0, 3, 3]);
      } else {
        ctx.fillRect(badgeX, 0, badgeW, badgeH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, badgeX + badgeW / 2, badgeH / 2 + 1);
      ctx.restore();
    };

    if (curA !== null && totalDuration > 0) {
      const xA = (curA / totalDuration) * width;
      drawMarker(xA, 'A');
    }

    if (curB !== null && totalDuration > 0) {
      const xB = (curB / totalDuration) * width;
      drawMarker(xB, 'B');
    }

    ctx.restore();
  }, [abLoop, getEffectiveDuration]);

  // Fetch waveform when songId changes with stale request protection
  useEffect(() => {
    const songId = currentSongData.songId;
    if (songId === null || songId === undefined) {
      peaksRef.current = null;
      drawCanvas();
      return;
    }

    const currentReqId = ++requestSeqRef.current;

    // Reset progress on song change
    progressPercentRef.current = 0;
    drawCanvas();

    if (typeof window.api?.getSongWaveform === 'function') {
      window.api
        .getSongWaveform(songId)
        .then((data) => {
          // Discard stale responses if song changed while in-flight
          if (requestSeqRef.current !== currentReqId) return;

          if (data && data.length > 0) {
            peaksRef.current = data instanceof Float32Array ? data : new Float32Array(data);
          } else {
            // Deterministic fallback for unindexed / external tracks
            peaksRef.current = generateSynthesizedWaveform(songId);
          }
          drawCanvas();
        })
        .catch(() => {
          if (requestSeqRef.current !== currentReqId) return;
          peaksRef.current = generateSynthesizedWaveform(songId);
          drawCanvas();
        });
    } else {
      // Graceful fallback if IPC bridge is reloading
      peaksRef.current = generateSynthesizedWaveform(songId);
      drawCanvas();
    }
  }, [currentSongData.songId, drawCanvas]);

  // Position change listener: updates playhead directly without React state churn
  const handlePositionChange = useCallback(
    (e: Event) => {
      if ('detail' in e && typeof e.detail === 'number') {
        const songPosition = e.detail as number;
        if (!isDraggingRef.current) {
          const liveDuration = getEffectiveDuration();
          const songDuration = liveDuration > 0 ? liveDuration : songPosition;
          const pct = songDuration > 0 ? Math.min(1, Math.max(0, songPosition / songDuration)) : 0;
          progressPercentRef.current = pct;
          drawCanvas();
        }
      }
    },
    [drawCanvas, getEffectiveDuration]
  );

  useEffect(() => {
    document.addEventListener('player/positionChange', handlePositionChange);
    return () => document.removeEventListener('player/positionChange', handlePositionChange);
  }, [handlePositionChange]);

  useEffect(() => {
    drawCanvas();
  }, [abLoop, drawCanvas]);

  // ResizeObserver for responsive high-DPI redraws
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      drawCanvas();
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [drawCanvas]);

  // Seek calculation helper
  const calculateSeekFromEvent = useCallback(
    (clientX: number): number => {
      const container = containerRef.current;
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pct = rect.width > 0 ? clickX / rect.width : 0;
      const totalDuration = getEffectiveDuration();
      return pct * totalDuration;
    },
    [getEffectiveDuration]
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const totalDuration = getEffectiveDuration();
    const pct = rect.width > 0 ? clickX / rect.width : 0;
    const targetPos = pct * totalDuration;

    // 1. Check if clicking near active Marker A or B
    if (abLoop && totalDuration > 0) {
      if (abLoop.pointA !== null) {
        const xA = (abLoop.pointA / totalDuration) * rect.width;
        if (Math.abs(clickX - xA) <= 8) {
          draggedMarkerRef.current = 'A';
          localPreviewRangeRef.current = {
            a: abLoop.pointA,
            b: abLoop.pointB ?? totalDuration
          };
          try {
            (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
          } catch {}
          return;
        }
      }
      if (abLoop.phase === 'active' && abLoop.pointB !== null) {
        const xB = (abLoop.pointB / totalDuration) * rect.width;
        if (Math.abs(clickX - xB) <= 8) {
          draggedMarkerRef.current = 'B';
          localPreviewRangeRef.current = {
            a: abLoop.pointA ?? 0,
            b: abLoop.pointB
          };
          try {
            (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
          } catch {}
          return;
        }
      }
    }

    // 2. Shift + PointerDown = Drag to select A-B Loop range
    if (e.shiftKey) {
      isShiftDraggingRef.current = true;
      shiftDragStartPosRef.current = targetPos;
      localPreviewRangeRef.current = { a: targetPos, b: targetPos };
      try {
        (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
      } catch {}
      drawCanvas();
      return;
    }

    // 3. Normal seek scrub
    isDraggingRef.current = true;
    try {
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    } catch {}

    progressPercentRef.current =
      totalDuration > 0 ? Math.min(1, Math.max(0, targetPos / totalDuration)) : 0;
    drawCanvas();
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? x / rect.width : 0;
    const totalDuration = getEffectiveDuration();

    hoverPercentRef.current = pct;
    isHoveredRef.current = true;

    // Handle marker fine-tuning drag
    if (draggedMarkerRef.current && localPreviewRangeRef.current) {
      const currentPos = pct * totalDuration;
      if (draggedMarkerRef.current === 'A') {
        const b = localPreviewRangeRef.current.b;
        localPreviewRangeRef.current = { a: Math.min(currentPos, b - 0.25), b };
      } else {
        const a = localPreviewRangeRef.current.a;
        localPreviewRangeRef.current = { a, b: Math.max(currentPos, a + 0.25) };
      }
      drawCanvas();
      return;
    }

    // Handle Shift+drag range creation
    if (isShiftDraggingRef.current && shiftDragStartPosRef.current !== null) {
      const currentPos = pct * totalDuration;
      localPreviewRangeRef.current = {
        a: Math.min(shiftDragStartPosRef.current, currentPos),
        b: Math.max(shiftDragStartPosRef.current, currentPos)
      };
      drawCanvas();
      return;
    }

    if (isDraggingRef.current) {
      progressPercentRef.current = pct;
    }

    // Update cursor if hovering near marker
    if (totalDuration > 0 && abLoop) {
      let isNearMarker = false;
      if (abLoop.pointA !== null) {
        const xA = (abLoop.pointA / totalDuration) * rect.width;
        if (Math.abs(x - xA) <= 8) isNearMarker = true;
      }
      if (abLoop.phase === 'active' && abLoop.pointB !== null) {
        const xB = (abLoop.pointB / totalDuration) * rect.width;
        if (Math.abs(x - xB) <= 8) isNearMarker = true;
      }
      const newCursor = isNearMarker ? 'ew-resize' : 'pointer';
      if (cursorStyle !== newCursor) {
        setCursorStyle(newCursor);
      }
    }

    const hoverTimeSec = pct * totalDuration;
    const timeObj = calculateTime(hoverTimeSec);
    setTooltipState({
      visible: true,
      x: x,
      time: `${timeObj.minutes}:${timeObj.seconds}`
    });

    drawCanvas();
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 1. Finish marker handle drag
    if (draggedMarkerRef.current) {
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {}
      if (localPreviewRangeRef.current) {
        player.setAbLoopRange(localPreviewRangeRef.current.a, localPreviewRangeRef.current.b);
      }
      draggedMarkerRef.current = null;
      localPreviewRangeRef.current = null;
      drawCanvas();
      return;
    }

    // 2. Finish Shift+drag range creation
    if (isShiftDraggingRef.current) {
      isShiftDraggingRef.current = false;
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {}
      if (
        localPreviewRangeRef.current &&
        localPreviewRangeRef.current.b - localPreviewRangeRef.current.a >= 0.25
      ) {
        player.setAbLoopRange(localPreviewRangeRef.current.a, localPreviewRangeRef.current.b);
      }
      shiftDragStartPosRef.current = null;
      localPreviewRangeRef.current = null;
      drawCanvas();
      return;
    }

    // 3. Normal seek release
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {}
      const finalPos = calculateSeekFromEvent(e.clientX);
      const totalDuration = getEffectiveDuration();
      progressPercentRef.current =
        totalDuration > 0 ? Math.min(1, Math.max(0, finalPos / totalDuration)) : 0;
      updateSongPosition(finalPos);
      onSeek?.(finalPos);
      drawCanvas();
    }
  };

  const handlePointerLeave = () => {
    isHoveredRef.current = false;
    hoverPercentRef.current = null;
    setCursorStyle('pointer');
    setTooltipState((prev) => ({ ...prev, visible: false }));
    drawCanvas();
  };

  // Stable debounced wheel scroll handler for interval scrubbing with unmount cleanup
  const handleWheelSeekLatestRef = useRef<(direction: 'up' | 'down') => void>(() => {});
  useEffect(() => {
    handleWheelSeekLatestRef.current = (direction: 'up' | 'down') => {
      const interval = preferences?.seekbarScrollInterval ?? 5;
      const totalDuration = getEffectiveDuration();
      const currentPos = progressPercentRef.current * totalDuration;
      const nextPos =
        direction === 'up'
          ? Math.min(totalDuration, currentPos + interval)
          : Math.max(0, currentPos - interval);

      progressPercentRef.current =
        totalDuration > 0 ? Math.min(1, Math.max(0, nextPos / totalDuration)) : 0;
      updateSongPosition(nextPos);
      onSeek?.(nextPos);
      drawCanvas();
    };
  });

  const handleWheelSeek = useMemo(
    () =>
      debounce((direction: 'up' | 'down') => {
        handleWheelSeekLatestRef.current(direction);
      }, 100),
    []
  );

  useEffect(() => {
    return () => {
      handleWheelSeek.cancel?.();
    };
  }, [handleWheelSeek]);

  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleWheelSeek('up');
    } else {
      handleWheelSeek('down');
    }
  };

  return (
    <div
      ref={containerRef}
      id={id}
      data-name={name}
      style={{ cursor: cursorStyle }}
      className={`waveform-seekbar-container group relative flex h-7 w-full items-center select-none ${className}`.trim()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
      role="slider"
      aria-label="Seek track"
      aria-valuemin={0}
      aria-valuemax={durationRef.current}
      aria-valuenow={progressPercentRef.current * (durationRef.current || 0)}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className="pointer-events-none h-full w-full rounded-md" />

      {/* Floating Hover Time Tooltip */}
      {tooltipState.visible && (
        <div
          className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2 rounded-md border border-white/10 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-md backdrop-blur-xs transition-opacity duration-150"
          style={{ left: `${tooltipState.x}px` }}
        >
          {tooltipState.time}
        </div>
      )}
    </div>
  );
};

export default WaveformSeekbar;
