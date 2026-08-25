import { app, BrowserWindow, ipcMain, powerMonitor, shell, Menu } from 'electron';

import {
  COMPACT_LYRICS_EXTENSION_HEIGHT,
  MINI_PLAYER_SEARCH_EXTENSION_HEIGHT
} from '@common/miniPlayerConstants';
import memProfiler from './utils/memProfiler';
import { setupCollectionIpc } from './collections/ipc/setupCollectionIpc';
import {
  playlistEngine,
  undoEngine,
  playlistRepository,
  hierarchyService
} from './collections/setup';
import addSongsFromFolderStructures from './core/addMusicFolder';
import blacklistFolders from './core/blacklistFolders';
import blacklistSongs from './core/blacklistSongs';
import changeAppTheme from './core/changeAppTheme';
import checkForStartUpSongs from './core/checkForStartUpSongs';
import clearSearchHistoryResults from './core/clearSeachHistoryResults';
import clearSongHistory from './core/clearSongHistory';
import deleteSongsFromSystem from './core/deleteSongsFromSystem';
import exportAppData from './core/exportAppData';
import fetchAlbumData from './core/fetchAlbumData';
import fetchArtistData from './core/fetchArtistData';
import fetchSongInfoFromLastFM from './core/fetchSongInfoFromLastFM';
import { getAllFavoriteSongs } from './core/getAllFavoriteSongs';
import { getAllHistorySongs } from './core/getAllHistorySongs';
import { getAllRecentlyAddedSongs } from './core/getAllRecentlyAddedSongs';
import getAllSongs from './core/getAllSongs';
import getArtistInfoFromNet from './core/getArtistInfoFromNet';
import getBlacklistData from './core/getBlacklistData';
import { getArtistDuplicates } from './core/getDuplicates';
import { getFolderStructures } from './core/getFolderStructures';
import getGenresInfo from './core/getGenresInfo';
import { getListeningData } from './core/getListeningData';
import getMusicFolderData from './core/getMusicFolderData';
import getSongInfo from './core/getSongInfo';
import getSongLyrics from './core/getSongLyrics';
import getStorageUsage from './core/getStorageUsage';
import importAppData from './core/importAppData';
import { recoverLibraryAssets } from './core/recovery';
import removeMusicFolder from './core/removeMusicFolder';
import { resolveArtistDuplicates } from './core/resolveDuplicates';
import resolveFeaturingArtists from './core/resolveFeaturingArtists';
import { resolveSeparateArtists } from './core/resolveSeparateArtists';
import { artistDiscographyService } from './services/ArtistDiscographyService';
import { artistProfileService } from './services/ArtistProfileService';
import restoreBlacklistedFolders from './core/restoreBlacklistedFolder';
import restoreBlacklistedSongs from './core/restoreBlacklistedSongs';
import saveArtworkToSystem from './core/saveArtworkToSystem';
import sendAudioData from './core/sendAudioData';
import sendAudioDataFromPath from './core/sendAudioDataFromPath';
import sendSongID3Tags from './core/sendSongMetadata';
import toggleBlacklistFolders from './core/toggleBlacklistFolders';
import toggleLikeAlbums from './core/toggleLikeAlbums';
import toggleLikeArtists from './core/toggleLikeArtists';
import toggleLikeSongs from './core/toggleLikeSongs';
import updateSongListeningData from './core/updateSongListeningData';
import { getListeningAnalytics, getLibraryAudioStats, type HistoryPeriod } from './db/queries/analytics';
import type { HistoryQueryOptions } from './db/queries/history';
import {
  addIgnoredArtist,
  addIgnoredDuplicate,
  addIgnoredFeaturingArtist,
  getIgnoredArtists,
  getIgnoredDuplicateMetadata,
  getIgnoredFeaturingArtists,
  removeIgnoredArtist,
  removeIgnoredFeaturingArtist
} from './db/queries/ignoredItems';
import { getDatabaseMetrics } from './db/queries/other';
import { clearScrobbleQueue } from './db/queries/scrobble_queue';
import { getUserSettings, saveUserSettings } from './db/queries/settings';
import { getAllSongIds, getSongById } from './db/queries/songs';
import {
  getUserKeyboardShortcuts,
  saveUserKeyboardShortcuts,
  getUserEqualizerPreset,
  saveUserEqualizerPreset
} from './db/queries/userPreferences';
import { removeDefaultAppProtocolFromFilePath } from './fs/resolveFilePaths';
import { registerMembershipIPCHandlers } from './ipc/membershipIPC';
import { registerMetadataHandlers } from './ipc/MetadataHandlers';
import libraryChangeTracker from './library/LibraryChangeTracker';
import libraryLifecycleController, {
  type LibraryScanMode
} from './library/LibraryLifecycleController';
import libraryScanner, { type ScanOptions } from './library/LibraryScanner';
import logger, { logFilePath } from './logger';
import {
  allowScreenSleeping,
  changePlayerType,
  expandMiniPlayer,
  getFolderLocation,
  getImagefileLocation,
  getRendererLogs,
  IS_DEVELOPMENT,
  dataUpdateEvent,
  resetApp,
  resetMiniPlayerToDefault,
  restartApp,
  restartRenderer,
  revealSongInFileExplorer,
  sendMessageToRenderer,
  setMiniPlayerMinimumBounds,
  setMiniPlayerMode,
  stopScreenSleeping,
  toggleAudioPlayingState,
  toggleAutoLaunch,
  toggleMiniPlayerAlwaysOnTop,
  toggleOnBatteryPower
} from './main';
import { registerMetadataIPCHandlers } from './metadata/ipc/metadataIpc';
import { MetadataBootstrap } from './metadata/setup';
import { setDiscordRpcActivity } from './other/discordRPC';
import { generatePalettes } from './other/generatePalette';
import { flushScrobbleQueue, invalidateLastFmSession } from './other/lastFm/flushScrobbleQueue';
import getAlbumInfoFromLastFM from './other/lastFm/getAlbumInfoFromLastFM';
import getSimilarTracks from './other/lastFm/getSimilarTracks';
import scrobbleSong from './other/lastFm/scrobbleSong';
import sendNowPlayingSongDataToLastFM from './other/lastFm/sendNowPlayingSongDataToLastFM';
import reParseSong from './parseSong/reParseSong';
import { setupPlaylistExportIpc } from './playlistExport/ipc/setupPlaylistExportIpc';
import { setupPlaylistImportIpc } from './playlistImport/ipc/setupPlaylistImportIpc';
import { playlistImportWorkflow, importHistoryService } from './playlistImport/setup';
import saveLyricsToSong from './saveLyricsToSong';
import { SearchCoordinator } from './search/coordinator/SearchCoordinator';
import { setupSpotifyIpc } from './spotify/ipc/setupSpotifyIpc';
import updateSongId3Tags, { isMetadataUpdatesPending } from './updateSong/updateSongId3Tags';
import convertLyricsToPinyin from './utils/convertToPinyin';
import convertLyricsToRomaja from './utils/convertToRomaja';
import {
  fetchSongMetadataFromInternet,
  searchSongMetadataResultsInInternet
} from './utils/fetchSongMetadataFromInternet';
import { getQueueInfo } from './utils/getQueueInfo';
import getTranslatedLyrics from './utils/getTranslatedLyrics';
import resetLyrics from './utils/resetLyrics';
import romanizeLyrics from './utils/romanizeLyrics';
import { compare } from './utils/safeStorage';
import { adaptivePolicyEngine } from './workers/adaptivePolicyEngine';
import { libraryScheduler } from './workers/jobScheduler';
import { registerLibraryChoreography } from './workers/libraryChoreography';
import { libraryObservability } from './workers/libraryObservability';

export function initializeIPC(mainWindow: BrowserWindow, abortSignal: AbortSignal) {
  // Start the Library Builder Scheduler
  libraryScheduler.start();
  adaptivePolicyEngine.start();

  // Enqueue Garbage Collection on startup
  libraryScheduler.requestMaintenance();

  // Event Choreography: When an ArtworkJob finishes, queue a PaletteJob
  // Register background asset generation pipelines (e.g., palettes)
  registerLibraryChoreography();

  const sendSchedulerUpdate = () => {
    sendMessageToRenderer({
      messageCode: 'LIBRARY_SCHEDULER_UPDATE',
      data: { metrics: libraryObservability.getMetrics() }
    });
  };

  libraryObservability.on('METRICS_UPDATED', sendSchedulerUpdate);

  // Fire and forget startup recovery sync
  recoverLibraryAssets().catch((err) => logger.error('Recovery failed', { error: err }));

  // Setup Collection IPC, Playlist Import IPC, & Playlist Export IPC
  setupCollectionIpc(
    playlistEngine,
    undoEngine,
    playlistRepository,
    hierarchyService,
    (channel: string, ...args: any[]) => mainWindow?.webContents?.send(channel, ...args)
  );

  setupPlaylistImportIpc(playlistImportWorkflow, importHistoryService);

  setupPlaylistExportIpc(playlistRepository);
  setupSpotifyIpc();
  registerMembershipIPCHandlers();

  MetadataBootstrap.getInstance()
    .then(async (metadataContainer) => {
      registerMetadataIPCHandlers(
        metadataContainer.engine,
        metadataContainer.application.userService
      );
      registerMetadataHandlers(
        metadataContainer.application.autoTagService,
        metadataContainer.application.workflowService,
        metadataContainer.application.preferencesService,
        mainWindow,
        metadataContainer.application.providerRuntime
      );
      logger.info(
        'AutoTag IPC handlers initialized successfully via MetadataBootstrap composition root'
      );
    })
    .catch((err) => {
      logger.error('Failed to initialize MetadataBootstrap', { error: err });
    });

  if (mainWindow) {
    ipcMain.on('app/close', () => app.quit());

    ipcMain.on('app/minimize', () => mainWindow.minimize());

    ipcMain.on('app/toggleMaximize', () =>
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    );

    ipcMain.on('app/hide', () => mainWindow.hide());

    ipcMain.on('app/show', () => mainWindow.show());

    ipcMain.on('app/changeAppTheme', (_, theme?: AppTheme) => changeAppTheme(theme));

    ipcMain.on('app/player/songPlaybackStateChange', (_: unknown, isPlaying: boolean) =>
      toggleAudioPlayingState(isPlaying)
    );

    ipcMain.on('app/setDiscordRpcActivity', (_: unknown, options: unknown) =>
      setDiscordRpcActivity(options as DiscordActivity)
    );

    ipcMain.on('app/stopScreenSleeping', stopScreenSleeping);
    ipcMain.on('app/allowScreenSleeping', allowScreenSleeping);

    ipcMain.handle('app/checkForStartUpSongs', () => checkForStartUpSongs());

    mainWindow.on('focus', () => {
      mainWindow.webContents.send('app/focused');
      mainWindow.flashFrame(false);
    });
    mainWindow.on('blur', () => mainWindow.webContents.send('app/blurred'));

    mainWindow.on('enter-full-screen', () => {
      logger.debug('Entered full screen');
      mainWindow.webContents.send('app/enteredFullscreen');
    });
    mainWindow.on('leave-full-screen', () => {
      logger.debug('Left full screen');
      mainWindow.webContents.send('app/leftFullscreen');
    });
    powerMonitor.addListener('on-ac', toggleOnBatteryPower);
    powerMonitor.addListener('on-battery', toggleOnBatteryPower);

    // ipcMain.on('app/getSongPosition', (_, position: number) =>
    //   saveUserData('currentSong.stoppedPosition', position)
    // );

    ipcMain.handle('app/addSongsFromFolderStructures', (_, structures: FolderStructure[]) =>
      addSongsFromFolderStructures(structures)
    );

    ipcMain.on('app/prioritizeArtworkGeneration', (_, albumId: number) => {
      const jobId = `artwork_${albumId}`;
      libraryScheduler.promoteToInteractive(jobId);
    });

    ipcMain.handle('app/getSchedulerMetrics', async () => {
      return libraryObservability.getMetrics();
    });

    ipcMain.handle('app/retryRecoverable', () => {
      libraryScheduler.retryRecoverableJobs();
    });

    ipcMain.handle('app/getSong', (_, id: number, updateListeningRate?: boolean) =>
      sendAudioData(id, updateListeningRate)
    );

    ipcMain.handle('app/getSongFromUnknownSource', (_, songPath: string) =>
      sendAudioDataFromPath(songPath)
    );

    ipcMain.handle('app/toggleLikeSongs', (_, songIds: number[], likeSong?: boolean) =>
      toggleLikeSongs(songIds, likeSong)
    );

    ipcMain.handle('app/toggleLikeArtists', (_, artistIds: number[], likeArtist?: boolean) =>
      toggleLikeArtists(artistIds, likeArtist)
    );

    ipcMain.handle('app/toggleLikeAlbums', (_, albumIds: number[], likeAlbum?: boolean) =>
      toggleLikeAlbums(albumIds, likeAlbum)
    );

    ipcMain.handle(
      'app/getAllSongs',
      (_, sortType?: SongSortTypes, filterType?: SongFilterTypes, paginatingData?: PaginatingData) =>
        memProfiler.wrapHandler('app/getAllSongs', () =>
          getAllSongs(sortType, filterType, paginatingData)
        )
    );

    ipcMain.handle(
      'app/getAllHistorySongs',
      (
        _,
        sortType?: SongSortTypes,
        paginatingData?: PaginatingData,
        options?: HistoryQueryOptions
      ) => getAllHistorySongs(sortType, paginatingData, options)
    );

    ipcMain.handle(
      'app/getAllRecentlyAddedSongs',
      (
        _,
        sortType?: SongSortTypes,
        paginatingData?: PaginatingData,
        options?: { period?: RecentlyAddedPeriod }
      ) => getAllRecentlyAddedSongs(sortType, paginatingData, options)
    );

    ipcMain.handle(
      'app/getAllFavoriteSongs',
      (_, sortType?: SongSortTypes, paginatingData?: PaginatingData) =>
        getAllFavoriteSongs(sortType, paginatingData)
    );

    // Music Analytics & Insights Handlers
    ipcMain.handle('app/getListeningAnalytics', (_, period?: HistoryPeriod) =>
      getListeningAnalytics(period)
    );

    ipcMain.handle('app/getLibraryAudioStats', () =>
      getLibraryAudioStats()
    );

    // ipcMain.handle('app/saveUserData', (_, dataType: UserDataTypes, data: string) =>
    //   saveUserData(dataType, data)
    // );
    ipcMain.handle('app/saveUserSettings', (_, settings: Partial<UserSettings>) =>
      saveUserSettings(settings)
    );

    // User Keyboard Shortcuts Handlers
    ipcMain.handle('app/getUserKeyboardShortcuts', async () => {
      const shortcuts = await getUserKeyboardShortcuts();
      return shortcuts.shortcuts;
    });

    ipcMain.handle('app/saveUserKeyboardShortcuts', (_, shortcuts: Record<string, string>) =>
      saveUserKeyboardShortcuts(shortcuts)
    );

    // User Equalizer Preset Handlers
    ipcMain.handle('app/getUserEqualizerPreset', async () => {
      const preset = await getUserEqualizerPreset();
      return preset;
    });

    ipcMain.handle(
      'app/saveUserEqualizerPreset',
      (
        _,
        presetData: {
          presetName?: string;
          frequencyBands?: number[];
          isEnabled?: boolean;
        }
      ) => saveUserEqualizerPreset(presetData)
    );

    // Ignored Items Handlers
    ipcMain.handle('app/getIgnoredArtists', async () => {
      const ignored = await getIgnoredArtists();
      return ignored.map((item) => item.artistId);
    });

    ipcMain.handle('app/addIgnoredArtist', (_, artistId: number) => addIgnoredArtist(artistId));

    ipcMain.handle('app/removeIgnoredArtist', (_, artistId: number) =>
      removeIgnoredArtist(artistId)
    );

    ipcMain.handle('app/getIgnoredFeaturingArtists', async () => {
      const ignored = await getIgnoredFeaturingArtists();
      return ignored.map((item) => item.artistId);
    });

    ipcMain.handle('app/addIgnoredFeaturingArtist', (_, artistId: number) =>
      addIgnoredFeaturingArtist(artistId)
    );

    ipcMain.handle('app/removeIgnoredFeaturingArtist', (_, artistId: number) =>
      removeIgnoredFeaturingArtist(artistId)
    );

    ipcMain.handle('app/getIgnoredDuplicateMetadata', () => getIgnoredDuplicateMetadata());

    ipcMain.handle('app/addIgnoredDuplicate', (_, duplicateGroupId: string, songId: number) =>
      addIgnoredDuplicate(duplicateGroupId, songId)
    );

    ipcMain.handle('app/getStorageUsage', () => getStorageUsage());
    ipcMain.handle('app/getDatabaseMetrics', () => getDatabaseMetrics());

    ipcMain.handle('app/getUserData', async () => await getUserSettings());
    ipcMain.handle('app/getUserSettings', async () => await getUserSettings());

    ipcMain.handle('app/search/query', (_, options: SearchCoordinatorOptions) =>
      SearchCoordinator.query(options)
    );

    ipcMain.handle(
      'app/getSongLyrics',
      (
        _,
        trackInfo: LyricsRequestTrackInfo,
        lyricsType?: LyricsTypes,
        lyricsRequestType?: LyricsRequestTypes,
        saveLyricsAutomatically?: AutomaticallySaveLyricsTypes
      ) => getSongLyrics(trackInfo, lyricsType, lyricsRequestType, saveLyricsAutomatically)
    );

    ipcMain.handle('app/getTranslatedLyrics', (_, languageCode: LanguageCodes) =>
      getTranslatedLyrics(languageCode as string)
    );

    ipcMain.handle('app/romanizeLyrics', async () => await romanizeLyrics());

    ipcMain.handle('app/convertLyricsToPinyin', () => convertLyricsToPinyin());

    ipcMain.handle('app/convertLyricsToRomaja', () => convertLyricsToRomaja());

    ipcMain.handle('app/resetLyrics', () => resetLyrics());

    ipcMain.handle('app/saveLyricsToSong', (_, songPath: string, lyrics: SongLyrics) =>
      saveLyricsToSong(songPath, lyrics)
    );

    ipcMain.handle(
      'app/getSongInfo',
      (
        _,
        songIds: number[],
        sortType?: SongSortTypes,
        filterType?: SongFilterTypes,
        limit?: number,
        preserveIdOrder = false
      ) =>
        memProfiler.wrapHandler('app/getSongInfo', () =>
          getSongInfo(songIds, sortType, filterType, limit, preserveIdOrder)
        )
    );

    ipcMain.handle('app/getSimilarTracksForASong', (_, songId: number) => getSimilarTracks(songId));

    ipcMain.handle('app/getAlbumInfoFromLastFM', (_, albumId: number) =>
      getAlbumInfoFromLastFM(albumId)
    );

    ipcMain.handle('app/getSongListeningData', (_, songIds: number[]) => getListeningData(songIds));

    ipcMain.handle(
      'app/updateSongListeningData',
      (_: unknown, songId: number, dataType: ListeningDataEvents, value: number) =>
        updateSongListeningData(songId, dataType, value)
    );

    ipcMain.handle('app/generatePalettes', generatePalettes);

    ipcMain.handle('app/scrobbleSong', (_, songId: number, startTimeInSecs: number) =>
      scrobbleSong(songId, startTimeInSecs)
    );

    ipcMain.handle('app/flushScrobbleQueue', () => flushScrobbleQueue());

    ipcMain.handle('app/disconnectLastFm', async () => {
      invalidateLastFmSession();
      await clearScrobbleQueue();
      await saveUserSettings({ lastFmSessionName: null, lastFmSessionKey: null });
      dataUpdateEvent('userData');
      return true;
    });

    ipcMain.handle('app/sendNowPlayingSongDataToLastFM', (_, songId: number) =>
      sendNowPlayingSongDataToLastFM(songId)
    );

    ipcMain.handle('app/getArtistArtworks', (_, artistId: number) =>
      getArtistInfoFromNet(artistId)
    );

    ipcMain.handle('app/getArtistDiscography', (_, artistId: number, artistName: string) =>
      artistDiscographyService.getDiscography(artistId, artistName)
    );

    ipcMain.handle('app/getAlbumOnlineTracks', (_, onlineAlbumId: number, artistId: number) =>
      artistDiscographyService.getAlbumTracks(onlineAlbumId, artistId)
    );

    ipcMain.handle('app/getArtistOnlineProfile', (_, artistId: number, artistName: string) =>
      artistProfileService.getProfile(artistId, artistName)
    );

    ipcMain.handle('app/fetchSongInfoFromNet', (_, songTitle: string, songArtists: string[]) =>
      fetchSongInfoFromLastFM(songTitle, songArtists)
    );

    ipcMain.handle(
      'app/searchSongMetadataResultsInInternet',
      (_, songTitle: string, songArtists: string[]) =>
        searchSongMetadataResultsInInternet(songTitle, songArtists)
    );

    ipcMain.handle(
      'app/fetchSongMetadataFromInternet',
      (_, source: SongMetadataSource, sourceId: string) =>
        fetchSongMetadataFromInternet(source, sourceId)
    );

    ipcMain.handle(
      'app/getArtistData',
      (
        _,
        artistIdsOrNames?: string[],
        sortType?: ArtistSortTypes,
        filterType?: ArtistFilterTypes,
        start?: number,
        end?: number,
        limit?: number
      ) => fetchArtistData(artistIdsOrNames, sortType, filterType, start, end, limit)
    );

    ipcMain.handle(
      'app/getGenresData',
      (_, genreNamesOrIds?: string[], sortType?: GenreSortTypes, start?: number, end?: number) =>
        getGenresInfo(genreNamesOrIds, sortType, start, end)
    );

    ipcMain.handle(
      'app/getAlbumData',
      (
        _,
        albumTitlesOrIds?: string[],
        sortType?: AlbumSortTypes,
        filterType?: AlbumFilterTypes,
        start?: number,
        end?: number
      ) => fetchAlbumData(albumTitlesOrIds, sortType, filterType, start, end)
    );

    ipcMain.handle('app/getArtistDuplicates', (_, artistName: string) =>
      getArtistDuplicates(artistName)
    );

    ipcMain.handle(
      'app/resolveArtistDuplicates',
      (_, selectedArtistId: number, duplicateIds: number[]) =>
        resolveArtistDuplicates(selectedArtistId, duplicateIds)
    );

    ipcMain.handle(
      'app/resolveSeparateArtists',
      (_, separateArtistId: number, separateArtistNames: string[]) =>
        resolveSeparateArtists(separateArtistId, separateArtistNames)
    );

    ipcMain.handle(
      'app/resolveFeaturingArtists',
      (_, songId: number, featArtistNames: string[], removeFeatInfoInTitle?: boolean) =>
        resolveFeaturingArtists(songId, featArtistNames, removeFeatInfoInTitle)
    );

    ipcMain.handle('app/getQueueInfo', (_, queueType: QueueTypes, id: string) =>
      getQueueInfo(queueType, id)
    );

    ipcMain.handle('app/clearSongHistory', () => clearSongHistory());

    ipcMain.handle(
      'app/deleteSongsFromSystem',
      (_, absoluteFilePaths: string[], isPermanentDelete: boolean) =>
        deleteSongsFromSystem(absoluteFilePaths, abortSignal, isPermanentDelete)
    );

    ipcMain.handle(
      'app/getAllSongIds',
      (_, sortType?: SongSortTypes, filterType?: SongFilterTypes) =>
        getAllSongIds({ sortType, filterType })
    );

    ipcMain.handle('library/getChangeState', () => libraryChangeTracker.getState());
    ipcMain.handle('library/resetChangeState', () => libraryChangeTracker.reset());
    ipcMain.handle('library/startScan', (_, options?: ScanOptions) =>
      libraryLifecycleController.scanNow(options)
    );
    ipcMain.handle('library/cancelScan', () => libraryLifecycleController.cancelScan());
    ipcMain.handle('library/getScanStatus', () => libraryLifecycleController.getStatus());
    ipcMain.handle('app/updateLibraryScanMode', (_, mode: LibraryScanMode) =>
      libraryLifecycleController.setScanMode(mode)
    );

    libraryScanner.on('progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('library/scanProgress', progress);
      }
    });

    let diskChangeDebounceTimer: NodeJS.Timeout | null = null;
    libraryChangeTracker.on('changed', ({ state }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (diskChangeDebounceTimer) {
          clearTimeout(diskChangeDebounceTimer);
        }
        diskChangeDebounceTimer = setTimeout(() => {
          mainWindow.webContents.send('library/diskChanged', state);
          diskChangeDebounceTimer = null;
        }, 500);
      }
    });

    ipcMain.handle('app/resyncSongsLibrary', async () => {
      const summary = await libraryLifecycleController.scanNow();
      if (summary.status === 'COMPLETED') {
        sendMessageToRenderer({ messageCode: 'RESYNC_SUCCESSFUL' });
      }

      libraryScheduler.requestMaintenance();
      return summary;
    });

    ipcMain.handle('app/getBlacklistData', getBlacklistData);

    ipcMain.handle('app/blacklistSongs', (_, songIds: number[]) => blacklistSongs(songIds));

    ipcMain.handle('app/restoreBlacklistedSongs', (_, songIds: number[]) =>
      restoreBlacklistedSongs(songIds)
    );

    ipcMain.handle(
      'app/updateSongId3Tags',
      (
        _,
        songIdOrPath: string,
        tags: SongTags,
        sendUpdatedData?: boolean,
        isKnownSource = true
      ) => {
        console.log('[IPC app/updateSongId3Tags] Received payload:', {
          songIdOrPath,
          typeofSongIdOrPath: typeof songIdOrPath,
          tagsTitle: tags?.title,
          sendUpdatedData,
          isKnownSource
        });
        return updateSongId3Tags(songIdOrPath, tags, sendUpdatedData, isKnownSource);
      }
    );

    ipcMain.handle(
      'app/batchUpdateSongTags',
      async (
        event,
        updates: Array<{ songId: number; tags: SongTags }>
      ): Promise<BatchUpdateSongTagsResult> => {
        const total = updates?.length ?? 0;

        if (total === 0) {
          return { total: 0, savedCount: 0, failedCount: 0, results: [] };
        }

        // Concurrency limit = 3 for disk I/O throughput
        const CONCURRENCY = 3;
        const results: BatchSongItemResult[] = new Array(total);
        let completed = 0;
        let currentIndex = 0;

        const sendProgress = (payload: {
          current: number;
          total: number;
          songId: number;
          status: 'saved' | 'failed';
          message?: string;
        }) => {
          if (event.sender && !event.sender.isDestroyed()) {
            try {
              event.sender.send('app/batchTagUpdateProgress', payload);
            } catch {
              // Window destroyed or navigated during in-flight batch update
            }
          }
        };

        const processIndex = async (index: number) => {
          const item = updates[index];
          if (!item) return;

          try {
            const res = await updateSongId3Tags(item.songId, item.tags, false, true);
            if (res.success) {
              const itemResult: BatchSongItemResult = {
                songId: item.songId,
                status: 'saved'
              };
              results[index] = itemResult;
              sendProgress({
                current: ++completed,
                total,
                songId: item.songId,
                status: 'saved'
              });
            } else {
              const itemResult: BatchSongItemResult = {
                songId: item.songId,
                status: 'failed',
                message: res.reason
              };
              results[index] = itemResult;
              sendProgress({
                current: ++completed,
                total,
                songId: item.songId,
                status: 'failed',
                message: res.reason
              });
            }
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            const itemResult: BatchSongItemResult = {
              songId: item.songId,
              status: 'failed',
              message: errorMessage
            };
            results[index] = itemResult;
            sendProgress({
              current: ++completed,
              total,
              songId: item.songId,
              status: 'failed',
              message: errorMessage
            });
          }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
          while (currentIndex < total) {
            const idx = currentIndex++;
            await processIndex(idx);
          }
        });

        await Promise.all(workers);

        const savedCount = results.filter((r) => r?.status === 'saved').length;
        const failedCount = total - savedCount;

        // Consolidated data update events after the entire batch finishes
        if (savedCount > 0) {
          dataUpdateEvent('songs');
          dataUpdateEvent('artists');
          dataUpdateEvent('albums');
          dataUpdateEvent('genres');
        }

        return {
          total,
          savedCount,
          failedCount,
          results
        };
      }
    );

    ipcMain.handle('app/getImgFileLocation', getImagefileLocation);

    ipcMain.handle('app/getFolderLocation', getFolderLocation);

    ipcMain.handle('app/getSongId3Tags', (_, songId: number, isKnownSource = true) =>
      sendSongID3Tags(songId, isKnownSource)
    );

    ipcMain.handle('app/clearSearchHistory', (_, searchText?: string[]) =>
      clearSearchHistoryResults(searchText)
    );

    ipcMain.handle('app/getFolderStructures', () => getFolderStructures());

    ipcMain.handle('app/reParseSong', (_, songPath: string) => reParseSong(songPath));

    ipcMain.handle('app/reloadSongFromFile', async (_, songIdOrPath: number | string) => {
      const isNumeric =
        typeof songIdOrPath === 'number' ||
        (!isNaN(Number(songIdOrPath)) &&
          !String(songIdOrPath).includes('/') &&
          !String(songIdOrPath).includes('\\'));
      let songPath = String(songIdOrPath);
      let targetId = isNumeric ? Number(songIdOrPath) : undefined;

      if (isNumeric) {
        const song = await getSongById(Number(songIdOrPath));
        if (song) {
          songPath = song.path;
          targetId = song.id;
        }
      }

      await reParseSong(songPath);
      return sendSongID3Tags(targetId ?? songPath, true);
    });

    ipcMain.on('app/resetApp', () => resetApp(!IS_DEVELOPMENT));

    ipcMain.on('app/openLogFile', () => shell.openPath(logFilePath));

    ipcMain.on('app/revealSongInFileExplorer', (_, songId: number) =>
      revealSongInFileExplorer(songId)
    );

    ipcMain.on('app/revealFolderInFileExplorer', (_, folderPath: string) =>
      shell.showItemInFolder(folderPath)
    );

    ipcMain.on('app/saveArtworkToSystem', (_, artworkPath: string, saveName?: string) =>
      saveArtworkToSystem(artworkPath, saveName)
    );

    ipcMain.on('app/openInBrowser', (_, url: string) => shell.openExternal(url));

    ipcMain.on('app/loginToLastFmInBrowser', () =>
      shell.openExternal(
        `https://www.last.fm/api/auth/?api_key=${import.meta.env.MAIN_VITE_LAST_FM_API_KEY}&cb=nora://auth?service=lastfm`
      )
    );

    ipcMain.handle('app/exportAppData', (_, localStorageData: string) =>
      exportAppData(localStorageData)
    );

    ipcMain.handle('app/importAppData', importAppData);

    ipcMain.handle(
      'app/getRendererLogs',
      (
        _: unknown,
        mes: string | Error,
        data?: Record<string, unknown>,
        logToConsoleType: LogMessageTypes = 'INFO',
        forceWindowRestart = false,
        forceMainRestart = false
      ) => getRendererLogs(mes, data, logToConsoleType, forceWindowRestart, forceMainRestart)
    );

    ipcMain.handle('app/removeAMusicFolder', (_, absolutePath: string) =>
      removeMusicFolder(absolutePath)
    );

    ipcMain.handle('app/changePlayerType', (_, type: PlayerTypes) => changePlayerType(type));

    ipcMain.handle('app/toggleMiniPlayerQueue', (_, isExpanded: boolean, queueItemCount?: number) =>
      expandMiniPlayer(isExpanded, queueItemCount)
    );

    ipcMain.handle('app/toggleMiniPlayerLyrics', (_, isExpanded: boolean) =>
      expandMiniPlayer(isExpanded, 0, COMPACT_LYRICS_EXTENSION_HEIGHT)
    );

    ipcMain.handle('app/toggleMiniPlayerSearch', (_, isExpanded: boolean) =>
      expandMiniPlayer(isExpanded, 0, MINI_PLAYER_SEARCH_EXTENSION_HEIGHT)
    );

    ipcMain.handle('app/toggleMiniPlayerAlwaysOnTop', (_, isMiniPlayerAlwaysOnTop: boolean) =>
      toggleMiniPlayerAlwaysOnTop(isMiniPlayerAlwaysOnTop)
    );

    ipcMain.handle(
      'app/setMiniPlayerMinimumBounds',
      (_, bounds: { minWidth: number; minHeight: number }) =>
        setMiniPlayerMinimumBounds(bounds.minWidth, bounds.minHeight)
    );

    ipcMain.handle('app/setMiniPlayerMode', (_, mode: 'standard' | 'compact') =>
      setMiniPlayerMode(mode)
    );

    ipcMain.handle('app/resetMiniPlayerToDefault', () => resetMiniPlayerToDefault());

    ipcMain.handle('app/showMiniPlayerContextMenu', (event, template: any[]) => {
      return new Promise((resolve) => {
        const buildMenu = (items: any[]): any[] =>
          items.map((item) => {
            const newItem = { ...item };
            if (newItem.submenu) {
              newItem.submenu = buildMenu(newItem.submenu);
            }
            if (newItem.id && !newItem.submenu && newItem.type !== 'separator') {
              newItem.click = () => resolve(newItem.id);
            }
            return newItem;
          });

        const menu = Menu.buildFromTemplate(buildMenu(template));
        const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
        menu.popup({
          window: win ?? undefined,
          callback: () => resolve(null)
        });
      });
    });

    ipcMain.handle('app/toggleAutoLaunch', (_, autoLaunchState: boolean) =>
      toggleAutoLaunch(autoLaunchState)
    );

    ipcMain.handle('app/getFolderData', (_, folderPaths?: string[], sortType?: FolderSortTypes) =>
      getMusicFolderData(folderPaths, sortType)
    );

    ipcMain.handle('app/compareEncryptedData', (_, data: string, encryptedData: string) =>
      compare(data, encryptedData)
    );

    ipcMain.handle('app/isMetadataUpdatesPending', (_, songPath: string) =>
      isMetadataUpdatesPending(removeDefaultAppProtocolFromFilePath(songPath))
    );

    ipcMain.handle('app/blacklistFolders', (_, folderPaths: string[]) =>
      blacklistFolders(folderPaths)
    );

    ipcMain.handle('app/restoreBlacklistedFolders', (_, folderPaths: string[]) =>
      restoreBlacklistedFolders(folderPaths)
    );

    ipcMain.handle(
      'app/toggleBlacklistedFolders',
      (_, folderPaths: string[], isBlacklistFolder?: boolean) =>
        toggleBlacklistFolders(folderPaths, isBlacklistFolder)
    );

    ipcMain.on('app/networkStatusChange', (_: unknown, isConnected: boolean) => {
      logger.info(
        isConnected
          ? `App connected to the internet successfully`
          : `App disconnected from the internet`
      );
      // isConnectedToInternet = isConnected;
    });

    ipcMain.on('app/openDevTools', () => {
      logger.info('User requested for devtools.');
      mainWindow.webContents.openDevTools({
        mode: 'detach',
        activate: true
      });
    });

    ipcMain.on('app/restartRenderer', (_: unknown, reason: string) => {
      logger.info(`Renderer requested a renderer refresh.`, { reason });
      restartRenderer();
    });

    ipcMain.on('app/restartApp', (_: unknown, reason: string) => restartApp(reason));
  }
}
