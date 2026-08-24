import { type ReactNode } from 'react';

import { normalizedKeys } from './appShortcuts';

export interface AppReducer {
  localStorage: LocalStorage;
  currentSongData: AudioPlayerData;
  upNextSongData?: AudioPlayerData;
  promptMenuNavigationData: PromptMenuNavigationHistoryData;
  promptMenuData: {
    prompt?: ReactNode;
    isVisible: boolean;
    className?: string;
    currentActiveIndex: number;
    noOfPrompts: number;
  };
  notificationPanelData: NotificationPanelData;
  contextMenuData: ContextMenuData;
  navigationHistory: NavigationHistoryData;
  currentlyActivePage: NavigationHistory;
  player: Player;
  bodyBackgroundImage?: string;
  multipleSelectionsData: MultipleSelectionData;
  appUpdatesState: AppUpdatesState;
  isOnBatteryPower: boolean;
  playerType: PlayerTypes;
  isLibraryDiagnosticsPanelOpen: boolean;
  isLyricsDrawerOpen: boolean;
}

export type AppReducerStateActions =
  | { type: 'START_PLAY_STATE_CHANGE'; data: unknown }
  | { type: 'CURRENT_SONG_DATA_CHANGE'; data: AudioPlayerData }
  | { type: 'UP_NEXT_SONG_DATA_CHANGE'; data?: AudioPlayerData }
  | { type: 'CURRENT_SONG_PLAYBACK_STATE'; data: boolean }
  | { type: 'PROMPT_MENU_DATA_CHANGE'; data: PromptMenuNavigationHistoryData }
  | { type: 'ADD_NEW_NOTIFICATIONS'; data: AppNotification[] }
  | { type: 'UPDATE_NOTIFICATIONS'; data: AppNotification[] }
  | { type: 'TOGGLE_LIBRARY_DIAGNOSTICS_PANEL'; data?: boolean }
  | { type: 'TOGGLE_LYRICS_DRAWER'; data?: boolean }
  | { type: 'CONTEXT_MENU_DATA_CHANGE'; data: ContextMenuData }
  | { type: 'CONTEXT_MENU_VISIBILITY_CHANGE'; data: boolean }
  | { type: 'CURRENT_ACTIVE_PAGE_DATA_UPDATE'; data: PageData }
  | { type: 'UPDATE_NAVIGATION_HISTORY'; data: NavigationHistoryData }
  | { type: 'UPDATE_PLAYER_TYPE'; data: PlayerTypes }
  | {
      type: 'UPDATE_VOLUME';
      data: PlayerVolume;
    }
  | { type: 'UPDATE_MUTED_STATE'; data?: boolean }
  | { type: 'UPDATE_SONG_POSITION'; data: number }
  | { type: 'UPDATE_IS_REPEATING_STATE'; data: RepeatTypes }
  | { type: 'TOGGLE_IS_FAVORITE_STATE'; data?: boolean }
  | { type: 'TOGGLE_SHUFFLE_STATE'; data?: boolean }
  | { type: 'UPDATE_VOLUME_VALUE'; data: number }
  | { type: 'UPDATE_QUEUE'; data: QueuesState }
  | { type: 'UPDATE_QUEUE_CURRENT_SONG_INDEX'; data: number }
  | { type: 'TOGGLE_REDUCED_MOTION'; data?: boolean }
  | { type: 'TOGGLE_SONG_INDEXING'; data?: boolean }
  | { type: 'PLAYER_WAITING_STATUS'; data: boolean }
  | { type: 'UPDATE_BODY_BACKGROUND_IMAGE'; data?: string }
  | { type: 'UPDATE_MULTIPLE_SELECTIONS_DATA'; data: MultipleSelectionData }
  | { type: 'CHANGE_APP_UPDATES_DATA'; data: AppUpdatesState }
  | { type: 'UPDATE_LOCAL_STORAGE'; data: LocalStorage }
  | { type: 'UPDATE_BATTERY_POWER_STATE'; data: boolean }
  | { type: 'TOGGLE_SHOW_SONG_REMAINING_DURATION'; data?: boolean }
  | { type: 'UPDATE_LOCAL_STORAGE_PREFERENCES'; data: LocalStorage['preferences'] }
  | {
      type: 'UPDATE_LOCAL_STORAGE_PREFERENCE_ITEM';
      data: { item: string; value: LocalStorage['preferences'] };
    }
  | { type: 'UPDATE_PLAYBACK_RATE'; data: number };

export const reducer = (state: AppReducer, action: AppReducerStateActions): AppReducer => {
  switch (action.type) {
    case 'TOGGLE_REDUCED_MOTION':
      return {
        ...state,
        localStorage: {
          ...state.localStorage,
          preferences: {
            ...state.localStorage.preferences,
            isReducedMotion: action.data ?? state.localStorage.preferences.isReducedMotion
          }
        }
      };
    case 'TOGGLE_SONG_INDEXING':
      return {
        ...state,
        localStorage: {
          ...state.localStorage,
          preferences: {
            ...state.localStorage.preferences,
            isSongIndexingEnabled:
              action.data ?? state.localStorage.preferences.isSongIndexingEnabled
          }
        }
      };
    case 'TOGGLE_SHOW_SONG_REMAINING_DURATION':
      return {
        ...state,
        localStorage: {
          ...state.localStorage,
          preferences: {
            ...state.localStorage.preferences,
            showSongRemainingTime:
              action.data ?? state.localStorage.preferences.showSongRemainingTime
          }
        }
      };
    case 'PROMPT_MENU_DATA_CHANGE': {
      const promptMenuNavigationData = action.data ? action.data : state.promptMenuNavigationData;

      const promptMenuData = {
        isVisible: promptMenuNavigationData?.isVisible,
        prompt: promptMenuNavigationData.prompts?.at(promptMenuNavigationData.currentActiveIndex)
          ?.prompt,
        className: promptMenuNavigationData.prompts?.at(promptMenuNavigationData.currentActiveIndex)
          ?.className,
        noOfPrompts: promptMenuNavigationData.prompts.length,
        currentActiveIndex: promptMenuNavigationData.currentActiveIndex
      };

      return {
        ...state,
        promptMenuNavigationData,
        promptMenuData
      };
    }
    case 'ADD_NEW_NOTIFICATIONS':
      return {
        ...state,
        notificationPanelData: {
          ...state.notificationPanelData,
          notifications: action.data || state.notificationPanelData.notifications
        }
      };
    case 'UPDATE_NOTIFICATIONS':
      return {
        ...state,
        notificationPanelData: {
          ...state.notificationPanelData,
          notifications: action.data || state.notificationPanelData.notifications
        }
      };
    case 'TOGGLE_LIBRARY_DIAGNOSTICS_PANEL':
      return {
        ...state,
        isLibraryDiagnosticsPanelOpen: action.data ?? !state.isLibraryDiagnosticsPanelOpen
      };
    case 'TOGGLE_LYRICS_DRAWER':
      return {
        ...state,
        isLyricsDrawerOpen: action.data ?? !state.isLyricsDrawerOpen
      };
    case 'CONTEXT_MENU_DATA_CHANGE':
      return {
        ...state,
        contextMenuData: action.data || state.contextMenuData
      };
    case 'CONTEXT_MENU_VISIBILITY_CHANGE':
      return {
        ...state,
        contextMenuData: {
          ...state.contextMenuData,
          isVisible: action.data ?? state.contextMenuData.isVisible
        }
      };
    case 'CURRENT_ACTIVE_PAGE_DATA_UPDATE':
      state.navigationHistory.history[state.navigationHistory.pageHistoryIndex].data = action.data;
      return {
        ...state,
        navigationHistory: state.navigationHistory,
        currentlyActivePage:
          state.navigationHistory.history[state.navigationHistory.pageHistoryIndex]
      };
    case 'UPDATE_NAVIGATION_HISTORY': {
      const navigationHistory = { ...action.data };
      return {
        ...state,
        bodyBackgroundImage: undefined,
        navigationHistory,
        currentlyActivePage: navigationHistory.history[navigationHistory.pageHistoryIndex]
      };
    }
    case 'CURRENT_SONG_DATA_CHANGE':
      return {
        ...state,
        currentSongData:
          typeof action.data === 'object'
            ? (action.data as AudioPlayerData)
            : state.currentSongData,
        localStorage: {
          ...state.localStorage,
          playback: {
            ...state.localStorage.playback,
            currentSong: {
              ...state.localStorage.playback.currentSong,
              songId: action.data.songId ?? state.currentSongData.songId,
              stoppedPosition: 0
            }
          }
        }
      };
    case 'UP_NEXT_SONG_DATA_CHANGE':
      return {
        ...state,
        upNextSongData: action.data ?? state.upNextSongData
      };
    case 'CURRENT_SONG_PLAYBACK_STATE': {
      return {
        ...state,
        player: {
          ...state.player,
          isCurrentSongPlaying: action.data ?? !state.player.isCurrentSongPlaying
          // isPlayerStalled: action.data ? false : state.player.isPlayerStalled
        }
      };
    }
    case 'UPDATE_PLAYER_TYPE': {
      const type = action.data ?? state.playerType;

      return {
        ...state,
        bodyBackgroundImage: undefined,
        playerType: type
      };
    }
    case 'UPDATE_SONG_POSITION':
      return {
        ...state,
        player: {
          ...state.player,
          songPosition: action.data ?? state.player.songPosition
        }
      };
    case 'UPDATE_IS_REPEATING_STATE': {
      const isRepeating = action.data ?? state.player.isRepeating;
      return {
        ...state,
        player: {
          ...state.player,
          isRepeating
        },
        localStorage: {
          ...state.localStorage,
          playback: {
            ...state.localStorage.playback,
            isRepeating
          }
        }
      };
    }
    case 'TOGGLE_IS_FAVORITE_STATE':
      return {
        ...state,
        currentSongData: {
          ...state.currentSongData,
          isAFavorite: action.data ?? !state.currentSongData.isAFavorite
        }
      };
    case 'TOGGLE_SHUFFLE_STATE': {
      const isShuffling = action.data ?? !state.player.isShuffling;
      return {
        ...state,
        player: {
          ...state.player,
          isShuffling
        },
        localStorage: {
          ...state.localStorage,
          playback: {
            ...state.localStorage.playback,
            isShuffling
          }
        }
      };
    }
    case 'UPDATE_VOLUME': {
      const volume = action.data ?? state.player.volume;
      return {
        ...state,
        player: {
          ...state.player,
          volume
        },
        localStorage: {
          ...state.localStorage,
          playback: {
            ...state.localStorage.playback,
            volume
          }
        }
      };
    }
    case 'UPDATE_VOLUME_VALUE': {
      const volume = action.data ?? state.player.volume.value;
      return {
        ...state,
        player: {
          ...state.player,
          volume: {
            value: volume,
            isMuted: volume === 0
          }
        }
      };
    }
    case 'UPDATE_MUTED_STATE': {
      const isMuted = action.data ?? state.player.volume.isMuted;
      return {
        ...state,
        player: {
          ...state.player,
          volume: {
            ...state.player.volume,
            isMuted
          }
        },
        localStorage: {
          ...state.localStorage,
          playback: {
            ...state.localStorage.playback,
            volume: {
              ...state.localStorage.playback.volume,
              isMuted
            }
          }
        }
      };
    }
    case 'UPDATE_QUEUE':
      return {
        ...state,
        localStorage: {
          ...state.localStorage,
          queue: action.data ?? state.localStorage.queue
        }
      };
    case 'UPDATE_BODY_BACKGROUND_IMAGE':
      return {
        ...state,
        bodyBackgroundImage: action.data ?? state.bodyBackgroundImage
      };
    case 'UPDATE_MULTIPLE_SELECTIONS_DATA':
      return {
        ...state,
        multipleSelectionsData: action.data ?? state.multipleSelectionsData
      };
    case 'CHANGE_APP_UPDATES_DATA':
      return {
        ...state,
        appUpdatesState: action.data ?? state.appUpdatesState
      };
    case 'PLAYER_WAITING_STATUS':
      return {
        ...state,
        player: {
          ...state.player,
          isPlayerStalled: action.data ?? state.player.isPlayerStalled
        }
      };
    // ####### LOCAL STORAGE ENTRIES #######
    case 'UPDATE_LOCAL_STORAGE':
      return {
        ...state,
        localStorage: typeof action.data === 'object' ? action.data : state.localStorage
      };
    case 'UPDATE_LOCAL_STORAGE_PREFERENCES':
      return {
        ...state,
        localStorage: {
          ...state.localStorage,
          preferences:
            typeof action.data === 'object' ? action.data : state.localStorage.preferences
        }
      };
    // #####################################
    case 'UPDATE_BATTERY_POWER_STATE':
      return {
        ...state,
        isOnBatteryPower: action.data ?? state.isOnBatteryPower
      };
    case 'UPDATE_PLAYBACK_RATE':
      return {
        ...state,
        player: {
          ...state.player,
          playbackRate: action.data ?? state.player.playbackRate
        }
      };
    default:
      return state;
  }
};

export const LOCAL_STORAGE_DEFAULT_TEMPLATE: LocalStorage = {
  preferences: {
    seekbarScrollInterval: 5,
    isSongIndexingEnabled: false,
    disableBackgroundArtworks: true,
    doNotShowBlacklistSongConfirm: false,
    doNotVerifyWhenOpeningLinks: false,
    isReducedMotion: false,
    showArtistArtworkNearSongControls: false,
    showSongRemainingTime: false,
    noUpdateNotificationForNewUpdate: '',
    defaultPageOnStartUp: 'Home',
    enableArtworkFromSongCovers: true,
    shuffleArtworkFromSongCovers: false,
    removeAnimationsOnBatteryPower: false,
    isSimilaritySearchEnabled: true,
    lyricsAutomaticallySaveState: 'NONE',
    showTrackNumberAsSongIndex: true,
    allowToPreventScreenSleeping: true,
    enableImageBasedDynamicThemes: false,
    dynamicThemeMode: 'dynamic-accent',
    dynamicThemeIntensity: 100,
    doNotShowHelpPageOnLyricsEditorStartUp: false,
    autoTranslateLyrics: false,
    autoConvertLyrics: false,
    visibleSideTabs: {
      genres: true,
      folders: true,
      artists: true,
      albums: true,
      insights: true
    },
    themePreset: 'default',
    lyricsBackground: 'default',
    lyricsArtworkBlur: 40,
    lyricsArtworkDarkness: 50,
    lyricsArtworkAnimation: true,
    isSongCardDynamicArtworkBackgroundEnabled: false,
    showEqualizerOnTracklist: true
  },
  playback: {
    currentSong: {
      songId: null,
      stoppedPosition: 0
    },
    isRepeating: 'false',
    isShuffling: false,
    volume: {
      isMuted: false,
      value: 50
    },
    playbackRate: 1.0
  },
  queue: {
    queues: [{ id: 'default-queue', position: 0, songIds: [] }],
    currentQueueIndex: 0
  },
  sortingStates: {
    albumsPage: 'aToZ',
    artistsPage: 'aToZ',
    genresPage: 'aToZ',
    playlistsPage: 'aToZ',
    songsPage: 'aToZ',
    musicFoldersPage: 'aToZ',
    playlistDetailPage: 'addedOrder',
    albumDetailPage: 'trackNoDescending',
    genreDetailPage: 'aToZ',
    artistDetailPage: 'aToZ',
    historyPagePeriod: 'all',
    recentlyAddedPagePeriod: 'today',
    historyPageMostPlayedLimit: 25
  },
  equalizerPreset: {
    thirtyTwoHertzFilter: 0,
    sixtyFourHertzFilter: 0,
    hundredTwentyFiveHertzFilter: 0,
    twoHundredFiftyHertzFilter: 0,
    fiveHundredHertzFilter: 0,
    thousandHertzFilter: 0,
    twoThousandHertzFilter: 0,
    fourThousandHertzFilter: 0,
    eightThousandHertzFilter: 0,
    sixteenThousandHertzFilter: 0
  },
  lyricsEditorSettings: {
    offset: 0,
    editNextAndCurrentStartAndEndTagsAutomatically: true
  },
  keyboardShortcuts: [
    {
      shortcutCategoryTitle: 'appShortcutsPrompt.mediaPlayback',
      shortcuts: [
        {
          label: 'appShortcutsPrompt.playPause',
          keys: [normalizedKeys.spaceKey]
        },
        {
          label: 'appShortcutsPrompt.toggleMute',
          keys: [normalizedKeys.ctrlKey, 'M']
        },
        {
          label: 'appShortcutsPrompt.nextSong',
          keys: [normalizedKeys.ctrlKey, normalizedKeys.rightArrowKey]
        },
        {
          label: 'appShortcutsPrompt.prevSong',
          keys: [normalizedKeys.ctrlKey, normalizedKeys.leftArrowKey]
        },
        {
          label: 'appShortcutsPrompt.tenSecondsForward',
          keys: [normalizedKeys.shiftKey, normalizedKeys.rightArrowKey]
        },
        {
          label: 'appShortcutsPrompt.tenSecondsBackward',
          keys: [normalizedKeys.shiftKey, normalizedKeys.leftArrowKey]
        },
        {
          label: 'appShortcutsPrompt.upVolume',
          keys: [normalizedKeys.ctrlKey, normalizedKeys.upArrowKey]
        },
        {
          label: 'appShortcutsPrompt.downVolume',
          keys: [normalizedKeys.ctrlKey, normalizedKeys.downArrowKey]
        },
        {
          label: 'appShortcutsPrompt.toggleShuffle',
          keys: [normalizedKeys.ctrlKey, 'S']
        },
        {
          label: 'appShortcutsPrompt.toggleRepeat',
          keys: [normalizedKeys.ctrlKey, 'T']
        },
        {
          label: 'appShortcutsPrompt.toggleFavorite',
          keys: [normalizedKeys.ctrlKey, 'H']
        },
        {
          label: 'appShortcutsPrompt.upPlaybackRate',
          keys: [normalizedKeys.ctrlKey, ']']
        },
        {
          label: 'appShortcutsPrompt.downPlaybackRate',
          keys: [normalizedKeys.ctrlKey, '[']
        },
        {
          label: 'appShortcutsPrompt.resetPlaybackRate',
          keys: [normalizedKeys.ctrlKey, '\\']
        },
        {
          label: 'appShortcutsPrompt.openAppShortcutsPrompt',
          keys: [normalizedKeys.ctrlKey, '/']
        }
      ]
    },
    {
      shortcutCategoryTitle: 'appShortcutsPrompt.navigation',
      shortcuts: [
        {
          label: 'appShortcutsPrompt.goHome',
          keys: [normalizedKeys.altKey, normalizedKeys.homeKey]
        },
        {
          label: 'appShortcutsPrompt.goBack',
          keys: [normalizedKeys.altKey, normalizedKeys.leftArrowKey]
        },
        {
          label: 'appShortcutsPrompt.goForward',
          keys: [normalizedKeys.altKey, normalizedKeys.rightArrowKey]
        },
        {
          label: 'appShortcutsPrompt.openMiniPlayer',
          keys: [normalizedKeys.ctrlKey, 'N']
        },
        {
          label: 'appShortcutsPrompt.goToLyrics',
          keys: [normalizedKeys.ctrlKey, 'L']
        },
        {
          label: 'appShortcutsPrompt.goToQueue',
          keys: [normalizedKeys.ctrlKey, 'Q']
        },
        {
          label: 'appShortcutsPrompt.goToSearch',
          keys: [normalizedKeys.ctrlKey, 'F']
        }
      ]
    },
    {
      shortcutCategoryTitle: 'appShortcutsPrompt.selections',
      shortcuts: [
        {
          label: 'appShortcutsPrompt.selectMultipleItems',
          keys: [normalizedKeys.shiftKey, normalizedKeys.mouseClick]
        }
      ]
    },
    {
      shortcutCategoryTitle: 'appShortcutsPrompt.lyrics',
      shortcuts: [
        {
          label: 'appShortcutsPrompt.playNextLyricsLine',
          keys: [normalizedKeys.altKey, normalizedKeys.downArrowKey]
        },
        {
          label: 'appShortcutsPrompt.playPrevLyricsLine',
          keys: [normalizedKeys.altKey, normalizedKeys.upArrowKey]
        }
      ]
    },
    {
      shortcutCategoryTitle: 'appShortcutsPrompt.lyricsEditor',
      shortcuts: [
        {
          label: 'appShortcutsPrompt.selectNextLyricsLine',
          keys: [normalizedKeys.enterKey]
        },
        {
          label: 'appShortcutsPrompt.selectPrevLyricsLine',
          keys: [normalizedKeys.shiftKey, normalizedKeys.enterKey]
        },
        {
          label: 'appShortcutsPrompt.selectCustomLyricsLine',
          keys: [normalizedKeys.doubleClick]
        }
      ]
    },
    {
      shortcutCategoryTitle: 'appShortcutsPrompt.otherShortcuts',
      shortcuts: [
        {
          label: 'appShortcutsPrompt.toggleTheme',
          keys: [normalizedKeys.ctrlKey, 'Y']
        },
        {
          label: 'appShortcutsPrompt.toggleMiniPlayerAlwaysOnTop',
          keys: [normalizedKeys.ctrlKey, 'O']
        },
        {
          label: 'appShortcutsPrompt.reload',
          keys: [normalizedKeys.ctrlKey, 'R']
        },
        {
          label: 'appShortcutsPrompt.openDevtools',
          keys: ['F12']
        },
        {
          label: 'appShortcutsPrompt.resyncLibrary',
          keys: [normalizedKeys.insertKey]
        }
      ]
    }
  ]
} satisfies LocalStorage;

export const USER_DATA_TEMPLATE: UserData = {
  language: 'en',
  autoLaunchApp: false,
  isMiniPlayerAlwaysOnTop: false,
  isMusixmatchLyricsEnabled: false,
  hideWindowOnClose: false,
  traySingleClickTogglesWindow: false,
  openWindowAsHiddenOnSystemStart: false,
  openWindowMaximizedOnStart: false,
  sendSongScrobblingDataToLastFM: false,
  sendSongFavoritesDataToLastFM: false,
  sendNowPlayingSongDataToLastFM: false,
  saveLyricsInLrcFilesForSupportedSongs: false,
  enableDiscordRPC: false,
  saveVerboseLogs: false,
  customLrcFilesSaveLocation: null,
  isDarkMode: false,
  useSystemTheme: true,
  lastFmSessionKey: null,
  lastFmSessionName: null,
  miniPlayerPinnedControls: ['love', 'lyrics', 'volume'],
  miniPlayerMode: 'standard',
  mainWindowX: null,
  mainWindowY: null,
  mainWindowWidth: null,
  mainWindowHeight: null,
  miniPlayerX: null,
  miniPlayerY: null,
  miniPlayerWidth: null,
  miniPlayerHeight: null,
  zoomFactor: 0.8,
  recentSearches: [],
  windowState: 'normal'
};

export const DEFAULT_REDUCER_DATA: AppReducer = {
  playerType: 'normal',
  player: {
    isCurrentSongPlaying: false,
    volume: LOCAL_STORAGE_DEFAULT_TEMPLATE.playback.volume,
    isRepeating: LOCAL_STORAGE_DEFAULT_TEMPLATE.playback.isRepeating,
    isShuffling: LOCAL_STORAGE_DEFAULT_TEMPLATE.playback.isShuffling,
    songPosition: 0,
    isPlayerStalled: false,
    playbackRate: LOCAL_STORAGE_DEFAULT_TEMPLATE.playback.playbackRate
  },
  currentSongData: {} as AudioPlayerData,
  upNextSongData: {} as AudioPlayerData,
  localStorage: LOCAL_STORAGE_DEFAULT_TEMPLATE,
  navigationHistory: {
    pageHistoryIndex: 0,
    history: [
      {
        pageTitle: 'Home',
        data: undefined
      }
    ]
  },
  currentlyActivePage: {
    pageTitle: 'Home',
    data: undefined
  },
  contextMenuData: {
    isVisible: false,
    menuItems: [],
    pageX: 200,
    pageY: 200
  },
  notificationPanelData: {
    notifications: []
    // notificationsMap: new Map()
  },
  promptMenuNavigationData: {
    isVisible: false,
    prompts: [],
    currentActiveIndex: 0
  },
  promptMenuData: {
    isVisible: false,
    prompt: undefined,
    className: undefined,
    currentActiveIndex: 0,
    noOfPrompts: 0
  },
  multipleSelectionsData: { isEnabled: false, multipleSelections: [] },
  appUpdatesState: 'UNKNOWN',
  isOnBatteryPower: false,
  isLibraryDiagnosticsPanelOpen: false,
  isLyricsDrawerOpen: false
};

export default reducer;
