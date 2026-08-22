import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type {
  PlaylistDto as CollectionDto,
  CollectionHierarchyNodeDto as BreadcrumbDto,
  PlaylistEntryDto
} from '../common/collections/dtos';
import type {
  CreateFolderInput,
  CreatePlaylistInput,
  AddSongsInput,
  RemoveSongsInput,
  ReorderInput as ReorderSongsInput,
  RenameInput,
  MoveCollectionInput,
  DeleteInput,
  DuplicateInput,
  MergePlaylistsInput,
  BulkDeleteInput,
  BulkRestoreInput,
  PinInput,
  UnpinInput,
  CollectionEvent
} from '../common/collections/operationInputs';
import type {
  PlaylistViewMode,
  PlaylistExportOptions,
  PlaylistImportIpcOptions,
  PlaylistImportAnalysis,
  PlaylistBatchExportOptions,
  BatchExportResult
} from '../common/collections/types';
import type { LastFMAlbumInfo } from '../types/last_fm_album_info_api';
import type { LastFMTrackInfoApi } from '../types/last_fm_api';
import type { SimilarTracksOutput } from '../types/last_fm_similar_tracks_api';
import type { MetadataProviderPreferences, MetadataSearchOptions } from '../common/metadata';
import type {
  ArtistDiscographyPayload,
  ArtistOnlineProfilePayload,
  OnlineTrackDetail
} from '../types/artist_discography';

// const { contextBridge, ipcRenderer } = require('electron');

const properties = {
  isInDevelopment: process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true',
  commandLineArgs: process.argv,
  platform: process.platform
};

const windowControls = {
  minimizeApp: (): void => ipcRenderer.send('app/minimize'),
  toggleMaximizeApp: (): void => ipcRenderer.send('app/toggleMaximize'),
  closeApp: (): void => ipcRenderer.send('app/close'),
  hideApp: (): void => ipcRenderer.send('app/hide'),
  showApp: (): void => ipcRenderer.send('app/show'),
  changePlayerType: (type: PlayerTypes): Promise<void> =>
    ipcRenderer.invoke('app/changePlayerType', type),
  onWindowFocus: (callback: (e: unknown) => void) => ipcRenderer.on('app/focused', callback),
  onWindowBlur: (callback: (e: unknown) => void) => ipcRenderer.on('app/blurred', callback)
};

const theme = {
  listenForSystemThemeChanges: (
    callback: (e: unknown, isDarkMode: boolean, usingSystemTheme: boolean) => void
  ) => ipcRenderer.on('app/systemThemeChange', callback),
  changeAppTheme: (appTheme?: AppTheme): void => ipcRenderer.send('app/changeAppTheme', appTheme),
  stoplisteningForSystemThemeChanges: (
    callback: (e: unknown, isDarkMode: boolean, usingSystemTheme: boolean) => void
  ) => ipcRenderer.removeListener('app/systemThemeChange', callback)
};

const playerControls = {
  songPlaybackStateChange: (isPlaying: boolean): void =>
    ipcRenderer.send('app/player/songPlaybackStateChange', isPlaying),
  toggleSongPlayback: (callback: (e: unknown) => void) =>
    ipcRenderer.on('app/player/toggleSongPlaybackState', callback),
  skipForwardToNextSong: (callback: (e: unknown) => void) =>
    ipcRenderer.on('app/player/skipForward', callback),
  skipBackwardToPreviousSong: (callback: (e: unknown) => void) =>
    ipcRenderer.on('app/player/skipBackward', callback),
  sendSongPosition: (position: number): void => ipcRenderer.send('app/getSongPosition', position),
  setDiscordRpcActivity: (activity: DiscordActivity): void =>
    ipcRenderer.send('app/setDiscordRpcActivity', activity),

  toggleLikeSongs: (
    songIds: number[],
    isLikeSong?: boolean
  ): Promise<ToggleLikeSongReturnValue | undefined> =>
    ipcRenderer.invoke('app/toggleLikeSongs', songIds, isLikeSong),

  removeTogglePlaybackStateEvent: (callback: (e: unknown) => void) =>
    ipcRenderer.removeListener('app/player/toggleSongPlaybackState', callback),
  removeSkipBackwardToPreviousSongEvent: (callback: (e: unknown) => void) =>
    ipcRenderer.removeListener('app/player/skipBackward', callback),
  removeSkipForwardToNextSongEvent: (callback: (e: unknown) => void) =>
    ipcRenderer.removeListener('app/player/skipForward', callback)
};

const audioLibraryControls = {
  checkForStartUpSongs: (): Promise<AudioPlayerData | undefined> =>
    ipcRenderer.invoke('app/checkForStartUpSongs'),
  addSongsFromFolderStructures: (
    structures: FolderStructure[],
    sortType?: SongSortTypes
  ): Promise<SongData[]> =>
    ipcRenderer.invoke('app/addSongsFromFolderStructures', structures, sortType),

  getSong: (songId: number, updateListeningRate = true): Promise<AudioPlayerData> =>
    ipcRenderer.invoke('app/getSong', songId, updateListeningRate),
  getAllSongs: (
    sortType?: SongSortTypes,
    filterType?: SongFilterTypes,
    paginatingData?: PaginatingData
  ): Promise<PaginatedResult<AudioInfo, SongSortTypes>> =>
    ipcRenderer.invoke('app/getAllSongs', sortType, filterType, paginatingData),
  getAllSongIds: (sortType?: SongSortTypes, filterType?: SongFilterTypes): Promise<number[]> =>
    ipcRenderer.invoke('app/getAllSongIds', sortType, filterType),
  getLibraryChangeState: (): Promise<{
    isDirty: boolean;
    changedPaths: string[];
    lastChangedAt: number | null;
  }> => ipcRenderer.invoke('library/getChangeState'),
  resetLibraryChangeState: (): Promise<void> => ipcRenderer.invoke('library/resetChangeState'),
  startScan: (options?: { dryRun?: boolean }): Promise<ScanSummary> =>
    ipcRenderer.invoke('library/startScan', options),
  cancelScan: (): Promise<boolean> => ipcRenderer.invoke('library/cancelScan'),
  getScanStatus: (): Promise<ScannerState> => ipcRenderer.invoke('library/getScanStatus'),
  onScanProgress: (callback: (_: unknown, progress: ScannerProgress) => void) =>
    ipcRenderer.on('library/scanProgress', callback),
  removeScanProgressEventListener: (callback: (_: unknown, progress: ScannerProgress) => void) =>
    ipcRenderer.removeListener('library/scanProgress', callback),
  getSongInfo: (
    songIds: number[],
    sortType?: SongSortTypes,
    filterType?: SongFilterTypes,
    limit?: number,
    preserveIdOrder = false
  ): Promise<SongData[] | undefined> =>
    ipcRenderer.invoke('app/getSongInfo', songIds, sortType, filterType, limit, preserveIdOrder),
  getAllHistorySongs: (
    sortType?: SongSortTypes,
    paginatingData?: PaginatingData,
    options?: HistoryQueryOptions
  ): Promise<PaginatedResult<SongData, SongSortTypes>> =>
    ipcRenderer.invoke('app/getAllHistorySongs', sortType, paginatingData, options),
  getAllRecentlyAddedSongs: (
    sortType?: SongSortTypes,
    paginatingData?: PaginatingData,
    options?: { period?: RecentlyAddedPeriod }
  ): Promise<PaginatedResult<SongData, SongSortTypes>> =>
    ipcRenderer.invoke('app/getAllRecentlyAddedSongs', sortType, paginatingData, options),
  getAllFavoriteSongs: (
    sortType?: SongSortTypes,
    paginatingData?: PaginatingData
  ): Promise<PaginatedResult<SongData, SongSortTypes>> =>
    ipcRenderer.invoke('app/getAllFavoriteSongs', sortType, paginatingData),
  getSongListeningData: (songIds: number[]): Promise<SongListeningData[]> =>
    ipcRenderer.invoke('app/getSongListeningData', songIds),
  updateSongListeningData: (
    songId: number,
    dataType: ListeningDataEvents,
    dataUpdateType: number
  ): Promise<void> =>
    ipcRenderer.invoke('app/updateSongListeningData', songId, dataType, dataUpdateType),
  resyncSongsLibrary: (): Promise<true> => ipcRenderer.invoke('app/resyncSongsLibrary'),

  getBlacklistData: (): Promise<Blacklist> => ipcRenderer.invoke('app/getBlacklistData'),
  blacklistSongs: (songIds: number[]): Promise<void> =>
    ipcRenderer.invoke('app/blacklistSongs', songIds),
  restoreBlacklistedSongs: (songIds: number[]): Promise<void> =>
    ipcRenderer.invoke('app/restoreBlacklistedSongs', songIds),
  deleteSongsFromSystem: (
    absoluteFilePaths: string[],
    isPermanentDelete: boolean
  ): PromiseFunctionReturn =>
    ipcRenderer.invoke('app/deleteSongsFromSystem', absoluteFilePaths, isPermanentDelete),
  generatePalettes: (): Promise<void> => ipcRenderer.invoke('app/generatePalettes'),
  clearSongHistory: (): PromiseFunctionReturn => ipcRenderer.invoke('app/clearSongHistory'),
  scrobbleSong: (songId: number, startTimeInSecs: number): Promise<void> =>
    ipcRenderer.invoke('app/scrobbleSong', songId, startTimeInSecs),
  flushScrobbleQueue: (): Promise<void> => ipcRenderer.invoke('app/flushScrobbleQueue'),
  sendNowPlayingSongDataToLastFM: (songId: number): Promise<void> =>
    ipcRenderer.invoke('app/sendNowPlayingSongDataToLastFM', songId),
  getSimilarTracksForASong: (songId: number): Promise<SimilarTracksOutput> =>
    ipcRenderer.invoke('app/getSimilarTracksForASong', songId)
};

const suggestions = {
  getArtistDuplicates: (artistName: string): Promise<Artist[]> =>
    ipcRenderer.invoke('app/getArtistDuplicates', artistName),

  resolveArtistDuplicates: (
    selectedArtistId: number,
    duplicateIds: number[]
  ): Promise<UpdateSongDataResult | undefined> =>
    ipcRenderer.invoke('app/resolveArtistDuplicates', selectedArtistId, duplicateIds),

  resolveSeparateArtists: (
    separateArtistId: number,
    separateArtistNames: string[]
  ): Promise<UpdateSongDataResult | undefined> =>
    ipcRenderer.invoke('app/resolveSeparateArtists', separateArtistId, separateArtistNames),

  resolveFeaturingArtists: (
    songId: number,
    featArtistNames: string[],
    removeFeatInfoInTitle?: boolean
  ): Promise<UpdateSongDataResult | undefined> =>
    ipcRenderer.invoke(
      'app/resolveFeaturingArtists',
      songId,
      featArtistNames,
      removeFeatInfoInTitle
    )
};

// $ APP PLAYER UNKNOWN SONGS FETCHING APIS
const unknownSource = {
  playSongFromUnknownSource: (callback: (_: unknown, audioPlayerData: AudioPlayerData) => void) =>
    ipcRenderer.on('app/playSongFromUnknownSource', callback),
  getSongFromUnknownSource: (songPath: string): Promise<AudioPlayerData> =>
    ipcRenderer.invoke('app/getSongFromUnknownSource', songPath),
  removePlaySongFromUnknownSourceEvent: (
    callback: (_: unknown, audioPlayerData: AudioPlayerData) => void
  ) => ipcRenderer.removeListener('app/playSongFromUnknownSource', callback)
};

// $ QUIT EVENT HANDLING
const quitEvent = {
  beforeQuitEvent: (callback: (e: unknown) => void) =>
    ipcRenderer.on('app/beforeQuitEvent', callback),
  removeBeforeQuitEventListener: (callback: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('app/beforeQuitEvent', callback)
};

// $ SYSTEM BATTERY RELATED EVENTS
const battery = {
  listenForBatteryPowerStateChanges: (callback: (_: unknown, isOnBatteryPower: boolean) => void) =>
    ipcRenderer.on('app/isOnBatteryPower', callback),
  stopListeningForBatteryPowerStateChanges: (
    callback: (_: unknown, isOnBatteryPower: boolean) => void
  ) => ipcRenderer.removeListener('app/isOnBatteryPower', callback)
};

// $ APP FULL-SCREEN EVENTS
const fullscreen = {
  onEnterFullscreen: (callback: (e: unknown) => void) =>
    ipcRenderer.on('app/enteredFullscreen', callback),
  onLeaveFullscreen: (callback: (e: unknown) => void) =>
    ipcRenderer.on('app/leftFullscreen', callback)
};

// $ APP SEARCH
const search = {
  query: (options: SearchCoordinatorOptions): Promise<SearchResult> =>
    ipcRenderer.invoke('app/search/query', options),
  clearSearchHistory: (searchText?: string[]): Promise<boolean> =>
    ipcRenderer.invoke('app/clearSearchHistory', searchText)
};

// $ SONG LYRICS
const lyrics = {
  getSongLyrics: (
    songInfo: LyricsRequestTrackInfo,
    lyricsType?: LyricsTypes,
    lyricsRequestType?: LyricsRequestTypes,
    saveLyricsAutomatically?: AutomaticallySaveLyricsTypes
  ): Promise<SongLyrics | undefined> =>
    ipcRenderer.invoke(
      'app/getSongLyrics',
      songInfo,
      lyricsType,
      lyricsRequestType,
      saveLyricsAutomatically
    ),

  getTranslatedLyrics: (languageCode: LanguageCodes): Promise<SongLyrics | undefined> =>
    ipcRenderer.invoke('app/getTranslatedLyrics', languageCode),

  romanizeLyrics: (): Promise<SongLyrics | undefined> => ipcRenderer.invoke('app/romanizeLyrics'),

  convertLyricsToPinyin: (): Promise<SongLyrics | undefined> =>
    ipcRenderer.invoke('app/convertLyricsToPinyin'),

  convertLyricsToRomaja: (): Promise<SongLyrics | undefined> =>
    ipcRenderer.invoke('app/convertLyricsToRomaja'),

  resetLyrics: (): Promise<SongLyrics> => ipcRenderer.invoke('app/resetLyrics'),

  saveLyricsToSong: (songPath: string, text: SongLyrics): Promise<void> =>
    ipcRenderer.invoke('app/saveLyricsToSong', songPath, text)
};

// $ APP MESSAGES
const messages = {
  getMessageFromMain: (
    callback: (event: unknown, messageCode: MessageCodes, data: Record<string, unknown>) => void
  ) => ipcRenderer.on('app/sendMessageToRendererEvent', callback),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeMessageToRendererEventListener: (callback: (...args: any[]) => void) =>
    ipcRenderer.removeListener('app/sendMessageToRendererEvent', callback)
};

// $ APP DATA UPDATE EVENTS
const dataUpdates = {
  dataUpdateEvent: (callback: (e: unknown, dataEvents: DataUpdateEvent[]) => void) =>
    ipcRenderer.on('app/dataUpdateEvent', callback),
  removeDataUpdateEventListener: (callback: (e: unknown, dataEvents: DataUpdateEvent[]) => void) =>
    ipcRenderer.removeListener('app/dataUpdateEvent', callback),
  removeDataUpdateEventListeners: () => ipcRenderer.removeAllListeners('app/dataUpdateEvent')
};

// $  UPDATE SONG DATA
const songUpdates = {
  updateSongId3Tags: (
    songIdOrPath: string,
    tags: SongTags,
    sendUpdatedData: boolean,
    isKnownSource: boolean
  ): Promise<UpdateSongDataResult> =>
    ipcRenderer.invoke('app/updateSongId3Tags', songIdOrPath, tags, sendUpdatedData, isKnownSource),
  batchUpdateSongTags: (
    updates: Array<{ songId: number; tags: SongTags }>
  ): Promise<BatchUpdateSongTagsResult> =>
    ipcRenderer.invoke('app/batchUpdateSongTags', updates),
  onBatchTagUpdateProgress: (
    callback: (e: unknown, progress: BatchTagUpdateProgressEvent) => void
  ) => ipcRenderer.on('app/batchTagUpdateProgress', callback),
  removeBatchTagUpdateProgressListener: (
    callback: (e: unknown, progress: BatchTagUpdateProgressEvent) => void
  ) => ipcRenderer.removeListener('app/batchTagUpdateProgress', callback),
  reParseSong: (songPath: string): Promise<SavableSongData | undefined> =>
    ipcRenderer.invoke('app/reParseSong', songPath),
  reloadSongFromFile: (songIdOrPath: string | number): Promise<SongTags> =>
    ipcRenderer.invoke('app/reloadSongFromFile', songIdOrPath),
  getSongId3Tags: (songIdOrPath: string, isKnownSource: boolean): Promise<SongTags> =>
    ipcRenderer.invoke('app/getSongId3Tags', songIdOrPath, isKnownSource),
  getImgFileLocation: (): Promise<string> => ipcRenderer.invoke('app/getImgFileLocation'),

  revealSongInFileExplorer: (songId: number): void =>
    ipcRenderer.send('app/revealSongInFileExplorer', songId),
  saveArtworkToSystem: (artworkPath: string, saveName?: string): void =>
    ipcRenderer.send('app/saveArtworkToSystem', artworkPath, saveName),
  isMetadataUpdatesPending: (songPath: string): Promise<boolean> =>
    ipcRenderer.invoke('app/isMetadataUpdatesPending', songPath)
};

// $ FETCH SONG DATA FROM INTERNET
const songDataFromInternet = {
  searchSongMetadataResultsInInternet: (
    songTitle: string,
    songArtists: string[]
  ): Promise<SongMetadataResultFromInternet[]> =>
    ipcRenderer.invoke('app/searchSongMetadataResultsInInternet', songTitle, songArtists),
  fetchSongMetadataFromInternet: (
    songTitle: string,
    songArtists: string[]
  ): Promise<SongMetadataResultFromInternet[]> =>
    ipcRenderer.invoke('app/fetchSongMetadataFromInternet', songTitle, songArtists),
  fetchSongInfoFromNet: (
    songTitle: string,
    songArtists: string[]
  ): Promise<LastFMTrackInfoApi | undefined> =>
    ipcRenderer.invoke('app/fetchSongInfoFromNet', songTitle, songArtists)
};

// $ APP USER DATA
const userData = {
  getUserData: (): Promise<UserData> => ipcRenderer.invoke('app/getUserData'),
  saveUserData: (dataType: UserDataTypes, data: unknown) =>
    ipcRenderer.invoke('app/saveUserData', dataType, data)
};

// $ STORAGE DATA
const storageData = {
  getStorageUsage: (forceRefresh?: boolean): Promise<StorageMetrics> =>
    ipcRenderer.invoke('app/getStorageUsage', forceRefresh),
  getDatabaseMetrics: (): Promise<DatabaseMetrics> => ipcRenderer.invoke('app/getDatabaseMetrics')
};

//  $ USER SETTINGS
const settings = {
  getUserSettings: (): Promise<UserSettings> => ipcRenderer.invoke('app/getUserSettings'),
  saveUserSettings: (settings: Partial<UserSettings>): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', settings),

  updateDiscordRpcState: (enableDiscordRpc: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', {
      enableDiscordRPC: enableDiscordRpc
    }),
  updateSongScrobblingToLastFMState: (enableScrobbling: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', {
      sendSongScrobblingDataToLastFM: enableScrobbling
    }),
  updateSongFavoritesToLastFMState: (enableFavorites: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', {
      sendSongFavoritesDataToLastFM: enableFavorites
    }),
  updateNowPlayingSongDataToLastFMState: (enableNowPlaying: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', {
      sendNowPlayingSongDataToLastFM: enableNowPlaying
    }),
  updateSaveLyricsInLrcFilesForSupportedSongs: (enableSave: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', {
      saveLyricsInLrcFilesForSupportedSongs: enableSave
    }),
  updateCustomLrcFilesSaveLocation: (location: string): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', {
      customLrcFilesSaveLocation: location
    }),
  updateOpenWindowAsHiddenOnSystemStart: (enable: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', {
      openWindowAsHiddenOnSystemStart: enable
    }),
  updateHideWindowOnCloseState: (enable: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', { hideWindowOnClose: enable }),
  updateTraySingleClickBehavior: (enable: boolean): Promise<void> =>
    ipcRenderer.invoke('app/updateTraySingleClickBehavior', enable),
  updateSaveVerboseLogs: (enable: boolean): Promise<void> =>
    ipcRenderer.invoke('app/saveUserSettings', { saveVerboseLogs: enable }),
  updateLibraryScanMode: (mode: LibraryScanMode): Promise<void> =>
    ipcRenderer.invoke('app/updateLibraryScanMode', mode)
};

// $ FOLDER DATA
const folderData = {
  getFolderData: (folderPaths: string[], sortType?: FolderSortTypes): Promise<MusicFolder[]> =>
    ipcRenderer.invoke('app/getFolderData', folderPaths, sortType),
  blacklistFolders: (folderPaths: string[]): Promise<void> =>
    ipcRenderer.invoke('app/blacklistFolders', folderPaths),
  restoreBlacklistedFolders: (folderPaths: string[]): Promise<void> =>
    ipcRenderer.invoke('app/restoreBlacklistedFolders', folderPaths),
  toggleBlacklistedFolders: (folderPaths: string[], isBlacklistFolder?: boolean): Promise<void> =>
    ipcRenderer.invoke('app/toggleBlacklistedFolders', folderPaths, isBlacklistFolder),
  revealFolderInFileExplorer: (folderPath: string): void =>
    ipcRenderer.send('app/revealFolderInFileExplorer', folderPath),
  getFolderStructures: (): Promise<FolderStructure[]> =>
    ipcRenderer.invoke('app/getFolderStructures'),
  removeAMusicFolder: (absolutePath: string): Promise<void> =>
    ipcRenderer.invoke('app/removeAMusicFolder', absolutePath)
};

// $ ARTISTS DATA
const artistsData = {
  getArtistData: (
    artistIdsOrNames?: (string | number)[],
    sortType?: ArtistSortTypes,
    filterType?: ArtistFilterTypes,
    start?: number,
    end?: number,
    limit?: number
  ): Promise<PaginatedResult<Artist, ArtistSortTypes>> => {
    const stringIds = artistIdsOrNames?.map(String);
    return ipcRenderer.invoke(
      'app/getArtistData',
      stringIds,
      sortType,
      filterType,
      start,
      end,
      limit
    );
  },
  toggleLikeArtists: (
    artistIds: number[],
    likeArtist?: boolean
  ): Promise<ToggleLikeSongReturnValue | undefined> =>
    ipcRenderer.invoke('app/toggleLikeArtists', artistIds, likeArtist),
  getArtistArtworks: (artistId: number): Promise<ArtistInfoFromNet | undefined> =>
    ipcRenderer.invoke('app/getArtistArtworks', artistId),
  getArtistDiscography: (
    artistId: number,
    artistName: string
  ): Promise<ArtistDiscographyPayload> =>
    ipcRenderer.invoke('app/getArtistDiscography', artistId, artistName),
  getAlbumOnlineTracks: (
    onlineAlbumId: number,
    artistId: number
  ): Promise<OnlineTrackDetail[]> =>
    ipcRenderer.invoke('app/getAlbumOnlineTracks', onlineAlbumId, artistId),
  getArtistOnlineProfile: (
    artistId: number,
    artistName: string
  ): Promise<ArtistOnlineProfilePayload> =>
    ipcRenderer.invoke('app/getArtistOnlineProfile', artistId, artistName)
};

// $ GENRES DATA
const genresData = {
  getGenresData: (
    genreNamesOrIds?: (string | number)[],
    sortType?: GenreSortTypes,
    start?: number,
    end?: number
  ): Promise<PaginatedResult<Genre, GenreSortTypes>> => {
    const stringIds = genreNamesOrIds?.map(String);
    return ipcRenderer.invoke('app/getGenresData', stringIds, sortType, start, end);
  }
};

// $ ALBUMS DATA
const albumsData = {
  getAlbumData: (
    albumTitlesOrIds?: (string | number)[],
    sortType?: AlbumSortTypes,
    filterType?: AlbumFilterTypes,
    start?: number,
    end?: number
  ): Promise<PaginatedResult<Album, AlbumSortTypes>> => {
    const stringIds = albumTitlesOrIds?.map(String);
    return ipcRenderer.invoke('app/getAlbumData', stringIds, sortType, filterType, start, end);
  },
  toggleLikeAlbums: (
    albumIds: number[],
    likeAlbum?: boolean
  ): Promise<ToggleLikeSongReturnValue | undefined> =>
    ipcRenderer.invoke('app/toggleLikeAlbums', albumIds, likeAlbum),
  getAlbumInfoFromLastFM: (albumId: number): Promise<LastFMAlbumInfo | undefined> =>
    ipcRenderer.invoke('app/getAlbumInfoFromLastFM', albumId)
};

const queue = {
  getQueueInfo: (queueType: QueueTypes, id: string): Promise<QueueInfo | undefined> =>
    ipcRenderer.invoke('app/getQueueInfo', queueType, id)
};

// $ APP LOGS
const log = {
  sendLogs: (
    mes: string | Error,
    data?: Record<string, unknown>,
    logToConsoleType: LogMessageTypes = 'INFO',
    forceWindowRestart = false,
    forceMainRestart = false
  ): Promise<unknown> => {
    return ipcRenderer.invoke(
      'app/getRendererLogs',
      mes,
      data,
      logToConsoleType,
      forceWindowRestart,
      forceMainRestart
    );
  },
  openLogFile: (): void => ipcRenderer.send('app/openLogFile')
};

// $ APP MINI PLAYER CONTROLS
const miniPlayer = {
  toggleMiniPlayerAlwaysOnTop: (isMiniPlayerAlwaysOnTop: boolean): Promise<void> =>
    ipcRenderer.invoke('app/toggleMiniPlayerAlwaysOnTop', isMiniPlayerAlwaysOnTop),
  toggleMiniPlayerQueue: (
    isExpanded: boolean,
    queueItemCount?: number
  ): Promise<{ isExpanded: boolean; direction: 'up' | 'down'; height: number } | undefined> =>
    ipcRenderer.invoke('app/toggleMiniPlayerQueue', isExpanded, queueItemCount),
  toggleMiniPlayerLyrics: (
    isExpanded: boolean
  ): Promise<{ isExpanded: boolean; direction: 'up' | 'down'; height: number } | undefined> =>
    ipcRenderer.invoke('app/toggleMiniPlayerLyrics', isExpanded),
  showContextMenu: (template: any[]): Promise<string | null> =>
    ipcRenderer.invoke('app/showMiniPlayerContextMenu', template),
  setDynamicMinimumBounds: (bounds: { minWidth: number; minHeight: number }): Promise<void> =>
    ipcRenderer.invoke('app/setMiniPlayerMinimumBounds', bounds),
  setMiniPlayerMode: (mode: 'standard' | 'compact'): Promise<{ mode: 'standard' | 'compact' }> =>
    ipcRenderer.invoke('app/setMiniPlayerMode', mode),
  resetToDefaultPosition: (): Promise<void> => ipcRenderer.invoke('app/resetMiniPlayerToDefault')
};

// $ APP SETTINGS HELPER FUNCTIONS
const settingsHelpers = {
  getAppLanguage: (lang: LanguageCodes): void => ipcRenderer.send('app/getAppLanguage', lang),
  openInBrowser: (url: string): void => ipcRenderer.send('app/openInBrowser', url),
  toggleAutoLaunch: (autoLaunchState: boolean): Promise<void> =>
    ipcRenderer.invoke('app/toggleAutoLaunch', autoLaunchState),
  openDevtools: () => ipcRenderer.send('app/openDevTools'),
  networkStatusChange: (isConnected: boolean): void =>
    ipcRenderer.send('app/networkStatusChange', isConnected),
  exportAppData: (localStorageData: string): Promise<void> =>
    ipcRenderer.invoke('app/exportAppData', localStorageData),
  importAppData: (): Promise<void | LocalStorage> => ipcRenderer.invoke('app/importAppData'),
  compareEncryptedData: (): Promise<boolean> => ipcRenderer.invoke('app/compareEncryptedData'),
  loginToLastFmInBrowser: () => ipcRenderer.send('app/loginToLastFmInBrowser'),
  disconnectLastFm: (): Promise<boolean> => ipcRenderer.invoke('app/disconnectLastFm'),
  getFolderLocation: (): Promise<string> => ipcRenderer.invoke('app/getFolderLocation'),

  // User Keyboard Shortcuts
  getUserKeyboardShortcuts: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('app/getUserKeyboardShortcuts'),
  saveUserKeyboardShortcuts: (shortcuts: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke('app/saveUserKeyboardShortcuts', shortcuts),

  // User Equalizer Preset
  getUserEqualizerPreset: (): Promise<{ frequencyBands: number[] }> =>
    ipcRenderer.invoke('app/getUserEqualizerPreset'),
  saveUserEqualizerPreset: (presetData: {
    presetName?: string;
    frequencyBands?: number[];
    isEnabled?: boolean;
  }): Promise<void> => ipcRenderer.invoke('app/saveUserEqualizerPreset', presetData),

  // Ignored Items
  getIgnoredArtists: (): Promise<number[]> => ipcRenderer.invoke('app/getIgnoredArtists'),
  addIgnoredArtist: (artistId: number): Promise<void> =>
    ipcRenderer.invoke('app/addIgnoredArtist', artistId),
  removeIgnoredArtist: (artistId: number): Promise<void> =>
    ipcRenderer.invoke('app/removeIgnoredArtist', artistId),

  getIgnoredFeaturingArtists: (): Promise<number[]> =>
    ipcRenderer.invoke('app/getIgnoredFeaturingArtists'),
  addIgnoredFeaturingArtist: (artistId: number): Promise<void> =>
    ipcRenderer.invoke('app/addIgnoredFeaturingArtist', artistId),
  removeIgnoredFeaturingArtist: (artistId: number): Promise<void> =>
    ipcRenderer.invoke('app/removeIgnoredFeaturingArtist', artistId),

  getIgnoredDuplicateMetadata: (): Promise<Array<{ duplicateGroupId: string; songId: number }>> =>
    ipcRenderer.invoke('app/getIgnoredDuplicateMetadata'),
  addIgnoredDuplicate: (duplicateGroupId: string, songId: number): Promise<void> =>
    ipcRenderer.invoke('app/addIgnoredDuplicate', duplicateGroupId, songId)
};

// $ APP RESTART OR RESET
const appControls = {
  restartRenderer: (reason: string): void => ipcRenderer.send('app/restartRenderer', reason),
  restartApp: (reason: string): void => ipcRenderer.send('app/restartApp', reason),
  resetApp: (): void => {
    ipcRenderer.removeAllListeners('app/beforeQuitEvent');
    ipcRenderer.send('app/resetApp');
  },
  stopScreenSleeping: () => ipcRenderer.send('app/stopScreenSleeping'),

  allowScreenSleeping: () => ipcRenderer.send('app/allowScreenSleeping')
};

// $ OTHER
const utils = {
  showFilePath: (file: File) => {
    const path = webUtils.getPathForFile(file);
    return path;
  },
  path: {
    join: (...args: string[]) => args.join('/')
  },
  getExtension: (dir: string) => {
    const regex = /(?<name>.+)\.(?<ext>[\w\d]+)(?<search>\?.+)?$/;
    const match = dir.match(regex);
    const ext = match?.groups?.ext || '';
    return ext;
  },
  getBaseName: (dir: string) => {
    const base =
      dir
        .split(/[/\\]/)
        .filter((x) => x)
        .at(-1) || '';
    return base;
  },
  removeDefaultAppProtocolFromFilePath: (filePath: string) => {
    return filePath.replace(/nora:[/\\]{1,2}localfiles[/\\]{1,2}|\?[\w+=\w+&?]+$/gm, '');
  },
  showOpenDialog: (options?: unknown): Promise<string[]> =>
    ipcRenderer.invoke('utils/showOpenDialog', options),
  openPath: (dirPath: string): void => ipcRenderer.send('app/revealFolderInFileExplorer', dirPath)
};

const libraryMetrics = {
  getSchedulerMetrics: () => ipcRenderer.invoke('app/getSchedulerMetrics'),
  prioritizeArtworkGeneration: (albumId: number) =>
    ipcRenderer.send('app/prioritizeArtworkGeneration', albumId),
  retryRecoverable: () => ipcRenderer.invoke('app/retryRecoverable')
};

const library = {
  getChangeState: (): Promise<{
    isDirty: boolean;
    changedPaths: string[];
    lastChangedAt: number | null;
  }> => ipcRenderer.invoke('library/getChangeState'),
  resetChangeState: (): Promise<void> => ipcRenderer.invoke('library/resetChangeState'),
  startScan: (options?: { dryRun?: boolean }): Promise<ScanSummary> =>
    ipcRenderer.invoke('library/startScan', options),
  cancelScan: (): Promise<boolean> => ipcRenderer.invoke('library/cancelScan'),
  getScanStatus: (): Promise<ScannerState> => ipcRenderer.invoke('library/getScanStatus'),
  onScanProgress: (callback: (progress: ScannerProgress) => void) => {
    const listener = (_: unknown, progress: ScannerProgress) => callback(progress);
    ipcRenderer.on('library/scanProgress', listener);
    return () => {
      ipcRenderer.removeListener('library/scanProgress', listener);
    };
  }
};

const collections = {
  read: {
    getCollection: (id: number): Promise<CollectionDto | null> =>
      ipcRenderer.invoke('collections/read/getCollection', id),
    getChildren: (id: number | null): Promise<CollectionDto[]> =>
      ipcRenderer.invoke('collections/read/getChildren', id),
    getEntries: (
      id: number,
      offset?: number,
      limit?: number,
      sortType?: PlaylistViewMode
    ): Promise<PlaylistEntryDto[]> =>
      ipcRenderer.invoke('collections/read/getEntries', id, offset, limit, sortType),
    getBreadcrumbs: (id: number): Promise<BreadcrumbDto[]> =>
      ipcRenderer.invoke('collections/read/getBreadcrumbs', id),
    getArtworks: (songIds: number[]): Promise<ArtworkPaths[]> =>
      ipcRenderer.invoke('collections/read/getArtworks', songIds)
  },
  write: {
    createFolder: (input: CreateFolderInput): Promise<number> =>
      ipcRenderer.invoke('collections/write/createFolder', input),
    createPlaylist: (input: CreatePlaylistInput): Promise<number> =>
      ipcRenderer.invoke('collections/write/createPlaylist', input),
    addSongs: (input: AddSongsInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/addSongs', input),
    removeSongs: (input: RemoveSongsInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/removeSongs', input),
    reorder: (input: ReorderSongsInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/reorder', input),
    rename: (input: RenameInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/rename', input),
    move: (input: MoveCollectionInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/move', input),
    delete: (input: DeleteInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/delete', input),
    duplicate: (input: DuplicateInput): Promise<number> =>
      ipcRenderer.invoke('collections/write/duplicate', input),
    merge: (input: MergePlaylistsInput): Promise<number> =>
      ipcRenderer.invoke('collections/write/merge', input),
    bulkDelete: (input: BulkDeleteInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/bulkDelete', input),
    bulkRestore: (input: BulkRestoreInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/bulkRestore', input),
    pin: (input: PinInput): Promise<void> => ipcRenderer.invoke('collections/write/pin', input),
    unpin: (input: UnpinInput): Promise<void> =>
      ipcRenderer.invoke('collections/write/unpin', input),
    setArtwork: (playlistId: number, artworkPath: string): Promise<ArtworkPaths | undefined> =>
      ipcRenderer.invoke('collections/write/setArtwork', { playlistId, artworkPath })
  },
  history: {
    undo: (collectionId: string): Promise<boolean> =>
      ipcRenderer.invoke('collections/history/undo', collectionId),
    redo: (collectionId: string): Promise<boolean> =>
      ipcRenderer.invoke('collections/history/redo', collectionId)
  },
  events: {
    onEvent: (callback: (e: unknown, event: CollectionEvent) => void) =>
      ipcRenderer.on('collections/event', callback),
    offEvent: (callback: (...args: any[]) => void) =>
      ipcRenderer.removeListener('collections/event', callback)
  },
  export: (playlistId: number, options?: PlaylistExportOptions): Promise<void> =>
    ipcRenderer.invoke('collections/export', playlistId, options),
  exportBatch: (
    playlistIds: number[],
    options?: PlaylistBatchExportOptions
  ): Promise<BatchExportResult> =>
    ipcRenderer.invoke('collections/export-batch', playlistIds, options),
  analyze: (filePath?: string): Promise<PlaylistImportAnalysis | null> =>
    ipcRenderer.invoke('collections/analyze', filePath),
  import: (options?: PlaylistImportIpcOptions): Promise<void> =>
    ipcRenderer.invoke('collections/import', options)
};

const membership = {
  getMembers: (collection: { kind: string; id: string | number }, memberKind: string) =>
    ipcRenderer.invoke('membership:getMembers', collection, memberKind),
  getCollectionsContaining: (
    member: { kind: string; id: string | number },
    collectionKind: string
  ) => ipcRenderer.invoke('membership:getCollectionsContaining', member, collectionKind),
  contains: (
    collection: { kind: string; id: string | number },
    member: { kind: string; id: string | number }
  ) => ipcRenderer.invoke('membership:contains', collection, member),
  containsMany: (
    collection: { kind: string; id: string | number },
    members: { kind: string; id: string | number }[]
  ) => ipcRenderer.invoke('membership:containsMany', collection, members),
  count: (collection: { kind: string; id: string | number }, memberKind: string) =>
    ipcRenderer.invoke('membership:count', collection, memberKind)
};

const metadata = {
  load: (identity: { entityKind: string; entityId: string | number }) =>
    ipcRenderer.invoke('metadata.load', identity),
  setField: (
    identity: { entityKind: string; entityId: string | number },
    fieldId: string,
    value: unknown
  ) => ipcRenderer.invoke('metadata.override.set', { identity, fieldId, value }),
  setFields: (
    identity: { entityKind: string; entityId: string | number },
    overrides: Record<string, unknown>
  ) => ipcRenderer.invoke('metadata.override.setBatch', { identity, overrides }),
  removeField: (identity: { entityKind: string; entityId: string | number }, fieldId: string) =>
    ipcRenderer.invoke('metadata.override.remove', { identity, fieldId }),
  clearOverrides: (identity: { entityKind: string; entityId: string | number }) =>
    ipcRenderer.invoke('metadata.override.clear', { identity })
};

export const api = {
  properties,
  windowControls,
  theme,
  playerControls,
  audioLibraryControls,
  suggestions,
  unknownSource,
  quitEvent,
  battery,
  fullscreen,
  search,
  lyrics,
  messages,
  dataUpdates,
  songUpdates,
  songDataFromInternet,
  userData,
  storageData,
  folderData,
  artistsData,
  genresData,
  albumsData,
  log,
  miniPlayer,
  settings,
  settingsHelpers,
  appControls,
  utils,
  queue,
  library,
  libraryMetrics,
  collections,
  membership,
  metadata,
  metadataAutoTag: {
    searchAlbums: (albumName: string, artistName?: string, options?: MetadataSearchOptions) =>
      ipcRenderer.invoke('metadata/searchAlbums', albumName, artistName, options),
    buildPreview: (
      localSongs: unknown[],
      releaseId: string,
      providerId?: string,
      operationId?: string
    ) =>
      ipcRenderer.invoke('metadata/buildPreview', localSongs, releaseId, providerId, operationId),
    applyPreview: (preview: unknown, options?: unknown, operationId?: string) =>
      ipcRenderer.invoke('metadata/applyPreview', preview, options, operationId),
    undoLastAutoTag: (operationId?: string) =>
      ipcRenderer.invoke('metadata/undoLastAutoTag', operationId),
    cancelAutoTag: (operationId?: string) =>
      ipcRenderer.invoke('metadata/cancelAutoTag', operationId),
    getMetadataPreferences: () =>
      ipcRenderer.invoke('metadata/getPreferences'),
    saveMetadataPreferences: (prefs: Partial<MetadataProviderPreferences>) =>
      ipcRenderer.invoke('metadata/savePreferences', prefs),
    getAvailableSearchProviders: () =>
      ipcRenderer.invoke('metadata/getAvailableSearchProviders'),
    onProgress: (callback: (payload: any) => void) => {
      const listener = (_: unknown, data: any) => callback(data);
      ipcRenderer.on('metadata/progress', listener);
      return () => {
        ipcRenderer.removeListener('metadata/progress', listener);
      };
    }
  },
  metadataWorkflow: {
    search: (
      workflowType: string,
      query: { title?: string; artist?: string; album?: string; limit?: number },
      operationId?: string
    ) => ipcRenderer.invoke('metadata/workflow/search', workflowType, query, operationId),
    buildPreview: (
      workflowType: string,
      localSongs: unknown[],
      candidateId: string,
      providerId?: string,
      operationId?: string
    ) =>
      ipcRenderer.invoke(
        'metadata/workflow/buildPreview',
        workflowType,
        localSongs,
        candidateId,
        providerId,
        operationId
      ),
    applyPreview: (
      workflowType: string,
      preview: unknown,
      selectedFieldIds?: string[],
      options?: unknown,
      operationId?: string
    ) =>
      ipcRenderer.invoke(
        'metadata/workflow/applyPreview',
        workflowType,
        preview,
        selectedFieldIds,
        options,
        operationId
      ),
    undo: (operationId?: string) => ipcRenderer.invoke('metadata/workflow/undo', operationId),
    cancel: (operationId?: string) => ipcRenderer.invoke('metadata/workflow/cancel', operationId)
  },
  spotify: {
    connect: () => ipcRenderer.invoke('spotify/auth/connect'),
    disconnect: () => ipcRenderer.invoke('spotify/auth/disconnect'),
    getStatus: () => ipcRenderer.invoke('spotify/auth/getStatus'),
    getPlaylists: (options?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('spotify/playlists/getPlaylists', options),
    generateImportPlan: (playlistId: string) =>
      ipcRenderer.invoke('spotify/playlists/generateImportPlan', playlistId),
    executeImportPlan: (
      plan: unknown,
      options?: { targetPlaylistId?: number; mode?: 'create' | 'merge' | 'replace' }
    ) => ipcRenderer.invoke('spotify/playlists/executeImportPlan', plan, options),
    hasExportPermissions: (isPublic = false) =>
      ipcRenderer.invoke('spotify/export/hasPermissions', isPublic),
    generateExportPlan: (playlistId: number) =>
      ipcRenderer.invoke('spotify/export/generatePlan', playlistId),
    executeExport: (request: {
      playlistId: number;
      name: string;
      description?: string;
      isPublic: boolean;
      revision: string;
    }) => ipcRenderer.invoke('spotify/export/executeExport', request),
    getLink: (playlistId: number) => ipcRenderer.invoke('spotify/sync/getLink', playlistId),
    linkPlaylist: (playlistId: number, spotifyPlaylistId: string, strategy?: string) =>
      ipcRenderer.invoke('spotify/sync/linkPlaylist', playlistId, spotifyPlaylistId, strategy),
    unlinkPlaylist: (playlistId: number) =>
      ipcRenderer.invoke('spotify/sync/unlinkPlaylist', playlistId),
    detectDrift: (playlistId: number) =>
      ipcRenderer.invoke('spotify/sync/detectDrift', playlistId),
    generateSyncPlan: (playlistId: number, strategy?: string) =>
      ipcRenderer.invoke('spotify/sync/generatePlan', playlistId, strategy),
    executeSync: (playlistId: number, strategy?: string) =>
      ipcRenderer.invoke('spotify/sync/executeSync', playlistId, strategy)
  }
};

contextBridge.exposeInMainWorld('api', api);


