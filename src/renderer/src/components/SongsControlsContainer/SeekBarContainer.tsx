import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useRef, useState } from 'react';

import calculateTime from '../../utils/calculateTime';
import SeekBarSlider from '../SeekBarSlider';

const SeekBarContainer = () => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const [songSecond, setSongSecond] = useState(0);
  const currentFloorSecondRef = useRef(0);

  // Subscribe to position change for ~1 Hz whole-second time label updates
  useEffect(() => {
    const handlePositionChange = (e: Event) => {
      if ('detail' in e && typeof e.detail === 'number') {
        const floorSec = Math.floor(e.detail);
        if (floorSec !== currentFloorSecondRef.current) {
          currentFloorSecondRef.current = floorSec;
          setSongSecond(floorSec);
        }
      }
    };

    document.addEventListener('player/positionChange', handlePositionChange);
    return () => document.removeEventListener('player/positionChange', handlePositionChange);
  }, []);

  // Reset when song changes
  useEffect(() => {
    currentFloorSecondRef.current = 0;
    setSongSecond(0);
  }, [currentSongData.songId]);

  // Handle immediate visual feedback during active user scrubbing
  const handleSeek = useCallback((currentPosition: number) => {
    const floorSec = Math.floor(currentPosition);
    if (floorSec !== currentFloorSecondRef.current) {
      currentFloorSecondRef.current = floorSec;
      setSongSecond(floorSec);
    }
  }, []);

  const currentSongPosition = calculateTime(songSecond);
  const songDuration = preferences?.showSongRemainingTime
    ? (currentSongData.duration || 0) - songSecond >= 0
      ? calculateTime((currentSongData.duration || 0) - songSecond)
      : calculateTime(0)
    : calculateTime(currentSongData.duration || 0);

  return (
    <div className="seekbar-and-song-durations-container flex h-1/3 w-full max-w-xl flex-row items-center justify-between text-sm">
      <div className="current-song-duration w-16 text-center font-light">
        {currentSongPosition.minutes}:{currentSongPosition.seconds}
      </div>
      <div className="seek-bar relative flex h-fit w-4/5 items-center rounded-md">
        <SeekBarSlider
          id="seek-bar-slider"
          name="seek-bar-slider"
          onSeek={handleSeek}
        />
      </div>
      <div className="full-song-duration w-16 text-center text-sm font-light">
        {preferences?.showSongRemainingTime ? '-' : ''}
        {songDuration.minutes}:{songDuration.seconds}
      </div>
    </div>
  );
};

export default SeekBarContainer;
