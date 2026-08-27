import Button from '@renderer/components/Button';
import Img from '@renderer/components/Img';
import SeekBarSlider from '@renderer/components/SeekBarSlider';
import VolumeSlider from '@renderer/components/VolumeSlider';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { store } from '@renderer/store/store';
import calculateTime from '@renderer/utils/calculateTime';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';

const TheatreLyricsPlayerBar = () => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isAFavorite = useStore(store, (state) => state.currentSongData.isAFavorite);
  const isKnownSource = useStore(store, (state) => state.currentSongData.isKnownSource);
  const isShuffling = useStore(store, (state) => state.player.isShuffling);
  const isRepeating = useStore(store, (state) => state.player.isRepeating);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isPlayerStalled = useStore(store, (state) => state.player.isPlayerStalled);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const volume = useStore(store, (state) => state.player.volume.value);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const {
    toggleQueueShuffle,
    toggleIsFavorite,
    toggleRepeat,
    toggleSongPlayback,
    handleSkipForwardClick,
    handleSkipBackwardClick,
    toggleMutedState
  } = useContext(AppUpdateContext);

  const { t } = useTranslation();
  const [songPos, setSongPos] = useState(() => {
    if (typeof window !== 'undefined' && window.__NORA_AUDIO_PLAYER__) {
      return window.__NORA_AUDIO_PLAYER__.currentTime || 0;
    }
    return 0;
  });

  // Synchronize playback position with player events
  const handleSongPositionChange = useCallback((e: Event) => {
    if ('detail' in e && typeof e.detail === 'number') {
      setSongPos(e.detail);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('player/positionChange', handleSongPositionChange);
    return () => document.removeEventListener('player/positionChange', handleSongPositionChange);
  }, [handleSongPositionChange]);

  const currentSongPosition = useMemo(() => calculateTime(songPos), [songPos]);
  const songDuration = useMemo(() => {
    return preferences?.showSongRemainingTime
      ? currentSongData.duration - Math.floor(songPos) >= 0
        ? calculateTime(currentSongData.duration - Math.floor(songPos))
        : calculateTime(0)
      : calculateTime(currentSongData.duration);
  }, [currentSongData.duration, preferences?.showSongRemainingTime, songPos]);

  const artistNames = useMemo(() => {
    if (Array.isArray(currentSongData.artists)) {
      return currentSongData.artists.map((artist) => artist.name).join(', ');
    }
    return '';
  }, [currentSongData.artists]);

  return (
    <div className="theatre-lyrics-player-bar-container pointer-events-auto relative z-20 w-full px-6 pb-6 pt-2">
      <div className="mx-auto flex w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-black/60 px-6 py-3 shadow-2xl backdrop-blur-xl text-font-color-white">
        {/* Top row: Track info, primary playback controls, volume */}
        <div className="flex w-full items-center justify-between gap-4">
          {/* Left: Track Info */}
          <div className="flex min-w-0 max-w-[30%] items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg shadow-md">
              <Img
                src={currentSongData.artworkPath}
                fallbackSrc={DefaultSongCover}
                alt={currentSongData.title}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-col justify-center">
              <span
                className="truncate text-sm font-semibold text-white drop-shadow-xs"
                title={currentSongData.title}
              >
                {currentSongData.title || t('player.noSongPlaying')}
              </span>
              <span
                className="truncate text-xs text-white/70"
                title={artistNames}
              >
                {artistNames || t('player.unknownArtist')}
              </span>
            </div>
          </div>

          {/* Center: Playback Buttons */}
          <div className="flex items-center justify-center gap-3">
            <Button
              className={`like-btn !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline ${
                !isKnownSource && 'cursor-not-allowed! opacity-30'
              }`}
              tooltipLabel={isKnownSource ? t('player.likeDislike') : t('player.likeDislikeDisabled')}
              iconName="favorite"
              iconClassName={`${
                isAFavorite
                  ? 'material-icons-round text-font-color-favorite! opacity-100!'
                  : 'material-icons-round-outlined text-white/70 hover:text-white'
              } icon cursor-pointer !text-xl transition-colors`}
              clickHandler={() => isKnownSource && toggleIsFavorite(!isAFavorite)}
            />

            <Button
              className="shuffle-btn !m-0 flex items-center justify-center !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline"
              tooltipLabel={t('player.shuffle')}
              iconName="shuffle"
              iconClassName={`material-icons-round icon !text-xl transition-colors ${
                isShuffling
                  ? 'text-font-color-highlight! dark:text-dark-font-color-highlight! opacity-100!'
                  : 'text-white/70 hover:text-white'
              }`}
              clickHandler={toggleQueueShuffle}
            />

            <Button
              className="skip-back-btn !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline"
              tooltipLabel={t('player.prevSong')}
              iconName="skip_previous"
              iconClassName="material-icons-round !text-2xl text-white/80 hover:text-white transition-colors"
              clickHandler={handleSkipBackwardClick}
            />

            <Button
              className={`play-pause-btn relative !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline ${
                isPlayerStalled &&
                'after:animate-spin-ease after:border-t-white after:absolute after:h-5 after:w-5 after:rounded-full after:border-2 after:border-transparent after:content-[""]'
              }`}
              tooltipLabel={t('player.playPause')}
              iconName={isCurrentSongPlaying ? 'pause_circle' : 'play_circle'}
              iconClassName={`material-icons-round !text-4xl text-white hover:scale-105 transition-transform ${
                isPlayerStalled ? 'opacity-20!' : 'opacity-100'
              }`}
              clickHandler={() => !isPlayerStalled && toggleSongPlayback()}
            />

            <Button
              className="skip-forward-btn !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline"
              tooltipLabel={t('player.nextSong')}
              iconName="skip_next"
              iconClassName="material-icons-round !text-2xl text-white/80 hover:text-white transition-colors"
              clickHandler={() => handleSkipForwardClick('USER_SKIP')}
            />

            <Button
              className="repeat-btn !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline"
              tooltipLabel={t('player.repeat')}
              iconName={isRepeating === 'false' || isRepeating === 'repeat' ? 'repeat' : 'repeat_one'}
              iconClassName={`material-icons-round !text-xl transition-colors ${
                isRepeating !== 'false'
                  ? 'text-font-color-highlight! dark:text-dark-font-color-highlight! opacity-100!'
                  : 'text-white/70 hover:text-white'
              }`}
              clickHandler={() => toggleRepeat()}
            />
          </div>

          {/* Right: Volume Controls */}
          <div className="flex min-w-0 max-w-[30%] items-center justify-end gap-2">
            <Button
              className="volume-btn !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline"
              tooltipLabel={t('player.muteUnmute')}
              iconName={isMuted ? 'volume_off' : volume > 50 ? 'volume_up' : 'volume_down_alt'}
              iconClassName={`material-icons-round text-lg transition-colors ${
                isMuted
                  ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                  : 'text-white/70 hover:text-white'
              }`}
              clickHandler={() => toggleMutedState(!isMuted)}
            />

            <div className="w-24 max-w-[6rem]">
              <VolumeSlider name="theatre-volume-slider" id="theatreVolumeSlider" />
            </div>
          </div>
        </div>

        {/* Bottom row: Seekbar & durations */}
        <div className="flex w-full items-center gap-3 text-xs text-white/70">
          <span className="w-12 text-right font-mono">
            {currentSongPosition.minutes}:{currentSongPosition.seconds}
          </span>
          <div className="relative flex flex-1 items-center">
            <SeekBarSlider
              id="theatre-seek-bar-slider"
              name="theatre-seek-bar-slider"
              onSeek={(currentPosition) => setSongPos(currentPosition)}
            />
          </div>
          <span className="w-12 text-left font-mono">
            {preferences?.showSongRemainingTime ? '-' : ''}
            {songDuration.minutes}:{songDuration.seconds}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TheatreLyricsPlayerBar;
