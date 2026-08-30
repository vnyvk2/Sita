// ? BASE IMPORTS
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import './assets/styles/styles.css';
import 'material-symbols/rounded.css';
import { MetadataCenterDialog } from './components/autotag/MetadataCenterDialog';
import ContextMenu from './components/ContextMenu/ContextMenu';
import ErrorBoundary from './components/ErrorBoundary';
import FullScreenPlayer from './components/FullScreenPlayer/FullScreenPlayer';
import MiniPlayer from './components/MiniPlayer/MiniPlayer';
import PromptMenu from './components/PromptMenu/PromptMenu';
// ? CONTEXTS
import { AppUpdateContext, type AppUpdateContextType } from './contexts/AppUpdateContext';
// import { SongPositionContext } from './contexts/SongPositionContext';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { useAppUpdates } from './hooks/useAppUpdates';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useContextMenu } from './hooks/useContextMenu';
import { useDataSync } from './hooks/useDataSync';
import { useDiscordRpc } from './hooks/useDiscordRpc';
import { useDynamicTheme } from './hooks/useDynamicTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useListeningData } from './hooks/useListeningData';
import { useMediaSession } from './hooks/useMediaSession';
import { useMultiSelection } from './hooks/useMultiSelection';
// ? HOOKS
import useNetworkConnectivity from './hooks/useNetworkConnectivity';
import { useNotifications } from './hooks/useNotifications';
import { usePlaybackErrors } from './hooks/usePlaybackErrors';
import { usePlaybackSettings } from './hooks/usePlaybackSettings';
import { usePlayerControl } from './hooks/usePlayerControl';
import { usePlayerNavigation } from './hooks/usePlayerNavigation';
import { usePromptMenu } from './hooks/usePromptMenu';
import { useQueueManagement } from './hooks/useQueueManagement';
import { useUserPreferences } from './hooks/useUserPreferences';
import { useWindowManagement } from './hooks/useWindowManagement';
import { initializeQueuesManager } from './other/queuesManager';

// ? PROMPTS
const SongUnplayableErrorPrompt = lazy(() => import('./components/SongUnplayableErrorPrompt'));

// Dev-only visual feedback tool for AI coding agent (Antigravity)
const DevAgentation = import.meta.env.DEV
  ? lazy(() =>
      import('agentation').then((m) => ({
        default: m.Agentation
      }))
    )
  : null;

// ? SCREENS

// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Outlet } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';

// ? UTILS
import { dispatch, store } from './store/store';

// ? / / / / / / /  PLAYER DEFAULT OPTIONS / / / / / / / / / / / / / /
// player.addEventListener('player/trackchange', (e) => {
//   if ('detail' in e) {
//     console.log(`player track changed to ${(e as DetailAvailableEvent<string>).detail}.`);
//   }
// });
// / / / / / / / /

const updateNetworkStatus = () => {
  if (typeof window !== 'undefined' && window.api?.settingsHelpers?.networkStatusChange) {
    window.api.settingsHelpers.networkStatusChange(navigator.onLine);
  }
};

updateNetworkStatus();
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// console.log('Command line args', window.api.properties.commandLineArgs);

export default function App() {
  useDynamicTheme();

  useEffect(() => {
    initializeQueuesManager();
  }, []);

  // ? INITIALIZE PLAYER (singleton instances via custom hooks)
  const player = useAudioPlayer();
  const audio = player.audio;

  // const [content, dispatch] = useReducer(reducer, DEFAULT_REDUCER_DATA);
  // // Had to use a Ref in parallel with the Reducer to avoid an issue that happens when using content.* not giving the intended data in useCallback functions even though it was added as a dependency of that function.
  // const contentRef = useRef(DEFAULT_REDUCER_DATA);

  const AppRef = useRef(null as HTMLDivElement | null);
  // const storeRef = useRef<AppReducer>(undefined);

  const playerType = useStore(store, (state) => state.playerType);

  const { isOnline } = useNetworkConnectivity();

  // ? INITIALIZE NOTIFICATIONS
  // Notifications hook handles adding/updating notifications and IPC messages from main
  const { addNewNotifications, updateNotifications } = useNotifications();

  // ? INITIALIZE DYNAMIC THEME
  // Dynamic theme hook handles theme generation from song palettes and background images
  // Theme is automatically applied/removed based on preferences and song data
  const { updateBodyBackgroundImage } = useDynamicTheme();

  // ? INITIALIZE MULTI-SELECTION
  // Multi-selection hook handles selecting multiple items for batch operations
  const { updateMultipleSelections, toggleMultipleSelections } = useMultiSelection();

  const toggleLyricsDrawer = useCallback((state?: boolean) => {
    dispatch({ type: 'TOGGLE_LYRICS_DRAWER', data: state });
  }, []);

  // ? INITIALIZE PROMPT MENU
  // Prompt menu hook handles modal dialogs, error messages, and overlay content
  const { changePromptMenuData, updatePromptMenuHistoryIndex } = usePromptMenu();

  // ? INITIALIZE CONTEXT MENU
  // Context menu hook handles right-click menu state and visibility
  // Note: Global click listener is now handled automatically inside the hook
  const { updateContextMenuData } = useContextMenu();

  // ? INITIALIZE USER PREFERENCES
  // User preferences hook loads keyboard shortcuts, equalizer preset, and ignored items from database
  // Gated off in mini player mode: those preference queries are never consumed there
  useUserPreferences({ enabled: playerType !== 'mini' });

  // ? INITIALIZE KEYBOARD SHORTCUTS
  // Keyboard shortcuts hook handles all keyboard shortcuts and their actions
  // Will be initialized after all other dependencies are defined
  // Note: Hook call moved to after all callbacks are defined due to dependencies

  // ? INITIALIZE DATA SYNC
  // Data sync hook handles IPC data update events and query cache invalidation
  useDataSync();

  // ? INITIALIZE PLAYBACK ERRORS
  // Playback errors hook handles error management and retry logic
  const { managePlaybackErrors } = usePlaybackErrors(audio, changePromptMenuData);

  // ? INITIALIZE PLAYBACK SETTINGS
  // Playback settings hook handles repeat, volume, mute, position, favorites, and equalizer
  const {
    toggleRepeat,
    toggleMutedState,
    updateVolume,
    updateSongPosition,
    toggleIsFavorite,
    updateEqualizerOptions
  } = usePlaybackSettings(audio);

  // ? INITIALIZE LISTENING DATA
  // Listening data hook handles recording song playback sessions for analytics
  const { recordListeningData } = useListeningData(audio);

  // ? WIRE UP LISTENING DATA RECORDING TO PLAYER EVENTS
  // Listen for songLoaded events from AudioPlayer to record listening data
  useEffect(() => {
    const handleSongLoaded = (songData: AudioPlayerData) => {
      recordListeningData(songData.songId, songData.duration, false, true);
    };

    player.on('songLoaded', handleSongLoaded);

    return () => {
      player.off('songLoaded', handleSongLoaded);
    };
  }, [player, recordListeningData]);

  // ? INITIALIZE PLAYER CONTROL
  // Player control hook handles play/pause, song loading, and player state management
  const {
    toggleSongPlayback,
    playSong,
    playSongFromUnknownSource,
    updateCurrentSongData,
    clearAudioPlayerData,
    updateCurrentSongPlaybackState,
    refStartPlay
  } = usePlayerControl(
    player, // Pass AudioPlayer instance instead of audio element
    recordListeningData,
    managePlaybackErrors,
    changePromptMenuData,
    addNewNotifications
  );

  // ? INITIALIZE PLAYER NAVIGATION
  // Player navigation hook handles skip forward/backward and queue navigation
  // Songs are auto-loaded by AudioPlayer on queue position changes
  const { changeQueueCurrentSongIndex, handleSkipBackwardClick, handleSkipForwardClick } =
    usePlayerNavigation(player, toggleSongPlayback, recordListeningData);

  // ? INITIALIZE APP UPDATES
  // App updates hook handles checking for updates and showing release notes
  // Gated off in mini player mode: halts remote changelog polling and prevents release-notes
  // prompts from appearing over the passive mini player window
  const { updateAppUpdatesState } = useAppUpdates({
    changePromptMenuData,
    isOnline,
    isEnabled: playerType !== 'mini'
  });

  const fetchSongFromUnknownSource = useCallback(
    (songPath: string) => {
      window.api.unknownSource
        .getSongFromUnknownSource(songPath)
        .then((res) => playSongFromUnknownSource(res, true))
        .catch((err) => {
          console.error(err);
          changePromptMenuData(true, <SongUnplayableErrorPrompt err={err} />);
        });
    },
    [playSongFromUnknownSource, changePromptMenuData]
  );

  // ? INITIALIZE WINDOW MANAGEMENT
  // Window management hook handles blur/focus, fullscreen, drag-and-drop, and title bar updates
  const windowManagement = useWindowManagement(AppRef, {
    changePromptMenuData,
    fetchSongFromUnknownSource
  });

  // ? INITIALIZE QUEUE MANAGEMENT
  // Queue management hook handles queue creation, updates, and shuffle operations
  const {
    createQueue,
    playAllSongs,
    updateQueueData,
    toggleQueueShuffle,
    toggleShuffling,
    changeUpNextSongData
  } = useQueueManagement({
    playSong
  });

  const transitionTokenRef = useRef(0);

  const updatePlayerType = useCallback(async (type: PlayerTypes) => {
    if (store.state.playerType !== type) {
      const currentToken = ++transitionTokenRef.current;

      if (type === 'normal') {
        await window.api.windowControls.changePlayerType(type);
        if (currentToken === transitionTokenRef.current) {
          dispatch({ type: 'UPDATE_PLAYER_TYPE', data: type });
        }
      } else if (type === 'mini') {
        dispatch({ type: 'UPDATE_PLAYER_TYPE', data: type });
        // Allow the mini-player route component to mount before resizing the native window
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (currentToken === transitionTokenRef.current) {
          await window.api.windowControls.changePlayerType(type);
        }
      } else {
        dispatch({ type: 'UPDATE_PLAYER_TYPE', data: type });
        if (currentToken === transitionTokenRef.current) {
          await window.api.windowControls.changePlayerType(type);
        }
      }
    }
  }, []);

  // ? RESTORE PRESENTATION AFTER RENDERER CRASH RECOVERY
  // Main re-asserts the pre-crash playerType after a crash-triggered reload
  // (the renderer store resets to 'normal' on reload). Repeats are harmless:
  // updatePlayerType no-ops when the store already matches.
  useEffect(() => {
    if (!window.api?.messages?.getMessageFromMain) return undefined;
    const handleRestoreMessage = (
      _: unknown,
      messageCode: MessageCodes,
      data: Record<string, unknown>
    ) => {
      if (messageCode === 'RESTORE_PLAYER_TYPE_AFTER_RECOVERY') {
        const type = data?.playerType;
        if (type === 'mini' || type === 'normal' || type === 'full') {
          void updatePlayerType(type);
        }
      }
    };
    window.api.messages.getMessageFromMain(handleRestoreMessage);
    return () => {
      window.api.messages.removeMessageToRendererEventListener?.(handleRestoreMessage);
    };
  }, [updatePlayerType]);

  // ? INITIALIZE MEDIA SESSION
  // Media session hook handles OS-level media controls and browser media notifications
  useMediaSession(audio, {
    toggleSongPlayback,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    updateSongPosition
  });

  // ? INITIALIZE DISCORD RPC
  // Discord RPC hook handles Discord Rich Presence integration
  useDiscordRpc(audio);

  // Set up keyboard shortcuts with all required dependencies
  useKeyboardShortcuts({
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
  });

  // Initialize app lifecycle (startup, localStorage sync, queue initialization, event listeners)
  // Must be called after all dependencies are defined
  // This hook now manages all player event listeners, IPC controls, and lifecycle events
  useAppLifecycle({
    audio: player, // Pass AudioPlayer instance
    toggleShuffling,
    toggleRepeat,
    playSongFromUnknownSource,
    playSong,
    changeUpNextSongData,
    managePlaybackErrors,
    toggleSongPlayback,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    refStartPlay,
    windowManagement
  });

  const appUpdateContextValues = useMemo<AppUpdateContextType>(() => {
    const contextValue: AppUpdateContextType = {
      updateCurrentSongData,
      updateContextMenuData,
      changePromptMenuData,
      changeUpNextSongData,
      updatePromptMenuHistoryIndex,
      playSong,
      addNewNotifications,
      updateNotifications,
      createQueue,
      playAllSongs,
      changeQueueCurrentSongIndex,
      updateCurrentSongPlaybackState,
      updatePlayerType,
      handleSkipBackwardClick,
      handleSkipForwardClick,
      updateSongPosition,
      updateVolume,
      toggleMutedState,
      toggleRepeat,
      toggleShuffling,
      toggleQueueShuffle,
      toggleIsFavorite,
      toggleSongPlayback,
      updateQueueData,
      clearAudioPlayerData,
      updateBodyBackgroundImage,
      updateMultipleSelections,
      toggleMultipleSelections,
      toggleLyricsDrawer,
      updateAppUpdatesState,
      updateEqualizerOptions
    };
    return contextValue;
  }, [
    updateCurrentSongData,
    updateContextMenuData,
    changePromptMenuData,
    changeUpNextSongData,
    updatePromptMenuHistoryIndex,
    playSong,
    addNewNotifications,
    updateNotifications,
    createQueue,
    playAllSongs,
    changeQueueCurrentSongIndex,
    updateCurrentSongPlaybackState,
    updatePlayerType,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    updateSongPosition,
    updateVolume,
    toggleMutedState,
    toggleRepeat,
    toggleShuffling,
    toggleQueueShuffle,
    toggleIsFavorite,
    toggleSongPlayback,
    updateQueueData,
    clearAudioPlayerData,
    updateBodyBackgroundImage,
    updateMultipleSelections,
    toggleMultipleSelections,
    toggleLyricsDrawer,
    updateAppUpdatesState,
    updateEqualizerOptions
  ]);

  const [autoTagState, setAutoTagState] = useState<{
    isOpen: boolean;
    songs: any[];
    albumName?: string;
    artistName?: string;
    workflow?: import('./hooks/useMetadataWorkflow').WorkflowType;
  }>({ isOpen: false, songs: [] });

  const openAutoTagDialog = useCallback(
    (
      songs: any[],
      albumName?: string,
      artistName?: string,
      workflow: import('./hooks/useMetadataWorkflow').WorkflowType = 'album'
    ) => {
      setAutoTagState({ isOpen: true, songs, albumName, artistName, workflow });
    },
    []
  );

  const closeAutoTagDialog = useCallback(() => {
    setAutoTagState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const extendedAppUpdateContextValues = useMemo(
    () => ({
      ...appUpdateContextValues,
      openAutoTagDialog,
      closeAutoTagDialog
    }),
    [appUpdateContextValues, openAutoTagDialog, closeAutoTagDialog]
  );

  return (
    <ErrorBoundary>
      <AppUpdateContext.Provider value={extendedAppUpdateContextValues}>
        <div
          className="main-app bg-background-color-1 dark:bg-dark-background-color-1 relative h-screen! min-h-screen w-full overflow-hidden"
          ref={AppRef}
          onDragEnter={windowManagement.addSongDropPlaceholder}
          onDragLeave={windowManagement.removeSongDropPlaceholder}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={windowManagement.onSongDrop}
        >
          {playerType === 'mini' ? (
            <>
              <MiniPlayer />
              <ContextMenu />
              {/* Playback continues in mini mode, so playback error prompts (e.g. unplayable
                  songs) must remain visible instead of silently queuing until restore. */}
              <PromptMenu />
            </>
          ) : playerType === 'full' ? (
            <>
              <FullScreenPlayer />
              <ContextMenu />
              <PromptMenu />
            </>
          ) : (
            <Outlet />
          )}
          {autoTagState.isOpen && (
            <MetadataCenterDialog
              isOpen={autoTagState.isOpen}
              localSongs={autoTagState.songs}
              initialAlbumName={autoTagState.albumName}
              initialArtistName={autoTagState.artistName}
              initialWorkflow={autoTagState.workflow ?? 'album'}
              onClose={closeAutoTagDialog}
            />
          )}
        </div>
      </AppUpdateContext.Provider>
      {import.meta.env.DEV && DevAgentation && (
        <Suspense fallback={null}>
          <DevAgentation />
        </Suspense>
      )}
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </ErrorBoundary>
  );
}
