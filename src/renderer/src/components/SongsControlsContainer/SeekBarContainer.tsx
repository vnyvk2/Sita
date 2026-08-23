import SeekBarSlider from '../SeekBarSlider';
import { ElapsedSongDuration, RemainingSongDuration } from './SongDurationLabels';

const SeekBarContainer = () => {
  return (
    <div className="seekbar-and-song-durations-container flex h-1/3 w-full max-w-xl flex-row items-center justify-between text-sm">
      <ElapsedSongDuration />
      <div className="seek-bar relative flex h-fit w-4/5 items-center rounded-md">
        <SeekBarSlider id="seek-bar-slider" name="seek-bar-slider" />
      </div>
      <RemainingSongDuration />
    </div>
  );
};

export default SeekBarContainer;
