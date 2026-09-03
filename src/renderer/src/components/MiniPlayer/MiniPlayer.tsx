import {
  COMPACT_MINI_PLAYER_HEIGHT,
  COMPACT_MINI_PLAYER_MIN_WIDTH
} from '@common/miniPlayerConstants';
import { settingsMutation, settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';
import LyricsIcon from '../Icons/LyricsIcon';
import QueueIcon from '../Icons/QueueIcon';
import Img from '../Img';
import SeekBarSlider from '../SeekBarSlider';
import UpNextSongPopup from '../SongsControlsContainer/UpNextSongPopup';
import VolumeSlider from '../VolumeSlider';
import CompactLyricsPanel from './CompactLyricsPanel';
import CompactMiniPlayer from './CompactMiniPlayer';
import LyricsContainer from './containers/LyricsContainer';
import QueueContainer from './containers/QueueContainer';
import SearchContainer from './containers/SearchContainer';
import TitleBarContainer from './containers/TitleBarContainer';

type MiniPlayerProps = {
  className?: string;
};

export default function MiniPlayer(props: MiniPlayerProps) {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isAFavorite = useStore(store, (state) => state.currentSongData.isAFavorite);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const volume = useStore(store, (state) => state.player.volume.value);
  const isRepeating = useStore(store, (state) => state.player.isRepeating);
  const isShuffling = useStore(store, (state) => state.player.isShuffling);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const queueLength = useStore(
    store,
    (state) =>
      state.localStorage?.queue?.queues?.[state.localStorage?.queue?.currentQueueIndex]?.songIds
        ?.length ?? 0
  );

  const { data: settings } = useSuspenseQuery({
    ...settingsQuery.all,
    select: (data) => ({
      miniPlayerPinnedControls: data.miniPlayerPinnedControls,
      isMiniPlayerAlwaysOnTop: data.isMiniPlayerAlwaysOnTop,
      isMiniPlayerTaskbarHidden: data.isMiniPlayerTaskbarHidden,
      miniPlayerMode: data.miniPlayerMode
    })
  });
  const pinnedControls = useMemo(
    () => settings?.miniPlayerPinnedControls || ['love', 'lyrics', 'volume'],
    [settings?.miniPlayerPinnedControls]
  );
  const miniPlayerMode = settings?.miniPlayerMode || 'standard';

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

  const { mutate: toggleTaskbarHidden } = useMutation({
    mutationKey: settingsMutation.toggleMiniPlayerTaskbarHidden.mutationKey,
    mutationFn: async (state: boolean) => {
      await window.api.miniPlayer.toggleMiniPlayerTaskbarHidden(state);
    },
    onMutate: async (state) => {
      await queryClient.cancelQueries({ queryKey: settingsQuery.all.queryKey });

      const prevSettings = queryClient.getQueryData(settingsQuery.all.queryKey);

      const newSettings = {
        ...prevSettings!,
        isMiniPlayerTaskbarHidden: state
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
    handleSkipBackwardClick,
    handleSkipForwardClick,
    toggleIsFavorite,
    toggleMutedState,
    toggleRepeat,
    toggleShuffling,
    updatePlayerType
  } = useContext(AppUpdateContext);

  const { className } = props;
  const { t } = useTranslation();

  const [isNextSongPopupVisible, setIsNextSongPopupVisible] = useState(false);
  const [isLyricsVisible, setIsLyricsVisible] = useState(false);
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [queueDirection, setQueueDirection] = useState<'down' | 'up'>('down');
  const [searchDirection, setSearchDirection] = useState<'down' | 'up'>('down');

  const volumeHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVolumeMouseEnter = useCallback(() => {
    if (volumeHoverTimeoutRef.current) {
      clearTimeout(volumeHoverTimeoutRef.current);
      volumeHoverTimeoutRef.current = null;
    }
    setIsVolumeHovered(true);
  }, []);

  const handleVolumeMouseLeave = useCallback(() => {
    if (volumeHoverTimeoutRef.current) {
      clearTimeout(volumeHoverTimeoutRef.current);
    }
    volumeHoverTimeoutRef.current = setTimeout(() => {
      setIsVolumeHovered(false);
    }, 180);
  }, []);

  const handleVolumeBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (volumeHoverTimeoutRef.current) {
        clearTimeout(volumeHoverTimeoutRef.current);
      }
      volumeHoverTimeoutRef.current = setTimeout(() => {
        setIsVolumeHovered(false);
      }, 180);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (volumeHoverTimeoutRef.current) {
        clearTimeout(volumeHoverTimeoutRef.current);
      }
    };
  }, []);

  // Mode Transition Boundary (F4): Cleanly reset overlays on any mode change
  const prevModeRef = useRef(miniPlayerMode);
  useEffect(() => {
    if (prevModeRef.current !== miniPlayerMode) {
      prevModeRef.current = miniPlayerMode;
      setIsQueueVisible(false);
      setIsLyricsVisible(false);
      setIsSearchVisible(false);
    }
  }, [miniPlayerMode]);

  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const lastBoundsRef = useRef<{ minWidth: number; minHeight: number } | null>(null);

  const measureAndSyncBounds = useCallback(() => {
    if (miniPlayerMode === 'compact') {
      const calculatedMinWidth = COMPACT_MINI_PLAYER_MIN_WIDTH;
      const calculatedMinHeight = COMPACT_MINI_PLAYER_HEIGHT;

      const prev = lastBoundsRef.current;
      if (
        !prev ||
        Math.abs(prev.minWidth - calculatedMinWidth) >= 1 ||
        Math.abs(prev.minHeight - calculatedMinHeight) >= 1
      ) {
        lastBoundsRef.current = { minWidth: calculatedMinWidth, minHeight: calculatedMinHeight };
        window.api.miniPlayer.setDynamicMinimumBounds({
          minWidth: calculatedMinWidth,
          minHeight: calculatedMinHeight
        });
      }
      return;
    }

    if (!controlsRef.current || !bottomRef.current || !topRef.current) return;

    // 1. Controls deck intrinsic width (rigid playback buttons + pinned actions)
    const controlsWidth = controlsRef.current.getBoundingClientRect().width;

    // 2. Metadata floor: artwork is rigid (32px), title is 100% sacrificial (collapses to 0)
    const hasArtwork = pinnedControls.includes('artwork');
    const hasTitle = pinnedControls.includes('title');
    const artworkWidth = hasArtwork ? 32 : 0;
    const titleFloor = 0; // Completely sacrificial: can collapse to 0 at absolute minimum window width
    const deckGap = hasArtwork ? 8 : 0;
    const deckPadding = hasArtwork || hasTitle ? 24 : 8; // px-3 vs px-1

    const bottomMinWidth = artworkWidth + titleFloor + deckGap + controlsWidth + deckPadding;

    // 3. Top layer intrinsic requirement (pip_exit 24px + minimize 36px + close 36px)
    const topMinWidth = 96;
    const topBaseHeight = topRef.current.offsetHeight || 32;
    // Top compressed target: 60% of base height (~20px) via container queries
    const topCompressedHeight = Math.max(Math.round(topBaseHeight * 0.6), 20);

    // 4. Middle layer intrinsic floor (sacrificial with text ellipsis, floor = 0)
    const middleMinWidth = 0;

    // 5. Total bottom deck height
    const bottomHeight = bottomRef.current.offsetHeight || 52;

    // Final Dynamic Sizing Equations:
    // minWidth = MAX(top, middle, bottom)
    // minHeight = topCompressed + bottom
    const calculatedMinWidth = Math.round(Math.max(topMinWidth, middleMinWidth, bottomMinWidth));
    const calculatedMinHeight = Math.round(topCompressedHeight + bottomHeight);

    // Loop prevention: compare against cached last bounds
    const prev = lastBoundsRef.current;
    if (
      !prev ||
      Math.abs(prev.minWidth - calculatedMinWidth) >= 1 ||
      Math.abs(prev.minHeight - calculatedMinHeight) >= 1
    ) {
      lastBoundsRef.current = { minWidth: calculatedMinWidth, minHeight: calculatedMinHeight };
      window.api.miniPlayer.setDynamicMinimumBounds({
        minWidth: calculatedMinWidth,
        minHeight: calculatedMinHeight
      });
    }
  }, [pinnedControls]);

  useEffect(() => {
    let rafId: number;

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        measureAndSyncBounds();
      });
    };

    scheduleMeasure();

    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });

    if (controlsRef.current) observer.observe(controlsRef.current);
    if (bottomRef.current) observer.observe(bottomRef.current);
    if (topRef.current) observer.observe(topRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [measureAndSyncBounds, miniPlayerMode]);

  const isQueueTransitioningRef = useRef(false);
  const [compactLyricsDirection, setCompactLyricsDirection] = useState<'up' | 'down'>('down');
  const isLyricsTransitioningRef = useRef(false);
  const isSearchTransitioningRef = useRef(false);

  const handleToggleCompactLyrics = useCallback(async () => {
    if (isLyricsTransitioningRef.current) return;
    isLyricsTransitioningRef.current = true;

    try {
      const nextVisible = !isLyricsVisible;
      if (nextVisible) {
        // Mutually exclusive: collapse Queue if currently open
        if (isQueueVisible) {
          await window.api.miniPlayer.toggleMiniPlayerQueue(false, queueLength);
          setIsQueueVisible(false);
          setQueueDirection('down');
        }

        // Mutually exclusive: collapse Search if open
        if (isSearchVisible) {
          await window.api.miniPlayer.toggleMiniPlayerSearch(false);
          setIsSearchVisible(false);
          setSearchDirection('down');
        }

        const result = await window.api.miniPlayer.toggleMiniPlayerLyrics(true);
        if (result?.direction) {
          setCompactLyricsDirection(result.direction);
        }
        setIsLyricsVisible(true);
      } else {
        await window.api.miniPlayer.toggleMiniPlayerLyrics(false);
        setIsLyricsVisible(false);
        setCompactLyricsDirection('down');
      }
    } finally {
      isLyricsTransitioningRef.current = false;
    }
  }, [isLyricsVisible, isQueueVisible, isSearchVisible, queueLength]);

  const handleToggleLyrics = useCallback(() => {
    if (miniPlayerMode === 'compact') {
      handleToggleCompactLyrics();
      return;
    }

    setIsLyricsVisible((prev) => !prev);
  }, [miniPlayerMode, handleToggleCompactLyrics]);

  const handleToggleSearch = useCallback(async () => {
    if (isSearchTransitioningRef.current) return;
    isSearchTransitioningRef.current = true;

    try {
      const nextVisible = !isSearchVisible;
      if (nextVisible) {
        // Mutually exclusive: collapse Queue if currently open
        if (isQueueVisible) {
          await window.api.miniPlayer.toggleMiniPlayerQueue(false, queueLength);
          setIsQueueVisible(false);
          setQueueDirection('down');
        }

        // Mutually exclusive: collapse Lyrics (compact mode uses spatial panel)
        if (miniPlayerMode === 'compact' && isLyricsVisible) {
          await window.api.miniPlayer.toggleMiniPlayerLyrics(false);
          setIsLyricsVisible(false);
          setCompactLyricsDirection('down');
        }

        const result = await window.api.miniPlayer.toggleMiniPlayerSearch(true);
        if (result?.direction) {
          setSearchDirection(result.direction);
        }
        setIsSearchVisible(true);
      } else {
        await window.api.miniPlayer.toggleMiniPlayerSearch(false);
        setIsSearchVisible(false);
        setSearchDirection('down');
      }
    } finally {
      isSearchTransitioningRef.current = false;
    }
  }, [isSearchVisible, isQueueVisible, isLyricsVisible, miniPlayerMode, queueLength]);

  const manageKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'l') {
        handleToggleLyrics();
      }

      if (e.ctrlKey && (e.key === 'f' || e.key === 'k')) {
        e.preventDefault();
        handleToggleSearch();
      }
    },
    [handleToggleLyrics, handleToggleSearch]
  );

  useEffect(() => {
    window.addEventListener('keydown', manageKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', manageKeyboardShortcuts);
    };
  }, [manageKeyboardShortcuts]);

  const handleToggleQueue = useCallback(async () => {
    if (isQueueTransitioningRef.current) return;
    isQueueTransitioningRef.current = true;

    try {
      const nextVisible = !isQueueVisible;
      if (nextVisible) {
        // Mutually exclusive in Compact Mode: collapse Lyrics if open
        if (miniPlayerMode === 'compact' && isLyricsVisible) {
          await window.api.miniPlayer.toggleMiniPlayerLyrics(false);
          setIsLyricsVisible(false);
          setCompactLyricsDirection('down');
        }

        // Mutually exclusive: collapse Search if open
        if (isSearchVisible) {
          await window.api.miniPlayer.toggleMiniPlayerSearch(false);
          setIsSearchVisible(false);
          setSearchDirection('down');
        }

        const result = await window.api.miniPlayer.toggleMiniPlayerQueue(true, queueLength);
        if (result?.direction) {
          setQueueDirection(result.direction);
        }
        setIsQueueVisible(true);
      } else {
        await window.api.miniPlayer.toggleMiniPlayerQueue(false, queueLength);
        setIsQueueVisible(false);
        setQueueDirection('down');
      }
    } finally {
      isQueueTransitioningRef.current = false;
    }
  }, [isQueueVisible, isLyricsVisible, isSearchVisible, miniPlayerMode, queueLength]);

  const handleSkipForwardClickWithParams = () => {
    handleSkipForwardClick('USER_SKIP');
  };

  const handleSkipBackwardClickWithParams = () => {
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
    async (e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const template = [
        {
          id: 'compactMode',
          label:
            miniPlayerMode === 'compact'
              ? t('miniPlayer.switchToStandardMode', 'Switch to Standard Mode')
              : t('miniPlayer.switchToCompactMode', 'Switch to Compact Mode')
        },
        {
          id: 'goToMainPlayer',
          label: t('player.goToMainPlayer', 'Go to Main Player')
        },
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
        {
          id: 'toggleTaskbarHide',
          label: t(
            `miniPlayer.${
              settings?.isMiniPlayerTaskbarHidden ? 'taskbarHiddenDisabled' : 'taskbarHiddenEnabled'
            }`,
            settings?.isMiniPlayerTaskbarHidden ? 'Show on Taskbar' : 'Hide from Taskbar'
          )
        },
        {
          id: 'resetMiniPlayer',
          label: t('miniPlayer.resetToDefault', 'Reset to Default Position')
        },
        { type: 'separator' },
        {
          label: t('miniPlayer.panelLayout', 'Panel Layout'),
          submenu: [
            {
              id: 'pin_artwork',
              label: t('miniPlayer.artwork', 'Artwork'),
              type: 'checkbox',
              checked: pinnedControls.includes('artwork')
            },
            {
              id: 'pin_title',
              label: t('miniPlayer.trackInfo', 'Track Info'),
              type: 'checkbox',
              checked: pinnedControls.includes('title')
            },
            {
              id: 'pin_love',
              label: t('player.likeDislike', 'Love'),
              type: 'checkbox',
              checked: pinnedControls.includes('love')
            },
            {
              id: 'pin_lyrics',
              label: t('player.lyrics', 'Show Lyrics'),
              type: 'checkbox',
              checked: pinnedControls.includes('lyrics')
            },
            {
              id: 'pin_volume',
              label: t('player.volume', 'Volume Control'),
              type: 'checkbox',
              checked: pinnedControls.includes('volume')
            },
            {
              id: 'pin_queue',
              label: t('player.queue', 'Current Queue'),
              type: 'checkbox',
              checked: pinnedControls.includes('queue')
            },
            {
              id: 'pin_search',
              label: t('player.search', 'Search'),
              type: 'checkbox',
              checked: pinnedControls.includes('search')
            },
            {
              id: 'pin_shuffle',
              label: t('player.shuffle', 'Shuffle'),
              type: 'checkbox',
              checked: pinnedControls.includes('shuffle')
            },
            {
              id: 'pin_repeat',
              label: t('player.repeat', 'Repeat'),
              type: 'checkbox',
              checked: pinnedControls.includes('repeat')
            },
            {
              id: 'pin_stop',
              label: t('player.playPause', 'Stop'),
              type: 'checkbox',
              checked: pinnedControls.includes('stop')
            }
          ]
        },
        { type: 'separator' },
        {
          id: 'returnToMainPlayer',
          label: t('miniPlayer.returnToMainPlayer', 'Return to Main Player')
        }
      ];

      const chosenId = await window.api.miniPlayer.showContextMenu(template);
      if (!chosenId) return;

      switch (chosenId) {
        case 'returnToMainPlayer':
          updatePlayerType('normal');
          break;
        case 'compactMode': {
          const nextMode = miniPlayerMode === 'compact' ? 'standard' : 'compact';
          setIsQueueVisible(false);
          setIsLyricsVisible(false);
          setIsSearchVisible(false);
          setSearchDirection('down');
          await window.api.miniPlayer.setMiniPlayerMode(nextMode);
          queryClient.invalidateQueries({ queryKey: settingsQuery.all.queryKey });
          break;
        }
        case 'goToMainPlayer':
          updatePlayerType('normal');
          break;
        case 'toggleQueue':
          handleToggleQueue();
          break;
        case 'togglePlay':
          toggleSongPlayback();
          break;
        case 'toggleLove':
          if (currentSongData.isKnownSource) toggleIsFavorite(!isAFavorite);
          break;
        case 'toggleShuffle':
          toggleShuffling();
          break;
        case 'toggleRepeat':
          toggleRepeat();
          break;
        case 'toggleLyrics':
          handleToggleLyrics();
          break;
        case 'search':
          handleToggleSearch();
          break;
        case 'toggleAlwaysOnTop':
          toggleAlwaysOnTop(!settings?.isMiniPlayerAlwaysOnTop);
          break;
        case 'toggleTaskbarHide':
          toggleTaskbarHidden(!settings?.isMiniPlayerTaskbarHidden);
          break;
        case 'resetMiniPlayer':
          window.api.miniPlayer.resetToDefaultPosition();
          break;
        case 'pin_artwork':
          handleTogglePinnedControl('artwork');
          break;
        case 'pin_title':
          handleTogglePinnedControl('title');
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
        case 'pin_search':
          handleTogglePinnedControl('search');
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
      t,
      toggleRepeat,
      currentSongData.isKnownSource,
      toggleIsFavorite,
      isAFavorite,
      isCurrentSongPlaying,
      toggleSongPlayback,
      toggleShuffling,
      settings?.isMiniPlayerAlwaysOnTop,
      toggleAlwaysOnTop,
      settings?.isMiniPlayerTaskbarHidden,
      toggleTaskbarHidden,
      handleToggleQueue,
      handleToggleLyrics,
      handleToggleSearch,
      miniPlayerMode,
      updatePlayerType
    ]
  );

  // Listen for native system context menu triggers (e.g. right-clicks on draggable regions on Windows)
  useEffect(() => {
    const handleMainMessage = (_: unknown, messageCode: MessageCodes) => {
      if (messageCode === 'SHOW_MINI_PLAYER_CONTEXT_MENU') {
        handleContextMenu();
      }
    };
    if (window.api?.messages?.getMessageFromMain) {
      window.api.messages.getMessageFromMain(handleMainMessage);
      return () => {
        window.api.messages.removeMessageToRendererEventListener?.(handleMainMessage);
      };
    }
    return undefined;
  }, [handleContextMenu]);

  // Controls and UI chrome are visible when: hovered, focused, or paused
  const showControls = !isCurrentSongPlaying;

  return (
    // ─── Root: 3-tier strict flex-col ─────────────────────────────────────────
    // At rest (playing, not hovered): ONLY album art visible.
    // On hover/focus/paused: title bar, song info, controls, seekbar fade in.
    <div
      className={`mini-player dark group !bg-dark-background-color-1 dark:!bg-dark-background-color-1 relative flex h-full flex-col overflow-hidden !transition-none select-none ${
        (isQueueVisible && queueDirection === 'up') ||
        (miniPlayerMode === 'compact' && isLyricsVisible && compactLyricsDirection === 'up') ||
        (isSearchVisible && searchDirection === 'up')
          ? 'justify-end'
          : 'justify-start'
      } ${
        !isCurrentSongPlaying && 'paused'
      } ${preferences?.isReducedMotion ? 'reduced-motion' : ''} ${className}`}
      onContextMenu={handleContextMenu}
    >
      {/* ── Background Album Art (absolute, behind all tiers in standard mode) ──────────────── */}
      {miniPlayerMode !== 'compact' && (
        <div className="background-cover-img-container absolute inset-0 h-full w-full overflow-hidden">
          <Img
            thumbnail
            src={currentSongData.artworkPath}
            fallbackSrc={DefaultSongCover}
            loading="eager"
            alt="Song Cover"
            className={`h-full w-full object-cover transition-[filter] delay-100 duration-200 ease-in-out group-focus-within:blur-[2px] group-focus-within:brightness-75 group-hover:blur-[2px] group-hover:brightness-75 group-focus:blur-[4px] group-focus:brightness-75 ${
              isLyricsVisible || isQueueVisible || isSearchVisible
                ? 'blur-[1rem]! brightness-[.25]!'
                : ''
            } ${!isCurrentSongPlaying ? 'blur-[1rem] brightness-75' : 'blur-0 brightness-100'}`}
          />

          {/* Gradient overlay — only visible when NOT showing lyrics, fades in on hover */}
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              isLyricsVisible
                ? 'opacity-0'
                : showControls || isQueueVisible || isSearchVisible
                  ? 'bg-[linear-gradient(180deg,_rgba(2,_0,_36,_0)_0%,_rgba(33,_34,_38,_0.9)_90%)] opacity-100'
                  : 'bg-[linear-gradient(180deg,_rgba(2,_0,_36,_0)_0%,_rgba(33,_34,_38,_0.9)_90%)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
            }`}
          ></div>
        </div>
      )}

      {/* ── Spatial Queue Container (Placed above deck when expanding upward) ── */}
      {isQueueVisible && queueDirection === 'up' && (
        <QueueContainer isQueueVisible={isQueueVisible} />
      )}

      {/* ── Spatial Search Container (Placed above deck when expanding upward) ── */}
      {isSearchVisible && searchDirection === 'up' && (
        <SearchContainer isSearchVisible={isSearchVisible} onClose={handleToggleSearch} />
      )}

      {/* ── Compact Floating Lyrics Panel (Placed above strip when expanding upward) ── */}
      {miniPlayerMode === 'compact' && isLyricsVisible && compactLyricsDirection === 'up' && (
        <CompactLyricsPanel isLyricsVisible={isLyricsVisible} onClose={handleToggleLyrics} />
      )}

      {/* ── Progressively Revealed Compact Mode Strip OR Standard 3-Tier Deck ── */}
      {miniPlayerMode === 'compact' ? (
        <CompactMiniPlayer
          isQueueVisible={isQueueVisible}
          isLyricsVisible={isLyricsVisible}
          isSearchVisible={isSearchVisible}
          onToggleQueue={handleToggleQueue}
          onToggleLyrics={handleToggleLyrics}
          onToggleSearch={handleToggleSearch}
          pinnedControls={pinnedControls}
        />
      ) : (
        <div
          data-testid="mini-player-deck"
          className={`mini-player-deck relative flex ${
            isQueueVisible ? 'flex-none shrink-0' : 'flex-1'
          } flex-col overflow-hidden`}
        >
          {/* ═══ TIER 1 (TOP): Title Bar ═════════════════════════════════════════ */}
          {/* Fades in on hover/focus/paused — same as old behavior.                */}
          <div ref={topRef} className="relative z-30 w-full">
            <TitleBarContainer isLyricsVisible={isLyricsVisible} />
          </div>

          {/* ═══ TIER 2 (MIDDLE): Song Info ══════════════════════════════════════ */}
          {/* flex-1 min-h-0 = flexible sponge, can shrink to 0px.                 */}
          {/* Song info fades in on hover/focus/paused.                            */}
          <div
            className={`pointer-events-auto relative z-10 flex min-h-0 flex-col items-center justify-center overflow-hidden ${
              isQueueVisible ? 'flex-none' : 'flex-1'
            }`}
            onContextMenu={handleContextMenu}
          >
            <div
              className={`song-info-container text-font-color-white pointer-events-none flex w-full flex-col items-center justify-center px-4 text-center transition-[visibility,opacity] duration-200 ${
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
            ref={bottomRef}
            className={`relative z-30 w-full shrink-0 transition-[visibility,opacity] duration-200 [-webkit-app-region:no-drag] ${
              showControls || isQueueVisible
                ? 'visible opacity-100'
                : 'invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'
            }`}
          >
            {/* ── SeekBar: sits at the very top of the bottom tier ── */}
            <SeekBarSlider
              name="mini-player-seek-slider"
              id="miniPlayerSeekSlider"
              className="seek-slider bg-background-color-3/25 before:bg-background-color-3 float-left m-0 h-fit w-full appearance-none p-0 outline-hidden outline-offset-1 backdrop-blur-xs transition-[height] ease-in-out [-webkit-app-region:no-drag] before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[height] before:ease-in-out before:content-[''] group-focus-within:before:h-2 group-hover:before:h-2 focus-visible:outline!"
            />

            {/* ── Controls Row ─────────────────────────────────────── */}
            <div
              className={`controls-row relative z-20 flex w-full items-center ${
                pinnedControls.includes('artwork') || pinnedControls.includes('title')
                  ? 'justify-between gap-2 px-3'
                  : 'justify-center px-1'
              } pt-1 pb-2`}
            >
              {/* Optional Pinned Metadata: Mini Artwork & Track Info */}
              {(pinnedControls.includes('artwork') || pinnedControls.includes('title')) && (
                <div className="mini-deck-meta flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {pinnedControls.includes('artwork') && (
                    <div className="mini-deck-artwork relative h-8 w-8 shrink-0 overflow-hidden rounded shadow-xs">
                      <Img
                        thumbnail
                        src={currentSongData.artworkPath}
                        fallbackSrc={DefaultSongCover}
                        loading="eager"
                        alt="Song Cover"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  {pinnedControls.includes('title') && (
                    <div className="mini-deck-track-info flex w-0 max-w-full min-w-0 flex-1 flex-col justify-center overflow-hidden text-left">
                      <div
                        className="text-font-color-white max-w-full truncate text-xs leading-tight font-medium"
                        title={currentSongData.title}
                      >
                        {currentSongData.title}
                      </div>
                      <div
                        className="text-font-color-white/70 mt-0.5 max-w-full truncate text-[10px] leading-tight"
                        title={currentSongData.artists?.map((a) => a.name).join(', ')}
                      >
                        {currentSongData.songId && Array.isArray(currentSongData.artists)
                          ? currentSongData.artists?.length > 0
                            ? currentSongData.artists.map((artist) => artist.name).join(', ')
                            : t('common.unknownArtist')
                          : ''}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Controls Deck */}
              <div
                ref={controlsRef}
                className="mini-deck-controls flex shrink-0 items-center justify-center"
              >
                {/* Optional: Favorite */}
                {pinnedControls.includes('love') && (
                  <Button
                    className={`favorite-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
                      isAFavorite && 'after:opacity-100'
                    }`}
                    iconClassName={`text-lg! ${
                      isAFavorite
                        ? 'material-icons-round text-font-color-favorite!'
                        : 'material-icons-round-outlined'
                    }`}
                    isDisabled={!currentSongData.isKnownSource}
                    tooltipLabel={
                      currentSongData.isKnownSource
                        ? t('player.likeDislike')
                        : t('player.likeDislikeDisabled')
                    }
                    clickHandler={() =>
                      currentSongData.isKnownSource && toggleIsFavorite(!isAFavorite)
                    }
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
                    iconName={
                      isRepeating === 'false' || isRepeating === 'repeat' ? 'repeat' : 'repeat_one'
                    }
                    iconClassName={`text-lg! ${
                      isRepeating !== 'false'
                        ? 'text-dark-background-color-3!'
                        : 'material-icons-round-outlined'
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
                      isShuffling
                        ? 'text-dark-background-color-3!'
                        : 'material-icons-round-outlined'
                    }`}
                    clickHandler={() => toggleShuffling()}
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
                    className={`lyrics-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! flex h-fit shrink-0 cursor-pointer items-center justify-center rounded-none! border-0! bg-transparent! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-transparent! ${
                      isLyricsVisible && 'text-dark-background-color-3! after:opacity-100'
                    }`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleToggleLyrics();
                    }}
                    title={t('player.lyrics')}
                  >
                    <LyricsIcon className="h-5 w-5 opacity-80 transition-opacity hover:opacity-100" />
                  </button>
                )}

                {/* Optional: Volume button + vertical flyout slider */}
                {pinnedControls.includes('volume') && (
                  <div
                    className="mini-optional-btn relative flex shrink-0 items-center justify-center"
                    onMouseEnter={handleVolumeMouseEnter}
                    onMouseLeave={handleVolumeMouseLeave}
                    onFocus={handleVolumeMouseEnter}
                    onBlur={handleVolumeBlur}
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

                    {/* Vertical Volume Popout Card (Absolute overlay - zero deck width contribution) */}
                    <div
                      className={`volume-flyout-card absolute bottom-full left-1/2 z-40 mb-2.5 flex -translate-x-1/2 flex-col items-center justify-center rounded-xl border border-white/10 bg-[rgba(24,24,28,0.95)] px-1.5 py-2 shadow-2xl backdrop-blur-md transition-all duration-200 ease-out before:absolute before:inset-x-0 before:top-full before:h-4 before:bg-transparent before:content-[''] ${
                        isVolumeHovered
                          ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100'
                          : 'pointer-events-none invisible translate-y-2 scale-95 opacity-0'
                      }`}
                    >
                      <span className="text-font-color-white/70 mb-1.5 text-[10px] font-semibold select-none">
                        {isMuted ? '0%' : `${Math.round(volume)}%`}
                      </span>
                      <div className="relative flex h-28 w-6 items-center justify-center">
                        <VolumeSlider
                          name="mini-player-volume-slider"
                          id="volumeSlider"
                          sliderOpacity={0.85}
                          className="before:bg-font-color-white/50 hover:before:bg-font-color-highlight dark:before:bg-font-color-white/50 dark:hover:before:bg-dark-font-color-highlight absolute w-28 origin-center -rotate-90 appearance-none bg-transparent! p-0 outline-hidden focus-visible:outline!"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Optional: Queue Toggle */}
                {pinnedControls.includes('queue') && (
                  <button
                    type="button"
                    className="queue-btn text-font-color-white dark:text-font-color-white mini-optional-btn m-0! flex h-fit shrink-0 cursor-pointer items-center justify-center rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent!"
                    title={t('player.currentQueue', 'Queue')}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleToggleQueue();
                    }}
                  >
                    <QueueIcon className="h-5 w-5 opacity-80 transition-opacity hover:opacity-100" />
                  </button>
                )}

                {/* Optional: Search Toggle */}
                {pinnedControls.includes('search') && (
                  <button
                    type="button"
                    className={`search-btn text-font-color-white dark:text-font-color-white mini-optional-btn m-0! flex h-fit shrink-0 cursor-pointer items-center justify-center rounded-none! border-0! bg-transparent! p-1! outline-offset-1 focus-visible:outline! dark:bg-transparent! ${
                      isSearchVisible ? 'text-dark-background-color-3!' : ''
                    }`}
                    title={t('player.search', 'Search')}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleToggleSearch();
                    }}
                  >
                    <span className="material-icons-round text-lg! opacity-80 transition-opacity hover:opacity-100">
                      search
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Spatial Queue Container (Placed below deck when expanding downward) ── */}
      {isQueueVisible && queueDirection === 'down' && (
        <QueueContainer isQueueVisible={isQueueVisible} />
      )}

      {/* ── Spatial Search Container (Placed below deck when expanding downward) ── */}
      {isSearchVisible && searchDirection === 'down' && (
        <SearchContainer isSearchVisible={isSearchVisible} onClose={handleToggleSearch} />
      )}

      {/* ── Compact Floating Lyrics Panel (Placed below strip when expanding downward) ── */}
      {miniPlayerMode === 'compact' && isLyricsVisible && compactLyricsDirection === 'down' && (
        <CompactLyricsPanel isLyricsVisible={isLyricsVisible} onClose={handleToggleLyrics} />
      )}

      {/* ── Standard Mode Lyrics overlay (absolute, within the entire window when lyrics on) ── */}
      {miniPlayerMode !== 'compact' && <LyricsContainer isLyricsVisible={isLyricsVisible} />}
    </div>
  );
}
