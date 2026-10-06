import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import useHeartBurst from '../../../hooks/useHeartBurst';
import Button from '../../Button';
import HeartBurst from '../../HeartBurst';
import LyricsIcon from '../../Icons/LyricsIcon';
import QueueIcon from '../../Icons/QueueIcon';
import VolumeSlider from '../../VolumeSlider';

interface FullScreenControlsProps {
  isLyricsVisible: boolean;
  setIsLyricsVisible: (fn: (prev: boolean) => boolean) => void;
  isQueueVisible: boolean;
  setIsQueueVisible: (fn: (prev: boolean) => boolean) => void;
  className?: string;
}

export const FullScreenControls = ({
  isLyricsVisible,
  setIsLyricsVisible,
  isQueueVisible,
  setIsQueueVisible,
  className = ''
}: FullScreenControlsProps) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isPlayerStalled = useStore(store, (state) => state.player.isPlayerStalled);
  const isShuffling = useStore(store, (state) => state.player.isShuffling);
  const isRepeating = useStore(store, (state) => state.player.isRepeating);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const volume = useStore(store, (state) => state.player.volume.value);

  const {
    toggleIsFavorite,
    toggleQueueShuffle,
    toggleRepeat,
    toggleSongPlayback,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    toggleMutedState
  } = useContext(AppUpdateContext);

  const { t } = useTranslation();
  const { isBursting, triggerBurst } = useHeartBurst();

  const handleFavoriteClick = useCallback(() => {
    if (!currentSongData.isKnownSource) return;
    if (!currentSongData.isAFavorite) {
      triggerBurst();
    }
    toggleIsFavorite(!currentSongData.isAFavorite);
  }, [currentSongData.isAFavorite, currentSongData.isKnownSource, toggleIsFavorite, triggerBurst]);

  const handleSkipNext = useCallback(() => {
    handleSkipForwardClick('USER_SKIP');
  }, [handleSkipForwardClick]);

  return (
    <div
      data-testid="fullscreen-controls"
      className={`fullscreen-controls flex items-center justify-between gap-2 px-2 py-1 select-none ${className}`}
    >
      {/* Left Cluster: Like & Shuffle */}
      <div className="flex items-center gap-1">
        {/* Favorite Button */}
        <div className="relative flex items-center justify-center">
          <Button
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0! bg-white/10 p-0! text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline! active:scale-95"
            tooltipLabel={
              currentSongData.isKnownSource
                ? t('player.likeDislike')
                : t('player.likeDislikeDisabled')
            }
            iconName="favorite"
            iconClassName={`text-xl transition-all ${
              currentSongData.isAFavorite
                ? 'material-icons-round text-font-color-favorite! scale-110'
                : 'material-icons-round-outlined opacity-70 hover:opacity-100'
            } ${isBursting ? 'fx-heart-pop' : ''}`}
            isDisabled={!currentSongData.isKnownSource}
            clickHandler={handleFavoriteClick}
          />
          <HeartBurst isBursting={isBursting} />
        </div>

        {/* Shuffle Button */}
        <Button
          className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0! bg-white/10 p-0! text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline! active:scale-95 ${
            isShuffling ? 'bg-white/25!' : ''
          }`}
          tooltipLabel={t('player.shuffle')}
          iconName="shuffle"
          iconClassName={`material-icons-round text-xl transition-all ${
            isShuffling
              ? 'text-font-color-highlight dark:text-dark-font-color-highlight scale-105 opacity-100'
              : 'opacity-70 hover:opacity-100'
          }`}
          clickHandler={toggleQueueShuffle}
        />
      </div>

      {/* Center Cluster: Previous, Play/Pause Hero, Next, Repeat */}
      <div className="flex items-center gap-2">
        {/* Skip Backward */}
        <Button
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0! bg-white/10 p-0! text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline! active:scale-90"
          tooltipLabel={t('player.prevSong')}
          iconName="skip_previous"
          iconClassName="material-icons-round text-2xl text-white"
          clickHandler={handleSkipBackwardClick}
        />

        {/* Play/Pause Hero Button */}
        <button
          type="button"
          data-testid="fullscreen-play-pause-btn"
          aria-label={isCurrentSongPlaying ? t('player.pause') : t('player.play')}
          onClick={toggleSongPlayback}
          className="relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-0 bg-white text-zinc-950 shadow-xl transition-all duration-150 hover:scale-105 hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white active:scale-95"
        >
          {isPlayerStalled ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
          ) : (
            <span className="material-icons-round text-3xl leading-none">
              {isCurrentSongPlaying ? 'pause' : 'play_arrow'}
            </span>
          )}
        </button>

        {/* Skip Forward */}
        <Button
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0! bg-white/10 p-0! text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline! active:scale-90"
          tooltipLabel={t('player.nextSong')}
          iconName="skip_next"
          iconClassName="material-icons-round text-2xl text-white"
          clickHandler={handleSkipNext}
        />

        {/* Repeat Button */}
        <Button
          className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0! bg-white/10 p-0! text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline! active:scale-95 ${
            isRepeating !== 'false' ? 'bg-white/25!' : ''
          }`}
          tooltipLabel={t('player.repeat')}
          iconName={isRepeating === 'false' || isRepeating === 'repeat' ? 'repeat' : 'repeat_one'}
          iconClassName={`material-icons-round text-xl transition-all ${
            isRepeating !== 'false'
              ? 'text-font-color-highlight dark:text-dark-font-color-highlight scale-105 opacity-100'
              : 'opacity-70 hover:opacity-100'
          }`}
          clickHandler={toggleRepeat}
        />
      </div>

      {/* Right Cluster: Lyrics, Queue, Volume */}
      <div className="flex items-center gap-1">
        {/* Lyrics Toggle */}
        <button
          type="button"
          data-testid="fullscreen-lyrics-toggle-btn"
          onClick={() => setIsLyricsVisible((prev) => !prev)}
          title={t('player.lyrics')}
          aria-label={t('player.lyrics')}
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 p-0 text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white active:scale-95 ${
            isLyricsVisible
              ? 'text-font-color-highlight dark:text-dark-font-color-highlight bg-white/25!'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <LyricsIcon className="h-5 w-5" />
        </button>

        {/* Queue Peek Toggle */}
        <button
          type="button"
          data-testid="fullscreen-queue-toggle-btn"
          onClick={() => setIsQueueVisible((prev) => !prev)}
          title={t('player.currentQueue')}
          aria-label={t('player.currentQueue')}
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 p-0 text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white active:scale-95 ${
            isQueueVisible
              ? 'text-font-color-highlight dark:text-dark-font-color-highlight bg-white/25!'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <QueueIcon className="h-5 w-5" />
        </button>

        {/* Volume Mute & Expandable Slider */}
        <div className="group/volume relative flex items-center">
          <Button
            className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0! bg-white/10 p-0! text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline! active:scale-95 ${
              isMuted
                ? 'text-font-color-highlight dark:text-dark-font-color-highlight'
                : 'opacity-70 hover:opacity-100'
            }`}
            tooltipLabel={t('player.muteUnmute')}
            iconName={isMuted ? 'volume_off' : volume > 50 ? 'volume_up' : 'volume_down_alt'}
            iconClassName="material-icons-round text-xl"
            clickHandler={() => toggleMutedState(!isMuted)}
          />
          <div className="hidden w-20 pl-2 lg:block">
            <VolumeSlider name="fullscreen-volume-slider" id="fullScreenVolumeSlider" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FullScreenControls;
