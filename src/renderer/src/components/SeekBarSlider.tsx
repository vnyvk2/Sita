import { useAudioPlayer } from '@renderer/hooks/useAudioPlayer';
import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  type WheelEvent,
  useCallback,
  useContext,
  useEffect,
  useRef
} from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';

type Props = {
  id: string;
  name: string;
  className?: string;
  sliderOpacity?: number;
  onSeek?: (currentPosition: number) => void;
};

type InteractionMode = 'normal' | 'scrubbing' | 'wheel' | 'post-seek';

interface LatestSeek {
  token: number;
  target: number;
  timestamp: number;
}

const SeekBarSlider = (props: Props) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const player = useAudioPlayer();
  const { updateSongPosition } = useContext(AppUpdateContext);

  const { id, name, className, sliderOpacity, onSeek } = props;

  const seekbarRef = useRef<HTMLInputElement | null>(null);
  const interactionRef = useRef<InteractionMode>('normal');
  const seekTokenRef = useRef(0);
  const latestSeekRef = useRef<LatestSeek | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rAFIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef({ time: 0, hasMoved: false });

  const updateVisualProgress = useCallback((time: number, duration: number, updateValue = true) => {
    const input = seekbarRef.current;
    if (!input) return;

    const validDuration = duration > 0 ? duration : (Number(input.max) || 0);
    const clampedTime = Math.max(0, Math.min(time, validDuration || time));
    const percent = validDuration > 0 ? (clampedTime / validDuration) * 100 : 0;

    input.style.setProperty('--seek-before-width', `${percent}%`);

    if (updateValue && interactionRef.current === 'normal') {
      input.value = String(clampedTime);
    }
  }, []);

  const stopVisualLoop = useCallback(() => {
    if (rAFIdRef.current !== null) {
      cancelAnimationFrame(rAFIdRef.current);
      rAFIdRef.current = null;
    }
  }, []);

  const startVisualLoop = useCallback(() => {
    if (rAFIdRef.current !== null) return;

    const loop = () => {
      if (
        !isCurrentSongPlaying ||
        !player ||
        player.paused ||
        interactionRef.current !== 'normal' ||
        !seekbarRef.current
      ) {
        rAFIdRef.current = null;
        return;
      }

      const currentTime = player.currentTime || 0;
      const duration = currentSongData.duration || player.duration || 0;
      updateVisualProgress(currentTime, duration);

      rAFIdRef.current = requestAnimationFrame(loop);
    };

    rAFIdRef.current = requestAnimationFrame(loop);
  }, [isCurrentSongPlaying, player, currentSongData.duration, updateVisualProgress]);

  const scheduleSeekFallback = useCallback((token: number) => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      if (interactionRef.current === 'post-seek' && latestSeekRef.current?.token === token) {
        interactionRef.current = 'normal';
        latestSeekRef.current = null;

        if (player && seekbarRef.current) {
          seekbarRef.current.removeAttribute('data-seeking');
          const actual = player.currentTime || 0;
          const dur = currentSongData.duration || player.duration || 0;
          updateVisualProgress(actual, dur);
        }

        if (isCurrentSongPlaying && player && !player.paused) {
          startVisualLoop();
        }
      }
    }, 500);
  }, [currentSongData.duration, isCurrentSongPlaying, player, startVisualLoop, updateVisualProgress]);

  // Handle seek completion confirmation from AudioPlayer
  useEffect(() => {
    if (!player) return undefined;

    const handleSeeked = (seekedTime?: unknown) => {
      const latest = latestSeekRef.current;
      if (!latest || interactionRef.current !== 'post-seek') {
        return;
      }

      const actualTime =
        typeof seekedTime === 'number' ? seekedTime : (player.currentTime || 0);

      // Only unlock if actual audio position corresponds to the latest requested target
      if (Math.abs(actualTime - latest.target) <= 1.5) {
        if (seekTimeoutRef.current) {
          clearTimeout(seekTimeoutRef.current);
          seekTimeoutRef.current = null;
        }
        interactionRef.current = 'normal';
        latestSeekRef.current = null;

        if (seekbarRef.current) {
          seekbarRef.current.removeAttribute('data-seeking');
          updateVisualProgress(actualTime, currentSongData.duration || player.duration || 0);
        }

        if (isCurrentSongPlaying && !player.paused) {
          startVisualLoop();
        }
      }
    };

    player.on('seeked', handleSeeked);

    return () => {
      player.off('seeked', handleSeeked);
    };
  }, [player, currentSongData.duration, isCurrentSongPlaying, startVisualLoop, updateVisualProgress]);

  // Synchronize on song or duration change
  useEffect(() => {
    const input = seekbarRef.current;
    if (!input) return;

    const duration = currentSongData.duration || 0;
    input.max = String(duration);

    const currentTime = player?.currentTime || 0;
    updateVisualProgress(currentTime, duration);
  }, [currentSongData.songId, currentSongData.duration, player, updateVisualProgress]);

  // Lifecycle-aware rAF visual playback engine
  useEffect(() => {
    if (isCurrentSongPlaying && currentSongData.songId && interactionRef.current === 'normal') {
      startVisualLoop();
    } else {
      stopVisualLoop();
      // Ensure visual sync when paused
      if (player && seekbarRef.current && interactionRef.current === 'normal') {
        updateVisualProgress(player.currentTime || 0, currentSongData.duration || 0);
      }
    }

    return () => {
      stopVisualLoop();
    };
  }, [isCurrentSongPlaying, currentSongData.songId, currentSongData.duration, player, startVisualLoop, stopVisualLoop, updateVisualProgress]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      stopVisualLoop();
    };
  }, [stopVisualLoop]);

  const handlePointerDown = (e: PointerEvent<HTMLInputElement>) => {
    pointerStartRef.current = { time: Date.now(), hasMoved: false };
    interactionRef.current = 'scrubbing';
    stopVisualLoop();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.removeAttribute('data-seeking');
    e.currentTarget.setAttribute('data-scrubbing', 'true');

    const pos = e.currentTarget.valueAsNumber;
    updateVisualProgress(pos, currentSongData.duration || 0, false);
    if (onSeek) onSeek(pos);
  };

  const handleInput = (e: FormEvent<HTMLInputElement>) => {
    pointerStartRef.current.hasMoved = true;
    const pos = e.currentTarget.valueAsNumber;
    updateVisualProgress(pos, currentSongData.duration || 0, false);
    if (onSeek) onSeek(pos);
  };

  const handlePointerUp = (e: PointerEvent<HTMLInputElement>) => {
    if (interactionRef.current === 'scrubbing') {
      const targetTime = e.currentTarget.valueAsNumber;
      const wasClick =
        !pointerStartRef.current.hasMoved && Date.now() - pointerStartRef.current.time < 400;

      e.currentTarget.removeAttribute('data-scrubbing');

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Pointer capture may have already been released
      }

      if (wasClick) {
        e.currentTarget.setAttribute('data-seeking', 'true');
        updateVisualProgress(targetTime, currentSongData.duration || 0, false);
      }

      const token = ++seekTokenRef.current;
      latestSeekRef.current = { token, target: targetTime, timestamp: Date.now() };
      interactionRef.current = 'post-seek';
      updateSongPosition(targetTime);
      scheduleSeekFallback(token);
    }
  };

  const handlePointerCancel = (e: PointerEvent<HTMLInputElement>) => {
    if (interactionRef.current === 'scrubbing') {
      e.currentTarget.removeAttribute('data-scrubbing');
      e.currentTarget.removeAttribute('data-seeking');

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Pointer capture may have already been released
      }

      interactionRef.current = 'normal';
      if (player && seekbarRef.current) {
        updateVisualProgress(player.currentTime || 0, currentSongData.duration || player.duration || 0);
      }
      if (isCurrentSongPlaying && player && !player.paused) {
        startVisualLoop();
      }
    }
  };

  const handleOnWheel = (e: WheelEvent<HTMLInputElement>) => {
    interactionRef.current = 'wheel';
    stopVisualLoop();
    const target = e.currentTarget;
    target.setAttribute('data-scrubbing', 'true');

    const max = target.max ? Number(target.max) : (currentSongData.duration || 0);
    const scrollIncrement = preferences?.seekbarScrollInterval || 5;
    const currentVal = target.valueAsNumber || 0;
    const incrementValue = e.deltaY > 0 ? -scrollIncrement : scrollIncrement;
    let value = currentVal + incrementValue;

    if (value > max) value = max;
    if (value < 0) value = 0;

    target.value = String(value);
    updateVisualProgress(value, max, false);
    if (onSeek) onSeek(value);

    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      target.removeAttribute('data-scrubbing');
      const token = ++seekTokenRef.current;
      latestSeekRef.current = { token, target: value, timestamp: Date.now() };
      interactionRef.current = 'post-seek';
      updateSongPosition(value);
      scheduleSeekFallback(token);
    }, 250);
  };

  const seekBarCssProperties: CSSProperties = {};
  seekBarCssProperties['--seek-before-width'] = '0%';
  if (sliderOpacity !== undefined) seekBarCssProperties['--slider-opacity'] = `${sliderOpacity}`;

  return (
    <input
      type="range"
      name={name}
      id={id}
      className={
        className ||
        "seek-bar-slider before:bg-seekbar-background-color/75 hover:before:bg-font-color-highlight dark:before:bg-dark-seekbar-background-color/75 dark:hover:before:bg-dark-font-color-highlight relative float-left m-0 h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:max-w-full before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[background,height] before:content-[''] focus-visible:outline!"
      }
      min={0}
      max={currentSongData.duration || 0}
      defaultValue={0}
      onPointerDown={handlePointerDown}
      onInput={handleInput}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheel={handleOnWheel}
      ref={seekbarRef}
      style={seekBarCssProperties}
    />
  );
};

export default SeekBarSlider;
