import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import {
  type CSSProperties,
  type ChangeEvent,
  type WheelEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';
import calculateTime from '../utils/calculateTime';
import debounce from '../utils/debounce';

type Props = {
  id: string;
  name: string;
  className?: string;
  sliderOpacity?: number;
  onSeek?: (currentPosition: number) => void;
};

const SeekBarSlider = (props: Props) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { updateSongPosition } = useContext(AppUpdateContext);

  const { id, name, className, sliderOpacity, onSeek } = props;

  const [songPos, setSongPos] = useState(0);
  const isMouseDownRef = useRef(false);
  const isMouseScrollRef = useRef(false);
  const seekbarRef = useRef<HTMLInputElement | null>(null);

  const duration = currentSongData.duration || 0;

  const seekBarCssProperties: CSSProperties = {};
  if (sliderOpacity !== undefined) seekBarCssProperties['--slider-opacity'] = `${sliderOpacity}`;

  const handleSongPositionChange = useCallback(
    (e: Event) => {
      if ('detail' in e && typeof e.detail === 'number') {
        const songPosition = e.detail as number;

        // When not actively scrubbing or dragging, update the visual progress directly on the DOM element
        if (seekbarRef.current && !isMouseDownRef.current && !isMouseScrollRef.current) {
          const liveDuration = currentSongData.duration || store.state.currentSongData?.duration || 0;
          const songDuration = liveDuration > 0 ? liveDuration : songPosition;
          const percent = songDuration > 0 ? Math.min(100, Math.max(0, (songPosition / songDuration) * 100)) : 0;

          seekbarRef.current.style.setProperty('--seek-before-width', `${percent}%`);
          seekbarRef.current.value = String(songPosition);

          const time = calculateTime(songPosition);
          seekbarRef.current.title = `${time.minutes}:${time.seconds}`;
        }
      }
    },
    [currentSongData.duration]
  );

  useEffect(() => {
    document.addEventListener('player/positionChange', handleSongPositionChange);
    return () => document.removeEventListener('player/positionChange', handleSongPositionChange);
  }, [handleSongPositionChange]);

  const prevSongIdRef = useRef(currentSongData.songId);

  // Reset progress on track change
  useEffect(() => {
    if (prevSongIdRef.current !== currentSongData.songId) {
      prevSongIdRef.current = currentSongData.songId;
      setSongPos(0);
      if (seekbarRef.current) {
        seekbarRef.current.style.setProperty('--seek-before-width', '0%');
        seekbarRef.current.value = '0';
      }
    }
  }, [currentSongData.songId]);

  useEffect(() => {
    const seekBar = seekbarRef.current;

    if (seekBar) {
      const handleSeekbarMouseDown = () => {
        isMouseDownRef.current = true;
      };
      const handleTouchStart = () => {
        isMouseDownRef.current = true;
      };
      const handleSeekbarEnd = () => {
        if (isMouseDownRef.current) {
          isMouseDownRef.current = false;
          const finalPos = seekBar.valueAsNumber || 0;
          updateSongPosition(finalPos);
          if (onSeek) onSeek(finalPos);
        }
      };

      seekBar.addEventListener('mousedown', handleSeekbarMouseDown);
      window.addEventListener('mouseup', handleSeekbarEnd);
      seekBar.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchend', handleSeekbarEnd);

      return () => {
        seekBar.removeEventListener('mousedown', handleSeekbarMouseDown);
        window.removeEventListener('mouseup', handleSeekbarEnd);
        seekBar.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleSeekbarEnd);
      };
    }
    return undefined;
  }, [onSeek, updateSongPosition]);

  const handleOnChange = (e: ChangeEvent<HTMLInputElement>) => {
    const pos = e.currentTarget.valueAsNumber;
    setSongPos(pos);
    const songDuration = duration > 0 ? duration : pos;
    const percent = songDuration > 0 ? Math.min(100, Math.max(0, (pos / songDuration) * 100)) : 0;
    if (seekbarRef.current) {
      seekbarRef.current.style.setProperty('--seek-before-width', `${percent}%`);
      seekbarRef.current.value = String(pos);
    }
    if (onSeek) onSeek(pos);

    // If change triggered by keyboard without mousedown, commit seek after debounce
    if (!isMouseDownRef.current) {
      debounce(() => {
        updateSongPosition(pos);
      }, 150);
    }
  };

  const handleOnWheel = (e: WheelEvent<HTMLInputElement>) => {
    isMouseScrollRef.current = true;

    const max = parseInt(e.currentTarget.max, 10);
    const scrollIncrement = preferences.seekbarScrollInterval;

    const incrementValue = e.deltaY > 0 ? -scrollIncrement : scrollIncrement;
    const currentVal = seekbarRef.current ? seekbarRef.current.valueAsNumber : songPos;
    let value = (currentVal || 0) + incrementValue;

    if (value > max) value = max;
    if (value < 0) value = 0;

    setSongPos(value);
    const songDuration = duration > 0 ? duration : value;
    const percent = songDuration > 0 ? Math.min(100, Math.max(0, (value / songDuration) * 100)) : 0;
    if (seekbarRef.current) {
      seekbarRef.current.style.setProperty('--seek-before-width', `${percent}%`);
      seekbarRef.current.value = String(value);
    }
    if (onSeek) onSeek(value);

    debounce(() => {
      isMouseScrollRef.current = false;
      updateSongPosition(value);
    }, 250);
  };

  const currentSongPosition = calculateTime(songPos);

  return (
    <input
      type="range"
      name={name}
      id={id}
      className={
        className ||
        "seek-bar-slider before:bg-seekbar-background-color/75 hover:before:bg-font-color-highlight dark:before:bg-dark-seekbar-background-color/75 dark:hover:before:bg-dark-font-color-highlight relative float-left m-0 h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:max-w-full before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!"
      }
      min={0}
      max={duration >= songPos ? duration : songPos}
      defaultValue={0}
      onChange={handleOnChange}
      onWheel={handleOnWheel}
      ref={seekbarRef}
      style={seekBarCssProperties}
      title={`${currentSongPosition.minutes}:${currentSongPosition.seconds}`}
    />
  );
};

export default SeekBarSlider;
