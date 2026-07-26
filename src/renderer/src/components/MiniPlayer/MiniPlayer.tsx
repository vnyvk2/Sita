import { queryClient } from '@renderer/index';
import { settingsMutation, settingsQuery } from '@renderer/queries/settings';
import { store } from '@renderer/store/store';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import CustomLyricsIcon from '../../assets/images/svg/custom-lyrics-icon.png';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';
import Img from '../Img';
import SeekBarSlider from '../SeekBarSlider';
import UpNextSongPopup from '../SongsControlsContainer/UpNextSongPopup';
import VolumeSlider from '../VolumeSlider';
import LyricsContainer from './containers/LyricsContainer';
import QueueContainer from './containers/QueueContainer';
import TitleBarContainer from './containers/TitleBarContainer';

type MiniPlayerProps = {
  className?: string;
};

export default function MiniPlayer(props: MiniPlayerProps) {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isAFavorite = useStore(store, (state) => state.currentSongData.isAFavorite);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const isRepeating = useStore(store, (state) => state.player.isRepeating);
  const isShuffling = useStore(store, (state) => state.player.isShuffling);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const queue = useStore(store, (state) => state.localStorage.queue);

  const { data: settings } = useSuspenseQuery({
    ...settingsQuery.all,
    select: (data) => ({
      miniPlayerPinnedControls: data.miniPlayerPinnedControls,
      isMiniPlayerAlwaysOnTop: data.isMiniPlayerAlwaysOnTop
    })
  });
  const pinnedControls = settings?.miniPlayerPinnedControls || ['love', 'lyrics', 'volume'];

  const { mutate: toggleAlwaysOnTop } = useMutation({
    mutationKey: settingsMutation.toggleMiniPlayerAlwaysOnTop.mutationKey,
    mutationFn: async (state: boolean) => {
      await window.api.miniPlayer.toggleMiniPlayerAlwaysOnTop(state);
    },
    onMutate: async (state) => {
      await queryClient.cancelQueries({ queryKey: settingsQuery.all.queryKey });

      const prevSettings = queryClient.getQueryData(settingsQuery.all.queryKey);

      const newSettings = {
        ...prevSettings!,
        isMiniPlayerAlwaysOnTop: state
      };
      queryClient.setQueryData(settingsQuery.all.queryKey, newSettings);

      return { prevSettings, newSettings };
    },
    onError: (_, __, onMutateResult) =>
      queryClient.setQueryData(settingsQuery.all.queryKey, onMutateResult?.prevSettings),
    onSettled: () => queryClient.invalidateQueries(settingsQuery.all)
  });

  const {
    toggleSongPlayback,
    updatePlayerType,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    toggleIsFavorite,
    toggleMutedState,
    updateContextMenuData,
    toggleRepeat,
    toggleQueueShuffle
  } = useContext(AppUpdateContext);

  const { className } = props;
  const { t } = useTranslation();

  const [isNextSongPopupVisible, setIsNextSongPopupVisible] = useState(false);
  const [isLyricsVisible, setIsLyricsVisible] = useState(false);
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [queueDirection, setQueueDirection] = useState<'down' | 'up'>('down');

  const manageKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === 'l') setIsLyricsVisible((prevState) => !prevState);
        if (e.key === 'n') updatePlayerType('normal');
      }
    },
    [updatePlayerType]
  );

  useEffect(() => {
    window.addEventListener('keydown', manageKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', manageKeyboardShortcuts);
    };
  }, [manageKeyboardShortcuts]);

  const queueLength = queue.queues[queue.currentQueueIndex]?.songIds?.length ?? 0;

  useEffect(() => {
    window.api.miniPlayer.toggleMiniPlayerQueue(isQueueVisible, queueLength);
    if (!isQueueVisible) setQueueDirection('down');
  }, [isQueueVisible, queueLength]);

  // Listen for queue direction changes from main process
  useEffect(() => {
    const handleDirectionChange = (_: unknown, direction: 'up' | 'down') => {
      setQueueDirection(direction);
    };
    window.api.miniPlayer.onQueueDirectionChange(handleDirectionChange);
    return () => {
      window.api.miniPlayer.removeQueueDirectionChangeListener(handleDirectionChange);
    };
  }, []);

  const handleSkipForwardClickWithParams = () => {
    console.log('[MiniPlayer] Skip Forward clicked!');
    handleSkipForwardClick('USER_SKIP');
  };

  const handleSkipBackwardClickWithParams = () => {
    console.log('[MiniPlayer] Skip Backward clicked!');
    handleSkipBackwardClick();
  };

  const handleTogglePinnedControl = useCallback(
    (controlId: string) => {
      const newControls = pinnedControls.includes(controlId)
        ? pinnedControls.filter((c) => c !== controlId)
        : [...pinnedControls, controlId];

      window.api.settings.saveUserSettings({ miniPlayerPinnedControls: newControls });
      queryClient.invalidateQueries({ queryKey: settingsQuery.all.queryKey });
    },
    [pinnedControls]
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const template = [
        {
          id: 'toggleQueue',
          label: t('player.currentQueue', 'Queue')
        },
        {
          label: t('player.playbackControls', 'Playback Controls'),
          submenu: [
            { id: 'togglePlay', label: t('player.playPause', 'Stop') },
            { id: 'toggleLove', label: t('player.likeDislike', 'Love') },
            { id: 'toggleShuffle', label: t('player.shuffle', 'Shuffle') },
            { id: 'toggleRepeat', label: t('player.repeat', 'Repeat') },
            { id: 'toggleLyrics', label: t('player.lyrics', 'Show Lyrics') }
          ]
        },
        {
          id: 'search',
          label: t('player.search', 'Search')
        },
        {
          id: 'toggleAlwaysOnTop',
          label: t(
            `miniPlayer.${
              settings?.isMiniPlayerAlwaysOnTop ? 'alwaysOnTopDisabled' : 'alwaysOnTopEnabled'
            }`,
            settings?.isMiniPlayerAlwaysOnTop ? 'Disable Always on Top' : 'Always on Top'
          )
        },
        { type: 'separator' },
        {
          label: t('miniPlayer.panelLayout', 'Panel Layout'),
          submenu: [
            { id: 'pin_love', label: t('player.likeDislike', 'Love'), type: 'checkbox', checked: pinnedControls.includes('love') },
            { id: 'pin_lyrics', label: t('player.lyrics', 'Lyrics'), type: 'checkbox', checked: pinnedControls.includes('lyrics') },
            { id: 'pin_volume', label: t('player.muteUnmute', 'Volume'), type: 'checkbox', checked: pinnedControls.includes('volume') },
            { id: 'pin_queue', label: t('player.currentQueue', 'Queue'), type: 'checkbox', checked: pinnedControls.includes('queue') },
            { id: 'pin_shuffle', label: t('player.shuffle', 'Shuffle'), type: 'checkbox', checked: pinnedControls.includes('shuffle') },
            { id: 'pin_repeat', label: t('player.repeat', 'Repeat'), type: 'checkbox', checked: pinnedControls.includes('repeat') },
            { id: 'pin_stop', label: t('player.playPause', 'Stop'), type: 'checkbox', checked: pinnedControls.includes('stop') }
          ]
        }
      ];

      const clickedId = await window.api.miniPlayer.showContextMenu(template);

      switch (clickedId) {
        case 'toggleQueue':
          setIsQueueVisible((prev) => !prev);
          break;
        case 'togglePlay':
          if (isCurrentSongPlaying) toggleSongPlayback();
          break;
        case 'toggleLove':
          if (currentSongData.isKnownSource) toggleIsFavorite(!isAFavorite);
          break;
        case 'toggleShuffle':
          toggleQueueShuffle();
          break;
        case 'toggleRepeat':
          toggleRepeat();
          break;
        case 'toggleLyrics':
          setIsLyricsVisible((prev) => !prev);
          break;
        case 'search':
          /* TODO: open search */
          break;
        case 'toggleAlwaysOnTop':
          toggleAlwaysOnTop(!settings?.isMiniPlayerAlwaysOnTop);
          break;
        case 'pin_love':
          handleTogglePinnedControl('love');
          break;
        case 'pin_lyrics':
          handleTogglePinnedControl('lyrics');
          break;
        case 'pin_volume':
          handleTogglePinnedControl('volume');
          break;
        case 'pin_queue':
          handleTogglePinnedControl('queue');
          break;
        case 'pin_shuffle':
          handleTogglePinnedControl('shuffle');
          break;
        case 'pin_repeat':
          handleTogglePinnedControl('repeat');
          break;
        case 'pin_stop':
          handleTogglePinnedControl('stop');
          break;
      }
    },
    [
      pinnedControls,
      handleTogglePinnedControl,
      updateContextMenuData,
      t,
      toggleRepeat,
      currentSongData.isKnownSource,
      toggleIsFavorite,
      isAFavorite,
      isCurrentSongPlaying,
      toggleSongPlayback,
      toggleQueueShuffle
    ]
  );

  // Controls and UI chrome are visible when: hovered, focused, or paused
  const showControls = !isCurrentSongPlaying;

  return (
    // ─── Root: 3-tier strict flex-col ─────────────────────────────────────────
    // At rest (playing, not hovered): ONLY album art visible.
    // On hover/focus/paused: title bar, song info, controls, seekbar fade in.
    <div
      className={`mini-player dark group !bg-dark-background-color-1 dark:!bg-dark-background-color-1 relative flex h-full ${isQueueVisible && queueDirection === 'up' ? 'flex-col-reverse' : 'flex-col'} overflow-hidden !transition-none select-none ${
        !isCurrentSongPlaying && 'paused'
      } ${preferences?.isReducedMotion ? 'reduced-motion' : ''} ${className}`}
      onContextMenu={handleContextMenu}
    >
      {/* ── Background Album Art (absolute, behind all tiers) ──────────────── */}
      <div className="background-cover-img-container absolute inset-0 h-full w-full overflow-hidden">
        <Img
          src={currentSongData.artworkPath}
          fallbackSrc={DefaultSongCover}
          loading="eager"
          alt="Song Cover"
          className={`h-full w-full object-cover transition-[filter] delay-100 duration-200 ease-in-out group-focus-within:blur-[2px] group-focus-within:brightness-75 group-hover:blur-[2px] group-hover:brightness-75 group-focus:blur-[4px] group-focus:brightness-75 ${
            isLyricsVisible || isQueueVisible ? 'blur-[1rem]! brightness-[.25]!' : ''
          } ${!isCurrentSongPlaying ? 'blur-[1rem] brightness-75' : 'blur-0 brightness-100'}`}
        />
        {/* Persistent top drag region */}
        <div className="absolute top-0 left-0 h-10 w-full z-0 [-webkit-app-region:drag]"></div>

        {/* Gradient overlay — only visible when NOT showing lyrics, fades in on hover */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            isLyricsVisible
              ? 'opacity-0'
              : showControls || isQueueVisible
                ? 'bg-[linear-gradient(180deg,_rgba(2,_0,_36,_0)_0%,_rgba(33,_34,_38,_0.9)_90%)] opacity-100'
                : 'bg-[linear-gradient(180deg,_rgba(2,_0,_36,_0)_0%,_rgba(33,_34,_38,_0.9)_90%)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
          }`}
        ></div>
      </div>



      {/* ═══ TIER 1 (TOP): Title Bar ═════════════════════════════════════════ */}
      {/* Fades in on hover/focus/paused — same as old behavior.                */}
      <div className="relative z-30 w-full">
        <TitleBarContainer isLyricsVisible={isLyricsVisible} />
      </div>

      {/* ═══ TIER 2 (MIDDLE): Song Info ══════════════════════════════════════ */}
      {/* flex-1 min-h-0 = flexible sponge, can shrink to 0px.                 */}
      {/* Song info fades in on hover/focus/paused.                            */}
      <div
        className={`relative z-10 flex min-h-0 flex-col items-center justify-center overflow-hidden pointer-events-auto ${
          isQueueVisible ? 'flex-none' : 'flex-1'
        }`}
        onContextMenu={handleContextMenu}
      >
        <div
          className={`song-info-container text-font-color-white flex w-full flex-col items-center justify-center px-4 text-center transition-[visibility,opacity] duration-200 pointer-events-none ${
            isLyricsVisible
              ? 'invisible opacity-0'
              : showControls
                ? 'visible opacity-100'
                : 'invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'
          }`}
        >
          <div className="text-font-color-highlight relative flex w-full flex-col items-center justify-center">
            <div
              className="song-title max-w-full overflow-hidden text-xl font-medium text-ellipsis whitespace-nowrap"
              title={currentSongData.title}
            >
              {currentSongData.title}
            </div>
            {!isNextSongPopupVisible && (
              <div
                className="song-artists appear-from-bottom text-font-color-white/80 text-xs"
                title={currentSongData.artists?.map((artist) => artist.name).join(', ')}
              >
                {currentSongData.songId && Array.isArray(currentSongData.artists)
                  ? currentSongData.artists?.length > 0
                    ? currentSongData.artists.map((artist) => artist.name).join(', ')
                    : t('common.unknownArtist')
                  : ''}
              </div>
            )}
            <UpNextSongPopup
              isSemiTransparent
              onPopupAppears={(isVisible) => setIsNextSongPopupVisible(isVisible)}
            />
          </div>
        </div>
      </div>

      {/* ═══ TIER 3 (BOTTOM): SeekBar + Controls ════════════════════════════ */}
      {/* Fades in on hover/focus/paused — hidden at rest like the old design.  */}
      <div
        className={`relative z-30 w-full shrink-0 transition-[visibility,opacity] duration-200 ${
          showControls || isQueueVisible
            ? 'visible opacity-100'
            : 'invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'
        }`}
      >
        {/* ── SeekBar: sits at the very top of the bottom tier ── */}
        <SeekBarSlider
          name="mini-player-seek-slider"
          id="miniPlayerSeekSlider"
          className="seek-slider bg-background-color-3/25 before:bg-background-color-3 float-left m-0 h-fit w-full appearance-none p-0 outline-hidden outline-offset-1 backdrop-blur-xs transition-[width,height] ease-in-out before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,height] before:ease-in-out before:content-[''] group-focus-within:before:h-2 group-hover:before:h-2 focus-visible:outline!"
        />

        {/* ── Controls Row ─────────────────────────────────────── */}
        <div className="controls-row relative z-20 flex w-full items-center justify-center overflow-hidden pb-2 pt-1">
          {/* Optional: Favorite */}
          {pinnedControls.includes('love') && (
            <Button
              className={`favorite-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
                isAFavorite && 'after:opacity-100'
              }`}
              iconClassName={`text-lg! ${
                isAFavorite
                  ? 'meterial-icons-round text-dark-background-color-3!'
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

          {/* Optional: Repeat */}
          {pinnedControls.includes('repeat') && (
            <Button
              className={`repeat-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
                isRepeating !== 'false' && 'after:opacity-100'
              }`}
              tooltipLabel={t('player.repeat')}
              iconName={isRepeating === 'false' || isRepeating === 'repeat' ? 'repeat' : 'repeat_one'}
              iconClassName={`text-lg! ${
                isRepeating !== 'false' ? 'text-dark-background-color-3!' : 'material-icons-round-outlined'
              }`}
              clickHandler={() => toggleRepeat()}
              removeFocusOnClick
            />
          )}

          {/* Fixed: Skip Backward */}
          <Button
            className="skip-backward-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
            tooltipLabel={t('player.prevSong')}
            iconClassName="text-3xl!"
            clickHandler={handleSkipBackwardClickWithParams}
            iconName="skip_previous"
            removeFocusOnClick
          />

          {/* Fixed: Play / Pause */}
          <Button
            className="play-pause-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-0! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
            tooltipLabel={t('player.playPause')}
            iconClassName="text-5xl!"
            clickHandler={() => toggleSongPlayback()}
            iconName={isCurrentSongPlaying ? 'pause_circle' : 'play_circle'}
            removeFocusOnClick
          />

          {/* Fixed: Skip Forward */}
          <Button
            className="skip-forward-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
            tooltipLabel={t('player.nextSong')}
            iconClassName="text-3xl!"
            clickHandler={handleSkipForwardClickWithParams}
            iconName="skip_next"
            removeFocusOnClick
          />

          {/* Optional: Shuffle */}
          {pinnedControls.includes('shuffle') && (
            <Button
              className={`shuffle-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
                isShuffling && 'after:opacity-100'
              }`}
              tooltipLabel={t('player.shuffle')}
              iconName="shuffle"
              iconClassName={`text-lg! ${
                isShuffling ? 'text-dark-background-color-3!' : 'material-icons-round-outlined'
              }`}
              clickHandler={toggleQueueShuffle}
              removeFocusOnClick
            />
          )}

          {/* Optional: Stop */}
          {pinnedControls.includes('stop') && (
            <Button
              className="stop-btn text-font-color-white dark:text-font-color-white mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
              tooltipLabel={t('player.playPause', 'Stop')}
              iconClassName="material-icons-round-outlined text-lg!"
              clickHandler={() => isCurrentSongPlaying && toggleSongPlayback()}
              iconName="stop"
              removeFocusOnClick
            />
          )}

          {/* Optional: Lyrics Toggle */}
          {pinnedControls.includes('lyrics') && (
            <button
              className={`lyrics-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 flex items-center justify-center after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
                isLyricsVisible && 'text-dark-background-color-3! after:opacity-100'
              }`}
              onClick={(e) => {
                e.currentTarget.blur();
                setIsLyricsVisible((prevState) => !prevState);
              }}
              title={t('player.lyrics')}
            >
              <img src={CustomLyricsIcon} className="h-5 w-5 opacity-80 hover:opacity-100 transition-opacity" alt="Lyrics" />
            </button>
          )}

          {/* Optional: Volume button + expanding slider */}
          {pinnedControls.includes('volume') && (
            <div
              className="mini-optional-btn relative flex shrink-0 items-center"
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
                  isMuted && 'text-font-color-highlight! opacity-100! dark:text-dark-font-color-highlight!'
                }`}
                clickHandler={() => toggleMutedState(!isMuted)}
                removeFocusOnClick
              />
              <div
                className={`overflow-hidden transition-[width] duration-200 ease-in-out ${
                  isVolumeHovered ? 'w-20' : 'w-0'
                }`}
              >
                <VolumeSlider
                  name="mini-player-volume-slider"
                  id="volumeSlider"
                  className="before:bg-font-color-white/50 hover:before:bg-font-color-highlight dark:before:bg-font-color-white/50 dark:hover:before:bg-dark-font-color-highlight relative float-left m-0 h-6 w-20 appearance-none bg-transparent! p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--volume-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!"
                />
              </div>
            </div>
          )}

          {/* Optional: Queue Toggle */}
          {pinnedControls.includes('queue') && (
            <Button
              className="queue-btn text-font-color-white dark:text-font-color-white mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
              tooltipLabel={t('player.currentQueue', 'Queue')}
              iconClassName="material-icons-round-outlined text-lg!"
              clickHandler={() => setIsQueueVisible((prev) => !prev)}
              iconName="queue_music"
              removeFocusOnClick
            />
          )}
        </div>
      </div>

      {/* ── Lyrics overlay (absolute, within the entire window when lyrics on) ── */}
      <LyricsContainer isLyricsVisible={isLyricsVisible} />

      {/* ── Queue container (flex, takes up remaining space when expanded) ── */}
      <QueueContainer isQueueVisible={isQueueVisible} />
    </div>
  );
}
