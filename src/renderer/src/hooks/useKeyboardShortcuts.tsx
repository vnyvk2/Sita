import { normalizedKeys } from '@renderer/other/appShortcuts';
import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { dispatch, store } from '@renderer/store/store';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { lazy, useCallback, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import calculateTime from '../utils/calculateTime';
import storage from '../utils/localStorage';
import { useAudioPlayer } from './useAudioPlayer';
import { useOverlayNavigation } from './useOverlayNavigation';

const AppShortcutsPrompt = lazy(() => import('../components/SettingsPage/AppShortcutsPrompt'));

/**
 * Shortcut labels persisted in localStorage are stable i18n KEYS (e.g.
 * 'appShortcutsPrompt.playPause'), never runtime translations. Translate them with i18n.t only at
 * display time.
 *
 * In mini player mode only these playback-centric shortcuts (plus the queue/search entries backed
 * by mini surfaces) may act; navigation and library shortcuts would otherwise mutate router history
 * behind the unmounted main UI.
 */
export const MINI_ALLOWED_SHORTCUT_KEYS = new Set([
  'appShortcutsPrompt.playPause',
  'appShortcutsPrompt.toggleMute',
  'appShortcutsPrompt.nextSong',
  'appShortcutsPrompt.prevSong',
  'appShortcutsPrompt.tenSecondsForward',
  'appShortcutsPrompt.tenSecondsBackward',
  'appShortcutsPrompt.upVolume',
  'appShortcutsPrompt.downVolume',
  'appShortcutsPrompt.toggleShuffle',
  'appShortcutsPrompt.toggleRepeat',
  'appShortcutsPrompt.toggleFavorite',
  'appShortcutsPrompt.upPlaybackRate',
  'appShortcutsPrompt.downPlaybackRate',
  'appShortcutsPrompt.resetPlaybackRate',
  'appShortcutsPrompt.setLoopA',
  'appShortcutsPrompt.setLoopB',
  'appShortcutsPrompt.clearLoop',
  'appShortcutsPrompt.openMiniPlayer',
  'appShortcutsPrompt.openCompactPlayer',
  'appShortcutsPrompt.goToQueue',
  'appShortcutsPrompt.goToSearch'
]);

/** Dependencies required by the keyboard shortcuts hook */
export interface KeyboardShortcutDependencies {
  /** Toggle song playback (play/pause) */
  toggleSongPlayback: () => void;

  /** Toggle muted state */
  toggleMutedState: (isMute?: boolean) => void;

  /** Skip to next song */
  handleSkipForwardClick: () => void;

  /** Skip to previous song */
  handleSkipBackwardClick: () => void;

  /** Update volume */
  updateVolume: (volume: number) => void;

  /** Toggle shuffle mode */
  toggleShuffling: () => void;

  /** Toggle repeat mode */
  toggleRepeat: () => void;

  /** Toggle favorite status of current song */
  toggleIsFavorite: () => void;

  /** Add new notifications */
  addNewNotifications: (notifications: AppNotification[]) => void;

  /** Update player type (mini/normal) and optional mode (standard/compact) */
  updatePlayerType: (type: PlayerTypes, mode?: 'standard' | 'compact') => void;

  /** Toggle multiple selections mode */
  toggleMultipleSelections: (isEnabled?: boolean) => void;

  /** Change prompt menu data (show/hide prompts) */
  changePromptMenuData: (
    isVisible?: boolean,
    prompt?: ReactNode | null,
    className?: string
  ) => void;
}

/**
 * Hook for managing keyboard shortcuts
 *
 * Automatically sets up event listeners for keyboard shortcuts and handles all shortcut actions
 * including playback control, navigation, volume control, and more.
 *
 * This hook does not return any values - it automatically manages keyboard event listeners and
 * cleanup.
 *
 * @example
 *   ```tsx
 *   function App() {
 *     const { toggleSongPlayback, handleSkipForwardClick } = usePlayerControl();
 *     const { updateVolume } = usePlaybackSettings();
 *     // ... other hooks
 *
 *     // Set up keyboard shortcuts
 *     useKeyboardShortcuts({
 *       toggleSongPlayback,
 *       handleSkipForwardClick,
 *       updateVolume
 *       // ... other dependencies
 *     });
 *
 *     return <div>...</div>;
 *   }
 *   ```;
 *
 * @param dependencies - Object containing all required callback functions
 */
export function useKeyboardShortcuts(dependencies: KeyboardShortcutDependencies): void {
  const navigate = useNavigate();
  const router = useRouter();
  const { history } = router;
  const { toggleOverlay } = useOverlayNavigation();
  const { t } = useTranslation();
  const player = useAudioPlayer();

  const {
    toggleSongPlayback,
    toggleMutedState,
    handleSkipForwardClick,
    handleSkipBackwardClick,
    updateVolume,
    toggleShuffling,
    toggleRepeat,
    toggleIsFavorite,
    addNewNotifications,
    updatePlayerType,
    toggleMultipleSelections,
    changePromptMenuData
  } = dependencies;

  const manageKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.repeat ||
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter'))
      ) {
        return;
      }

      // Ignore hardware media keys since they are handled natively by MediaSession
      if (
        ['MediaTrackNext', 'MediaTrackPrevious', 'MediaPlayPause', 'MediaStop'].includes(e.key) &&
        'mediaSession' in navigator
      ) {
        return;
      }

      // Quick Escape key clear for active/armed A-B Loop
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (player.getAbLoopState().phase !== 'idle') {
          e.preventDefault();
          player.clearAbLoop('ESCAPE_KEY');
          addNewNotifications([
            {
              id: 'abLoop',
              iconName: 'repeat',
              content: t('notifications.loopCleared', 'A-B Loop cleared')
            }
          ]);
          return;
        }
      }

      const shortcuts = storage.keyboardShortcuts
        .getKeyboardShortcuts()
        .flatMap((category) => category.shortcuts);

      const formatKey = (key: string) => {
        switch (key) {
          case ' ':
            return normalizedKeys.spaceKey;
          case 'ArrowUp':
            return normalizedKeys.upArrowKey;
          case 'ArrowDown':
            return normalizedKeys.downArrowKey;
          case 'ArrowLeft':
            return normalizedKeys.leftArrowKey;
          case 'ArrowRight':
            return normalizedKeys.rightArrowKey;
          case 'Enter':
            return normalizedKeys.enterKey;
          case 'End':
            return normalizedKeys.endKey;
          case 'Home':
            return normalizedKeys.homeKey;
          case 'Insert':
            return normalizedKeys.insertKey;
          case ']':
            return ']';
          case '[':
            return '[';
          case '\\':
            return '\\';
          default:
            return key.length === 1 ? key.toUpperCase() : key;
        }
      };

      let rawKey = e.key;
      if (e.altKey && e.code?.startsWith('Key')) {
        rawKey = e.code.slice(3);
      }

      const pressedKeys = [
        e.ctrlKey ? 'Ctrl' : null,
        e.shiftKey ? 'Shift' : null,
        e.altKey ? 'Alt' : null,
        formatKey(rawKey)
      ].filter(Boolean);

      const matchedShortcut = shortcuts.find((shortcut) => {
        const storedKeys = shortcut.keys.map(formatKey).sort();
        const comboKeys = pressedKeys.sort();
        return JSON.stringify(storedKeys) === JSON.stringify(comboKeys);
      });

      if (matchedShortcut) {
        e.preventDefault();

        // In mini player mode only playback-centric shortcuts (plus the mini player toggle and
        // the queue/search entries backed by mini surfaces) may act. Navigation and library
        // shortcuts would otherwise mutate router history behind the unmounted main UI.
        if (
          store.state.playerType === 'mini' &&
          !MINI_ALLOWED_SHORTCUT_KEYS.has(matchedShortcut.label)
        ) {
          return;
        }

        let updatedPlaybackRate: number;
        switch (matchedShortcut.label) {
          case 'appShortcutsPrompt.playPause':
            toggleSongPlayback();
            break;
          case 'appShortcutsPrompt.toggleMute':
            toggleMutedState(!store.state.player.volume.isMuted);
            break;
          case 'appShortcutsPrompt.nextSong':
            handleSkipForwardClick();
            break;
          case 'appShortcutsPrompt.prevSong':
            handleSkipBackwardClick();
            break;
          case 'appShortcutsPrompt.tenSecondsForward':
            if (player.currentTime + 10 < player.duration) player.currentTime += 10;
            break;
          case 'appShortcutsPrompt.tenSecondsBackward':
            if (player.currentTime - 10 >= 0) player.currentTime -= 10;
            else player.currentTime = 0;
            break;
          case 'appShortcutsPrompt.upVolume':
            updateVolume(player.volume + 0.05 <= 1 ? player.volume * 100 + 5 : 100);
            break;
          case 'appShortcutsPrompt.downVolume':
            updateVolume(player.volume - 0.05 >= 0 ? player.volume * 100 - 5 : 0);
            break;
          case 'appShortcutsPrompt.toggleShuffle':
            toggleShuffling();
            break;
          case 'appShortcutsPrompt.toggleRepeat':
            toggleRepeat();
            break;
          case 'appShortcutsPrompt.toggleFavorite':
            toggleIsFavorite();
            break;
          case 'appShortcutsPrompt.upPlaybackRate':
            updatedPlaybackRate = store.state.localStorage.playback.playbackRate || 1;
            if (updatedPlaybackRate + 0.05 > 4) updatedPlaybackRate = 4;
            else updatedPlaybackRate += 0.05;
            updatedPlaybackRate = parseFloat(updatedPlaybackRate.toFixed(2));
            storage.setItem('playback', 'playbackRate', updatedPlaybackRate);
            addNewNotifications([
              {
                id: 'playbackRate',
                iconName: 'avg_pace',
                content: t('notifications.playbackRateChanged', { val: updatedPlaybackRate })
              }
            ]);
            break;
          case 'appShortcutsPrompt.downPlaybackRate':
            updatedPlaybackRate = store.state.localStorage.playback.playbackRate || 1;
            if (updatedPlaybackRate - 0.05 < 0.25) updatedPlaybackRate = 0.25;
            else updatedPlaybackRate -= 0.05;
            updatedPlaybackRate = parseFloat(updatedPlaybackRate.toFixed(2));
            storage.setItem('playback', 'playbackRate', updatedPlaybackRate);
            addNewNotifications([
              {
                id: 'playbackRate',
                iconName: 'avg_pace',
                content: t('notifications.playbackRateChanged', { val: updatedPlaybackRate })
              }
            ]);
            break;
          case 'appShortcutsPrompt.resetPlaybackRate':
            storage.setItem('playback', 'playbackRate', 1);
            addNewNotifications([
              {
                id: 'playbackRate',
                iconName: 'avg_pace',
                content: t('notifications.playbackRateReset')
              }
            ]);
            break;
          case 'appShortcutsPrompt.setLoopA': {
            const res = player.setAbLoopPointA();
            if (res.success) {
              const timeObj = calculateTime(player.currentTime);
              addNewNotifications([
                {
                  id: 'abLoop',
                  iconName: 'repeat',
                  content: t('notifications.loopArmed', {
                    val: `${timeObj.minutes}:${timeObj.seconds}`,
                    defaultValue: `Loop Point A set at ${timeObj.minutes}:${timeObj.seconds}`
                  })
                }
              ]);
            }
            break;
          }
          case 'appShortcutsPrompt.setLoopB': {
            const res = player.setAbLoopPointB();
            if (res.success) {
              const state = player.getAbLoopState();
              const timeA = calculateTime(state.pointA ?? 0);
              const timeB = calculateTime(state.pointB ?? 0);
              addNewNotifications([
                {
                  id: 'abLoop',
                  iconName: 'repeat',
                  content: t('notifications.loopActive', {
                    a: `${timeA.minutes}:${timeA.seconds}`,
                    b: `${timeB.minutes}:${timeB.seconds}`,
                    defaultValue: `Looping ${timeA.minutes}:${timeA.seconds} → ${timeB.minutes}:${timeB.seconds}`
                  })
                }
              ]);
            } else if (res.reason) {
              addNewNotifications([
                {
                  id: 'abLoopError',
                  iconName: 'warning',
                  content: res.reason
                }
              ]);
            }
            break;
          }
          case 'appShortcutsPrompt.clearLoop': {
            player.clearAbLoop('SHORTCUT');
            addNewNotifications([
              {
                id: 'abLoop',
                iconName: 'repeat',
                content: t('notifications.loopCleared', 'A-B Loop cleared')
              }
            ]);
            break;
          }
          case 'appShortcutsPrompt.goToSearch':
            // In mini mode the main-player router is unmounted; route to the
            // mini player's own search surface instead.
            if (store.state.playerType === 'mini') {
              void window.api.miniPlayer.toggleMiniPlayerSearch(true);
            } else {
              navigate({ to: '/main-player/search' });
            }
            break;
          case 'appShortcutsPrompt.goToLyrics':
            if (router.state.location.pathname.startsWith('/main-player/lyrics')) {
              history.back();
            } else {
              dispatch({ type: 'TOGGLE_LYRICS_DRAWER' });
            }
            break;
          case 'appShortcutsPrompt.goToQueue':
            // In mini mode the overlay targets the unmounted main UI; expand the
            // mini player's queue surface instead.
            if (store.state.playerType === 'mini') {
              void window.api.miniPlayer.toggleMiniPlayerQueue(true);
            } else {
              toggleOverlay('/main-player/queue');
            }
            break;
          case 'appShortcutsPrompt.goHome':
            navigate({ to: '/main-player/home' });
            break;
          case 'appShortcutsPrompt.goBack':
            history.back();
            break;
          case 'appShortcutsPrompt.goForward':
            history.forward();
            break;
          case 'appShortcutsPrompt.openMiniPlayer':
            if (store.state.playerType === 'mini') {
              const currentMode =
                queryClient.getQueryData<UserSettings>(settingsQuery.all.queryKey)
                  ?.miniPlayerMode || 'standard';
              if (currentMode === 'compact') {
                updatePlayerType('mini', 'standard');
              } else {
                updatePlayerType('normal');
              }
            } else {
              updatePlayerType('mini', 'standard');
            }
            break;
          case 'appShortcutsPrompt.openCompactPlayer':
            if (store.state.playerType === 'mini') {
              const currentMode =
                queryClient.getQueryData<UserSettings>(settingsQuery.all.queryKey)
                  ?.miniPlayerMode || 'standard';
              if (currentMode === 'standard') {
                updatePlayerType('mini', 'compact');
              } else {
                updatePlayerType('normal');
              }
            } else {
              updatePlayerType('mini', 'compact');
            }
            break;
          case 'appShortcutsPrompt.selectMultipleItems':
            toggleMultipleSelections(true);
            break;
          case 'appShortcutsPrompt.selectNextLyricsLine':
            // TODO: Implement logic to select next lyrics line.
            break;
          case 'appShortcutsPrompt.selectPrevLyricsLine':
            // TODO: Implement logic to select previous lyrics line.
            break;
          case 'appShortcutsPrompt.selectCustomLyricsLine':
            // TODO: Implement logic to select custom lyrics line.
            break;
          case 'appShortcutsPrompt.playNextLyricsLine':
            // TODO: Implement logic to jump to next lyrics line.
            break;
          case 'appShortcutsPrompt.playPrevLyricsLine':
            // TODO: Implement logic to jump to previous lyrics line.
            break;
          case 'appShortcutsPrompt.toggleTheme':
            window.api.theme.changeAppTheme();
            break;
          case 'appShortcutsPrompt.toggleMiniPlayerAlwaysOnTop':
            // TODO: Implement logic to jump to to trigger mini player always on top.
            break;
          case 'appShortcutsPrompt.reload':
            window.api.appControls.restartRenderer?.('Shortcut: Ctrl+R');
            break;
          case 'appShortcutsPrompt.openAppShortcutsPrompt':
            changePromptMenuData(true, <AppShortcutsPrompt />);
            break;
          case 'appShortcutsPrompt.openDevtools':
            if (!window.api.properties.isInDevelopment) {
              window.api.settingsHelpers.openDevtools();
            }
            break;
          case 'appShortcutsPrompt.resyncLibrary':
            window.api.audioLibraryControls.resyncSongsLibrary();
            break;
          case 'appShortcutsPrompt.toggleQueuePanel':
            if (store.state.localStorage.preferences?.isExperimentalWorkspaceEnabled) {
              import('@renderer/workspace/store')
                .then(({ workspaceActions }) => {
                  workspaceActions.toggleOrOpenPanel('queue');
                })
                .catch((err) => console.error(err));
            }
            break;
          case 'appShortcutsPrompt.toggleLyricsPanel':
            if (store.state.localStorage.preferences?.isExperimentalWorkspaceEnabled) {
              import('@renderer/workspace/store')
                .then(({ workspaceActions }) => {
                  workspaceActions.toggleOrOpenPanel('lyrics');
                })
                .catch((err) => console.error(err));
            }
            break;
          case 'appShortcutsPrompt.togglePlaylistsPanel':
            if (store.state.localStorage.preferences?.isExperimentalWorkspaceEnabled) {
              import('@renderer/workspace/store')
                .then(({ workspaceActions }) => {
                  workspaceActions.toggleOrOpenPanel('playlists');
                })
                .catch((err) => console.error(err));
            }
            break;
          case 'appShortcutsPrompt.toggleVisualizerPanel':
            if (store.state.localStorage.preferences?.isExperimentalWorkspaceEnabled) {
              import('@renderer/workspace/store')
                .then(({ workspaceActions }) => {
                  workspaceActions.toggleOrOpenPanel('visualizer');
                })
                .catch((err) => console.error(err));
            }
            break;
          case 'appShortcutsPrompt.toggleNowPlayingPanel':
            if (store.state.localStorage.preferences?.isExperimentalWorkspaceEnabled) {
              import('@renderer/workspace/store')
                .then(({ workspaceActions }) => {
                  workspaceActions.toggleOrOpenPanel('now-playing');
                })
                .catch((err) => console.error(err));
            }
            break;
          case 'appShortcutsPrompt.saveWorkspaceLayout':
            if (store.state.localStorage.preferences?.isExperimentalWorkspaceEnabled) {
              import('@renderer/workspace/store')
                .then(({ workspaceActions }) => {
                  workspaceActions.openSaveLayoutModal('save');
                })
                .catch((err) => console.error(err));
            }
            break;
          default:
            console.warn(`Unhandled shortcut action: ${matchedShortcut.label}`);
        }
      }
    },
    [
      toggleSongPlayback,
      toggleMutedState,
      handleSkipForwardClick,
      handleSkipBackwardClick,
      updateVolume,
      toggleShuffling,
      toggleRepeat,
      toggleIsFavorite,
      addNewNotifications,
      t,
      navigate,
      toggleOverlay,
      updatePlayerType,
      toggleMultipleSelections,
      changePromptMenuData,
      player,
      history,
      router
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', manageKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', manageKeyboardShortcuts);
    };
  }, [manageKeyboardShortcuts]);
}
