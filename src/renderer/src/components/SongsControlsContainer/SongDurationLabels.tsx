import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useEffect, useState } from 'react';

import calculateTime from '../../utils/calculateTime';

export const ElapsedSongDuration = memo(() => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const handlePositionChange = useCallback((e: Event) => {
    if ('detail' in e && typeof e.detail === 'number') {
      setElapsedSeconds(Math.floor(e.detail as number));
    }
  }, []);

  useEffect(() => {
    document.addEventListener('player/positionChange', handlePositionChange);
    return () => document.removeEventListener('player/positionChange', handlePositionChange);
  }, [handlePositionChange]);

  const time = calculateTime(elapsedSeconds);

  return (
    <div className="current-song-duration w-16 text-center font-light">
      {time.minutes}:{time.seconds}
    </div>
  );
});

ElapsedSongDuration.displayName = 'ElapsedSongDuration';

export const RemainingSongDuration = memo(() => {
  const duration = useStore(store, (state) => state.currentSongData?.duration || 0);
  const showSongRemainingTime = useStore(
    store,
    (state) => state.localStorage.preferences?.showSongRemainingTime ?? false
  );

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const handlePositionChange = useCallback((e: Event) => {
    if ('detail' in e && typeof e.detail === 'number') {
      setElapsedSeconds(Math.floor(e.detail as number));
    }
  }, []);

  useEffect(() => {
    document.addEventListener('player/positionChange', handlePositionChange);
    return () => document.removeEventListener('player/positionChange', handlePositionChange);
  }, [handlePositionChange]);

  const toggleRemainingTime = useCallback(() => {
    storage.preferences.setPreferences('showSongRemainingTime', !showSongRemainingTime);
  }, [showSongRemainingTime]);

  const remaining = Math.max(0, duration - elapsedSeconds);
  const displayTime = showSongRemainingTime ? calculateTime(remaining) : calculateTime(duration);

  return (
    <button
      type="button"
      onClick={toggleRemainingTime}
      title={showSongRemainingTime ? 'Show total duration' : 'Show remaining time'}
      className="full-song-duration hover:text-font-color-highlight dark:hover:text-dark-font-color-highlight w-16 cursor-pointer text-center text-sm font-light transition-colors select-none"
    >
      {showSongRemainingTime ? '-' : ''}
      {displayTime.minutes}:{displayTime.seconds}
    </button>
  );
});

RemainingSongDuration.displayName = 'RemainingSongDuration';
