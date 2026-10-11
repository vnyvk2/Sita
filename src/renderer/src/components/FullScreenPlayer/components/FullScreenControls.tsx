import { dispatch, store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import useHeartBurst from '../../../hooks/useHeartBurst';
import Button from '../../Button';
import HeartBurst from '../../HeartBurst';
import LyricsIcon from '../../Icons/LyricsIcon';
import QueueIcon from '../../Icons/QueueIcon';
import KaraokeSlider from '../../KaraokeSlider';
import VolumeSlider from '../../VolumeSlider';

interface FullScreenControlsProps {
  isLyricsVisible: boolean;
  setIsLyricsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isQueueVisible: boolean;
  setIsQueueVisible: React.Dispatch<React.SetStateAction<boolean>>;
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
  const isKaraoke = useStore(store, (state) => state.localStorage?.playback?.isKaraoke ?? false);
  const karaokeLevel = useStore(
    store,
    (state) => state.localStorage?.playback?.karaokeLevel ?? 100
  );

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

  const [isKaraokeHovered, setIsKaraokeHovered] = useState(false);
  const karaokeHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKaraokeMouseEnter = useCallback(() => {
    if (karaokeHoverTimeoutRef.current) {
      clearTimeout(karaokeHoverTimeoutRef.current);
      karaokeHoverTimeoutRef.current = null;
    }
    setIsKaraokeHovered(true);
  }, []);

  const handleKaraokeMouseLeave = useCallback(() => {
    if (karaokeHoverTimeoutRef.current) {
      clearTimeout(karaokeHoverTimeoutRef.current);
    }
    karaokeHoverTimeoutRef.current = setTimeout(() => {
      setIsKaraokeHovered(false);
    }, 180);
  }, []);

  const handleKaraokeBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (karaokeHoverTimeoutRef.current) {
        clearTimeout(karaokeHoverTimeoutRef.current);
      }
      karaokeHoverTimeoutRef.current = setTimeout(() => {
        setIsKaraokeHovered(false);
      }, 180);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (karaokeHoverTimeoutRef.current) {
        clearTimeout(karaokeHoverTimeoutRef.current);
      }
    };
  }, []);

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

  const handleToggleKaraoke = useCallback(() => {
    dispatch({ type: 'TOGGLE_KARAOKE_MODE' });
  }, []);

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
          aria-label={t('player.playPause')}
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
          clickHandler={() => toggleRepeat()}
        />
      </div>

      {/* Right Cluster: Sing/Karaoke, Lyrics, Queue, Volume */}
      <div className="flex items-center gap-1">
        {/* Sing Mode (Karaoke Vocal Reducer) Toggle + Vertical Flyout Slider */}
        <div
          className="relative flex items-center justify-center"
          onMouseEnter={handleKaraokeMouseEnter}
          onMouseLeave={handleKaraokeMouseLeave}
          onFocus={handleKaraokeMouseEnter}
          onBlur={handleKaraokeBlur}
        >
          <button
            type="button"
            data-testid="fullscreen-karaoke-toggle-btn"
            onClick={handleToggleKaraoke}
            title={`${t('player.karaokeTooltip', 'Toggle Sing Mode (Vocal Reducer)')}${
              isKaraoke ? ` (${Math.round(karaokeLevel)}%)` : ''
            }`}
            aria-label={t('player.karaokeTooltip', 'Toggle Sing Mode (Vocal Reducer)')}
            aria-pressed={isKaraoke}
            className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 p-0 text-white shadow-xs backdrop-blur-md transition-all hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white active:scale-95 ${
              isKaraoke
                ? 'text-font-color-highlight dark:text-dark-font-color-highlight bg-white/25!'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <span className="material-icons-round text-xl">{isKaraoke ? 'mic_off' : 'mic'}</span>
          </button>

          {/* Vertical Karaoke Popout Card */}
          <div
            data-testid="fullscreen-karaoke-flyout"
            className={`karaoke-flyout-card absolute bottom-full left-1/2 z-40 mb-2.5 flex -translate-x-1/2 flex-col items-center justify-center rounded-xl border border-white/10 bg-zinc-950/95 px-2 py-2.5 shadow-2xl backdrop-blur-md transition-all duration-200 ease-out before:absolute before:inset-x-0 before:top-full before:h-4 before:bg-transparent before:content-[''] ${
              isKaraokeHovered
                ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none invisible translate-y-2 scale-95 opacity-0'
            }`}
          >
            <span className="mb-1.5 text-[10px] font-semibold text-white/70 select-none">
              {isKaraoke ? `${Math.round(karaokeLevel)}%` : '0%'}
            </span>
            <div className="relative flex h-28 w-6 items-center justify-center">
              <KaraokeSlider
                name="fullscreen-karaoke-slider"
                id="fullScreenKaraokeSlider"
                sliderOpacity={0.85}
                className="before:bg-font-color-white/50 hover:before:bg-font-color-highlight dark:before:bg-font-color-white/50 dark:hover:bg-dark-font-color-highlight absolute w-28 origin-center -rotate-90 appearance-none bg-transparent! p-0 outline-hidden focus-visible:outline!"
              />
            </div>
          </div>
        </div>

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
            iconName={isMuted || volume === 0 ? 'volume_off' : volume > 50 ? 'volume_up' : 'volume_down_alt'}
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
