import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';
import LyricsIcon from '../Icons/LyricsIcon';
import { CloseIcon, MinimizeIcon } from '../Icons/WindowIcons';
import Img from '../Img';
import SeekBarSlider from '../SeekBarSlider';
import VolumeSlider from '../VolumeSlider';

const COMPACT_OPTIONAL_PRIORITY = [
  'love',
  'volume',
  'queue',
  'lyrics',
  'shuffle',
  'repeat'
] as const;

const BUTTON_SLOT_WIDTH = 28; // Standard 28px width budget per optional icon button
const METADATA_MIN_FLOOR = 60; // 60px minimum text breathing room before truncation

type Props = {
  isQueueVisible: boolean;
  isLyricsVisible: boolean;
  onToggleQueue: () => void;
  onToggleLyrics: () => void;
  pinnedControls: string[];
};

const CompactMiniPlayer = (props: Props) => {
  const {
    isQueueVisible,
    isLyricsVisible,
    onToggleQueue,
    onToggleLyrics,
    pinnedControls
  } = props;

  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isAFavorite = useStore(store, (state) => state.currentSongData.isAFavorite);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const volume = useStore(store, (state) => state.player.volume.value);
  const isRepeating = useStore(store, (state) => state.player.isRepeating);
  const isShuffling = useStore(store, (state) => state.player.isShuffling);

  const {
    toggleSongPlayback,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    toggleIsFavorite,
    toggleMutedState,
    toggleRepeat,
    toggleQueueShuffle
  } = useContext(AppUpdateContext);

  const { t } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const artworkRef = useRef<HTMLDivElement>(null);
  const coreControlsRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState(300);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);

  // Measure container width dynamically to budget optional control slots
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.round(entry.contentRect.width));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute how many optional controls fit into the current horizontal width budget
  const visibleOptionalControls = useMemo(() => {
    const artWidth = artworkRef.current?.getBoundingClientRect().width ?? 32;
    const coreWidth = coreControlsRef.current?.getBoundingClientRect().width ?? 84;
    const paddingAndGaps = 24;

    const fixedWidthRequirement = artWidth + coreWidth + METADATA_MIN_FLOOR + paddingAndGaps;
    const availableForOptional = containerWidth - fixedWidthRequirement;
    const maxSlots = Math.max(0, Math.floor(availableForOptional / BUTTON_SLOT_WIDTH));

    return COMPACT_OPTIONAL_PRIORITY
      .filter((control) => pinnedControls.includes(control))
      .slice(0, maxSlots);
  }, [containerWidth, pinnedControls]);

  // Two-finger tap detection to show context menu on touch devices for Compact Mode
  const touchPointsCountRef = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchPointsCountRef.current = e.touches.length;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchPointsCountRef.current === 2) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      const syntheticEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect ? rect.left + rect.width / 2 : 0,
        clientY: rect ? rect.top + rect.height / 2 : 0
      });
      containerRef.current?.dispatchEvent(syntheticEvent);
    }
    touchPointsCountRef.current = 0;
  };

  return (
    <div
      ref={containerRef}
      data-testid="compact-mini-player"
      className="compact-mini-player group/compact relative flex h-[50px] min-h-[50px] w-full items-center justify-between overflow-visible px-2.5 select-none [-webkit-app-region:drag]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Left: Artwork Thumbnail ── */}
      <div
        ref={artworkRef}
        className="compact-artwork relative h-8 w-8 shrink-0 overflow-hidden rounded shadow-xs [-webkit-app-region:no-drag]"
      >
        <Img
          src={currentSongData.artworkPath}
          fallbackSrc={DefaultSongCover}
          loading="eager"
          alt="Song Cover"
          className="h-full w-full object-cover"
        />
      </div>

      {/* ── Middle: Flexible Metadata (Truncates cleanly) ── */}
      <div className="compact-meta flex min-w-0 flex-1 flex-col justify-center overflow-hidden px-2.5 text-left [-webkit-app-region:drag]">
        <div
          className="truncate max-w-full text-xs font-medium text-font-color-white leading-tight"
          title={currentSongData.title}
        >
          {currentSongData.title}
        </div>
        <div
          className="truncate max-w-full text-[10px] text-font-color-white/70 leading-tight mt-0.5"
          title={currentSongData.artists?.map((a) => a.name).join(', ')}
        >
          {currentSongData.songId && Array.isArray(currentSongData.artists)
            ? currentSongData.artists?.length > 0
              ? currentSongData.artists.map((artist) => artist.name).join(', ')
              : t('common.unknownArtist')
            : ''}
        </div>
      </div>

      {/* ── Right: Controls Deck (Core + Progressive Optional Slot) ── */}
      <div className="compact-controls-deck flex shrink-0 items-center gap-0.5 [-webkit-app-region:no-drag]">
        {/* Core Invariant Controls: Previous | Play/Pause | Next */}
        <div
          ref={coreControlsRef}
          className="compact-core-controls flex shrink-0 items-center gap-0.5"
        >
          <Button
            className="prev-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
            iconName="skip_previous"
            iconClassName="material-icons-round text-lg! text-font-color-white opacity-80 transition-opacity hover:opacity-100 dark:text-font-color-white"
            clickHandler={() => handleSkipBackwardClick()}
            tooltipLabel={t('player.prevSong')}
            removeFocusOnClick
          />
          <Button
            className="play-pause-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
            iconName={isCurrentSongPlaying ? 'pause' : 'play_arrow'}
            iconClassName="material-icons-round text-xl! text-font-color-white opacity-95 transition-opacity hover:opacity-100 dark:text-font-color-white"
            clickHandler={() => toggleSongPlayback()}
            tooltipLabel={t('player.playPause')}
            removeFocusOnClick
          />
          <Button
            className="next-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
            iconName="skip_next"
            iconClassName="material-icons-round text-lg! text-font-color-white opacity-80 transition-opacity hover:opacity-100 dark:text-font-color-white"
            clickHandler={() => handleSkipForwardClick('USER_SKIP')}
            tooltipLabel={t('player.nextSong')}
            removeFocusOnClick
          />
        </div>

        {/* Progressive Optional Controls Deck (Unlocked by width budget) */}
        {visibleOptionalControls.includes('love') && (
          <Button
            className={`favorite-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
              isAFavorite && 'after:opacity-100'
            }`}
            iconClassName={`text-lg! ${
              isAFavorite
                ? 'material-icons-round text-dark-background-color-3!'
                : 'material-icons-round-outlined'
            }`}
            isDisabled={!currentSongData.isKnownSource}
            tooltipLabel={
              currentSongData.isKnownSource
                ? t('player.likeDislike')
                : t('player.likeDislikeDisabled')
            }
            clickHandler={() => currentSongData.isKnownSource && toggleIsFavorite(!isAFavorite)}
            iconName="favorite"
            removeFocusOnClick
          />
        )}

        {visibleOptionalControls.includes('volume') && (
          <div
            className="compact-volume-container relative flex shrink-0 items-center justify-center"
            onMouseEnter={() => setIsVolumeHovered(true)}
            onMouseLeave={() => setIsVolumeHovered(false)}
            onFocus={() => setIsVolumeHovered(true)}
            onBlur={() => setIsVolumeHovered(false)}
          >
            <Button
              className={`volume-btn after:bg-font-color-highlight dark:after:bg-dark-font-color-highlight m-0! rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
                isMuted && 'after:opacity-100'
              }`}
              tooltipLabel={t('player.muteUnmute')}
              iconName={isMuted ? 'volume_off' : 'volume_up'}
              iconClassName={`material-icons-round text-lg! text-font-color-white opacity-80 transition-opacity hover:opacity-100 dark:text-font-color-white ${
                isMuted &&
                'text-font-color-highlight! opacity-100! dark:text-dark-font-color-highlight!'
              }`}
              clickHandler={() => toggleMutedState(!isMuted)}
              removeFocusOnClick
            />

            {/* Vertical Volume Popout Card */}
            <div
              className={`volume-flyout-card absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-40 flex flex-col items-center justify-center rounded-xl bg-[rgba(24,24,28,0.95)] px-2 py-3 shadow-2xl backdrop-blur-md border border-white/10 transition-all duration-200 ease-out ${
                isVolumeHovered
                  ? 'opacity-100 translate-y-0 pointer-events-auto visible scale-100'
                  : 'opacity-0 translate-y-2 pointer-events-none invisible scale-95'
              }`}
            >
              <span className="text-[10px] font-semibold text-font-color-white/70 mb-2 select-none">
                {isMuted ? '0%' : `${Math.round(volume)}%`}
              </span>
              <div className="flex h-24 w-6 items-center justify-center overflow-hidden">
                <VolumeSlider
                  name="mini-player-volume-slider"
                  id="compactVolumeSlider"
                  className="w-24 -rotate-90 origin-center before:bg-font-color-white/50 hover:before:bg-font-color-highlight dark:before:bg-font-color-white/50 dark:hover:before:bg-dark-font-color-highlight appearance-none bg-transparent! p-0 outline-hidden focus-visible:outline!"
                />
              </div>
            </div>
          </div>
        )}

        {visibleOptionalControls.includes('queue') && (
          <button
            type="button"
            className={`queue-btn text-font-color-white dark:text-font-color-white m-0! flex h-fit shrink-0 cursor-pointer items-center justify-center rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent! ${
              isQueueVisible ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!' : ''
            }`}
            title={t('player.currentQueue', 'Queue')}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleQueue();
            }}
          >
            <span className="material-icons-round text-lg! opacity-80 transition-opacity hover:opacity-100">
              queue_music
            </span>
          </button>
        )}

        {visibleOptionalControls.includes('lyrics') && (
          <button
            type="button"
            className={`lyrics-btn text-font-color-white dark:text-font-color-white m-0! flex h-fit shrink-0 cursor-pointer items-center justify-center rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent! ${
              isLyricsVisible ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!' : ''
            }`}
            title={t('player.lyrics', 'Lyrics')}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleLyrics();
            }}
          >
            <LyricsIcon className="h-5 w-5 opacity-80 transition-opacity hover:opacity-100" />
          </button>
        )}

        {visibleOptionalControls.includes('shuffle') && (
          <Button
            className={`shuffle-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
              isShuffling && 'after:opacity-100'
            }`}
            tooltipLabel={t('player.shuffle')}
            iconName="shuffle"
            iconClassName={`material-icons-round text-lg! opacity-80 transition-opacity hover:opacity-100 ${
              isShuffling &&
              'text-font-color-highlight! opacity-100! dark:text-dark-font-color-highlight!'
            }`}
            clickHandler={() => toggleQueueShuffle(!isShuffling)}
            removeFocusOnClick
          />
        )}

        {visibleOptionalControls.includes('repeat') && (
          <Button
            className={`repeat-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
              isRepeating !== 'false' && 'after:opacity-100'
            }`}
            tooltipLabel={t('player.repeat')}
            iconName={isRepeating === 'repeat-1' ? 'repeat_one' : 'repeat'}
            iconClassName={`material-icons-round text-lg! opacity-80 transition-opacity hover:opacity-100 ${
              isRepeating !== 'false' &&
              'text-font-color-highlight! opacity-100! dark:text-dark-font-color-highlight!'
            }`}
            clickHandler={() => toggleRepeat()}
            removeFocusOnClick
          />
        )}
      </div>

      {/* ── Hover Window Controls (Overlay - non-layout participating) ── */}
      <div className="compact-window-controls absolute top-1 right-1 z-30 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/compact:opacity-100 group-focus-within/compact:opacity-100 [-webkit-app-region:no-drag]">
        <button
          type="button"
          className="m-0! flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm bg-black/40 text-font-color-white/80 transition-colors hover:bg-black/80 hover:text-white"
          onClick={() => window.api.windowControls.minimizeApp()}
          title={t('titleBar.minimize')}
        >
          <MinimizeIcon className="h-2 w-2" />
        </button>
        <button
          type="button"
          className="m-0! flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm bg-black/40 text-font-color-white/80 transition-colors hover:bg-[#e81123] hover:text-white"
          onClick={() => window.api.windowControls.closeApp()}
          title={t('titleBar.close')}
        >
          <CloseIcon className="h-2 w-2" />
        </button>
      </div>

      {/* ── Integrated Micro Seekbar (2px bottom overlay - zero vertical height contribution) ── */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] z-10 pointer-events-auto [-webkit-app-region:no-drag]">
        <SeekBarSlider
          name="compact-mini-player-seek-slider"
          id="compactMiniPlayerSeekSlider"
          className="seek-slider m-0 h-[2px] w-full appearance-none bg-background-color-3/30 p-0 outline-hidden before:absolute before:top-0 before:left-0 before:h-[2px] before:w-(--seek-before-width) before:bg-font-color-highlight before:content-['']"
        />
      </div>
    </div>
  );
};

export default CompactMiniPlayer;
