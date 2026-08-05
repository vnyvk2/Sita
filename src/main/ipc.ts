import { app, BrowserWindow, ipcMain, powerMonitor, shell, Menu } from 'electron';

import addSongsFromFolderStructures from './core/addMusicFolder';
import { registerMembershipIPCHandlers } from './ipc/membershipIPC';
import { registerMetadataIPCHandlers } from './metadata/ipc/metadataIpc';
import { MetadataBootstrap } from './metadata/setup';
import { registerMetadataHandlers } from './ipc/MetadataHandlers';
import { AlbumAutoTagService } from './metadata/services/AlbumAutoTagService';
import { AlbumMetadataService } from './metadata/services/AlbumMetadataService';

import blacklistFolders from './core/blacklistFolders';
import blacklistSongs from './core/blacklistSongs';
import changeAppTheme from './core/changeAppTheme';
import checkForNewSongs from './core/checkForNewSongs';
import checkForStartUpSongs from './core/checkForStartUpSongs';
import clearSearchHistoryResults from './core/clearSeachHistoryResults';
import clearSongHistory from './core/clearSongHistory';
import deleteSongsFromSystem from './core/deleteSongsFromSystem';

import fetchAlbumData from './core/fetchAlbumData';
import fetchArtistData from './core/fetchArtistData';
import fetchSongInfoFromLastFM from './core/fetchSongInfoFromLastFM';
import { getAllFavoriteSongs } from './core/getAllFavoriteSongs';
import { getAllHistorySongs } from './core/getAllHistorySongs';
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
import importPlaylist from './core/importPlaylist';
import removeMusicFolder from './core/removeMusicFolder';

import { resolveArtistDuplicates } from './core/resolveDuplicates';
import resolveFeaturingArtists from './core/resolveFeaturingArtists';
import { resolveSeparateArtists } from './core/resolveSeparateArtists';
import restoreBlacklistedFolders from './core/restoreBlacklistedFolder';
import restoreBlacklistedSongs from './core/restoreBlacklistedSongs';
import saveArtworkToSystem from './core/saveArtworkToSystem';
import sendAudioData from './core/sendAudioData';
import sendAudioDataFromPath from './core/sendAudioDataFromPath';

import sendSongID3Tags from './core/sendSongMetadata';
import toggleBlacklistFolders from './core/toggleBlacklistFolders';
import toggleLikeArtists from './core/toggleLikeArtists';
import toggleLikeSongs from './core/toggleLikeSongs';
import updateSongListeningData from './core/updateSongListeningData';
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
import { getUserSettings, saveUserSettings } from './db/queries/settings';
import {
  getUserKeyboardShortcuts,
  saveUserKeyboardShortcuts,
  getUserEqualizerPreset,
  saveUserEqualizerPreset
} from './db/queries/userPreferences';
import { removeDefaultAppProtocolFromFilePath } from './fs/resolveFilePaths';
import logger, { logFilePath } from './logger';
import {
  allowScreenSleeping,
  changePlayerType,
  expandMiniPlayer,
  getFolderLocation,
  getImagefileLocation,
  getRendererLogs,
  IS_DEVELOPMENT,
  resetApp,
  restartApp,
  restartRenderer,
  revealSongInFileExplorer,
  sendMessageToRenderer,
  stopScreenSleeping,
  toggleAudioPlayingState,
  toggleAutoLaunch,
  toggleMiniPlayerAlwaysOnTop,
  toggleOnBatteryPower
} from './main';
import { setDiscordRpcActivity } from './other/discordRPC';
import { generatePalettes } from './other/generatePalette';
import getAlbumInfoFromLastFM from './other/lastFm/getAlbumInfoFromLastFM';
import getSimilarTracks from './other/lastFm/getSimilarTracks';
import scrobbleSong from './other/lastFm/scrobbleSong';
import sendNowPlayingSongDataToLastFM from './other/lastFm/sendNowPlayingSongDataToLastFM';
import reParseSong from './parseSong/reParseSong';
import saveLyricsToSong from './saveLyricsToSong';
import updateSongId3Tags, { isMetadataUpdatesPending } from './updateSong/updateSongId3Tags';
import { SearchCoordinator } from './search/coordinator/SearchCoordinator';
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
import { recoverLibraryAssets } from './core/recovery';
import { setupCollectionIpc } from './collections/ipc/setupCollectionIpc';
import { playlistEngine, undoEngine, playlistRepository, hierarchyService } from './collections/setup';
import { setupPlaylistImportIpc } from './playlistImport/ipc/setupPlaylistImportIpc';
import { setupPlaylistExportIpc } from './playlistExport/ipc/setupPlaylistExportIpc';
import { playlistImportWorkflow, importHistoryService } from './playlistImport/setup';

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
  registerMembershipIPCHandlers();

  const autoTagService = new AlbumAutoTagService({
    albumMetadataService: new AlbumMetadataService()
  });
  registerMetadataHandlers(autoTagService, mainWindow);
  
  MetadataBootstrap.getInstance().then((metadataContainer) => {
    registerMetadataIPCHandlers(metadataContainer.engine, metadataContainer.userService);
  });
}
