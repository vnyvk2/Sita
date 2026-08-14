import { store } from '@renderer/store/store';
import { useLocation, useRouter } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useOverlayNavigation } from '../../hooks/useOverlayNavigation';
import Button from '../Button';
import LyricsIcon from '../Icons/LyricsIcon';
import SeekBarContainer from './SeekBarContainer';

const SongControlsAndSeekbarContainer = () => {
  const { toggleOverlay } = useOverlayNavigation();
  const location = useLocation();
  const { history } = useRouter();
  const isLyricsDrawerOpen = useStore(store, (state) => state.isLyricsDrawerOpen);
  const isAFavorite = useStore(store, (state) => state.currentSongData.isAFavorite);
  const isKnownSource = useStore(store, (state) => state.currentSongData.isKnownSource);
  const isShuffling = useStore(store, (state) => state.player.isShuffling);
  const isRepeating = useStore(store, (state) => state.player.isRepeating);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isPlayerStalled = useStore(store, (state) => state.player.isPlayerStalled);

  const {
    toggleQueueShuffle,
    toggleIsFavorite,
    toggleRepeat,
    toggleSongPlayback,
    toggleLyricsDrawer,
    handleSkipForwardClick,
    handleSkipBackwardClick
  } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="song-controls-and-seekbar-container flex flex-col items-center justify-center py-2">
      <div className="controls-container [&>div.active_span.icon]:text-font-color-highlight! dark:[&>div.active_span.icon]:text-dark-font-color-highlight! flex w-2/3 max-w-sm items-center justify-around px-2 lg:w-4/5 lg:p-0 [&>div.active_span.icon]:opacity-100">
        <Button
          className={`like-btn after:bg-font-color-highlight dark:after:bg-dark-font-color-highlight !mr-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:!outline dark:bg-transparent dark:hover:bg-transparent ${
            isAFavorite && 'active after:opacity-100'
          } ${!isKnownSource && 'cursor-none! brightness-50'}`}
          tooltipLabel={isKnownSource ? t('player.likeDislike') : t('player.likeDislikeDisabled')}
          iconName="favorite"
          iconClassName={`${
            isAFavorite
              ? 'material-icons-round text-font-color-highlight! dark:text-dark-font-color-highlight! opacity-100!'
              : 'material-icons-round-outlined'
          } icon cursor-pointer !text-2xl leading-none text-font-color-black opacity-60 transition-opacity hover:opacity-80 dark:text-font-color-white`}
          clickHandler={() => isKnownSource && toggleIsFavorite(!isAFavorite)}
        />

        <Button
          className={`shuffle-btn after:bg-font-color-highlight dark:after:bg-dark-font-color-highlight !m-0 flex items-center justify-center !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:!outline dark:bg-transparent dark:hover:bg-transparent ${
            isShuffling && 'active after:opacity-100'
          }`}
          tooltipLabel={t('player.shuffle')}
          iconName="shuffle"
          iconClassName={`material-icons-round icon !text-2xl opacity-60 transition-opacity hover:opacity-80 ${
            isShuffling &&
            'text-font-color-highlight! dark:text-dark-font-color-highlight! opacity-100!'
          }`}
          clickHandler={toggleQueueShuffle}
        />

        <Button
          className="skip-back-btn m-0! rounded-none! border-0! bg-transparent p-0! outline-offset-1 hover:bg-transparent focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
          tooltipLabel={t('player.prevSong')}
          iconName="skip_previous"
          iconClassName="material-icons-round text-2xl! opacity-60 transition-opacity hover:opacity-80"
          clickHandler={handleSkipBackwardClick}
        />

        <Button
          className={`play-pause-btn relative !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 hover:bg-transparent focus-visible:!outline dark:bg-transparent dark:hover:bg-transparent ${
            isPlayerStalled &&
            `after:animate-spin-ease after:border-t-font-color-black dark:after:border-t-font-color-white after:absolute after:h-5 after:w-5 after:rounded-full after:border-2 after:border-[transparent] after:content-['']`
          }`}
          tooltipLabel={t('player.playPause')}
          iconName={isCurrentSongPlaying ? 'pause_circle' : 'play_circle'}
          iconClassName={`material-icons-round !text-5xl opacity-80 transition-opacity hover:opacity-80 ${
            isPlayerStalled && 'opacity-10!'
          }`}
          clickHandler={() => !isPlayerStalled && toggleSongPlayback()}
        />

        <Button
          className="skip-forward-btn m-0! flex rounded-none! border-0! bg-transparent p-0! outline-offset-1 hover:bg-transparent focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
          tooltipLabel={t('player.nextSong')}
          iconName="skip_next"
          iconClassName="material-icons-round text-2xl! opacity-60 transition-opacity hover:opacity-80"
          clickHandler={() => handleSkipForwardClick('USER_SKIP')}
        />

        <Button
          className={`repeat-btn after:bg-font-color-highlight dark:after:bg-dark-font-color-highlight !m-0 !rounded-none !border-0 bg-transparent !p-0 outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity hover:bg-transparent focus-visible:!outline dark:bg-transparent dark:hover:bg-transparent ${
            isRepeating !== 'false' && 'active after:opacity-100'
          }`}
          tooltipLabel={t('player.repeat')}
          iconName={isRepeating === 'false' || isRepeating === 'repeat' ? 'repeat' : 'repeat_one'}
          iconClassName={`material-icons-round !text-2xl opacity-60 transition-opacity hover:opacity-80 ${
            isRepeating !== 'false' &&
            'text-font-color-highlight! dark:text-dark-font-color-highlight! opacity-100!'
          }`}
          clickHandler={() => toggleRepeat()}
        />

        <Button
          className={`lyrics-btn group after:bg-font-color-highlight dark:after:bg-dark-font-color-highlight !m-0 flex items-center justify-center !border-0 bg-transparent !p-0 outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:transition-opacity hover:bg-transparent focus-visible:!outline dark:bg-transparent dark:hover:bg-transparent ${
            isLyricsDrawerOpen || location.pathname.startsWith('/main-player/lyrics')
              ? 'active after:opacity-100'
              : 'after:opacity-0'
          }`}
          tooltipLabel={t('player.lyrics')}
          clickHandler={() => {
            if (location.pathname.startsWith('/main-player/lyrics')) {
              history.back();
            } else {
              toggleLyricsDrawer();
            }
          }}
        >
          <LyricsIcon
            className={`h-6 w-6 transition-opacity hover:opacity-80 ${
              isLyricsDrawerOpen || location.pathname.startsWith('/main-player/lyrics')
                ? 'text-font-color-highlight dark:text-dark-font-color-highlight opacity-100'
                : 'opacity-60'
            }`}
          />
        </Button>
      </div>
      <SeekBarContainer />
    </div>
  );
};

export default SongControlsAndSeekbarContainer;
