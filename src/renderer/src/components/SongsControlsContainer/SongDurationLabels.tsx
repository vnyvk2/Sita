import { store } from '@renderer/store/store';
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

  const remaining = Math.max(0, duration - elapsedSeconds);
  const displayTime = showSongRemainingTime ? calculateTime(remaining) : calculateTime(duration);

  return (
    <div className="full-song-duration w-16 text-center text-sm font-light">
      {showSongRemainingTime ? '-' : ''}
      {displayTime.minutes}:{displayTime.seconds}
    </div>
  );
});

RemainingSongDuration.displayName = 'RemainingSongDuration';
