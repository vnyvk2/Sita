import { mkdirSync, readdirSync, rmSync } from 'fs';
import path from 'path';

import { app, ipcMain } from 'electron';

import addMusicFromFolderStructures from '@main/core/addMusicFolder';
import { getUserSettings } from '@main/db/queries/settings';
import libraryChangeTracker from '@main/library/LibraryChangeTracker';
import logger from '@main/logger';

import { DownloadManager, type DownloadSettings } from './DownloadManager';
import type {
  DownloadsSnapshot,
  EnqueueDownloadInput,
  OnlinePlaylistInfo,
  OnlineTrackResult
} from './models/downloadTypes';
import { YtDlpExtractor } from './services/YtDlpExtractor';

let downloadManagerInstance: DownloadManager | undefined;
let extractorInstance: YtDlpExtractor | undefined;

function stagingRoot(): string {
  const root = path.join(app.getPath('userData'), 'downloads-staging');
  mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Removes leftovers from previous sessions. Jobs live in memory only, so ANY
 * directory inside the staging root at startup belongs to a dead download
 * (crash / power loss) and is safe to delete.
 */
function purgeStaleStaging(root: string): void {
  try {
    for (const entry of readdirSync(root)) {
      rmSync(path.join(root, entry), { recursive: true, force: true });
    }
  } catch (error) {
    logger.warn('[downloads] Failed to purge stale staging directories.', { error });
  }
}

async function resolveDownloadSettings(): Promise<DownloadSettings> {
  const settings = await getUserSettings();
  return {
    destinationFolder: settings.onlineDownloadsFolder ?? '',
    duplicatePolicy: settings.downloadsDuplicatePolicy ?? 'SKIP'
  };
}

/**
 * Registers the downloads folder with the library scanner when the user opted in.
 * Safe to call repeatedly: the ingestion pipeline ignores already-linked folders.
 */
export async function ensureDownloadsFolderInLibrary(): Promise<void> {
  const settings = await getUserSettings();
  if (!settings.onlineDownloadsFolder || !settings.addDownloadsToLibrary) return;

  const structure: FolderStructure = {
    path: settings.onlineDownloadsFolder,
    stats: {
      lastModifiedDate: new Date(),
      lastChangedDate: new Date(),
      fileCreatedDate: new Date(),
      lastParsedDate: new Date()
    },
    subFolders: []
  };

  await addMusicFromFolderStructures([structure]);
}

export function setupDownloadsIpc(publish: (snapshot: DownloadsSnapshot) => void): void {
  extractorInstance = new YtDlpExtractor();

  const root = stagingRoot();
  purgeStaleStaging(root);

  downloadManagerInstance = new DownloadManager({
    extractor: extractorInstance,
    stagingRoot: root,
    resolveSettings: resolveDownloadSettings,
    publish,
    onFileFinalized: markDownloadedFileDirty
  });

  // Cancel active downloads so spawned yt-dlp processes never outlive the app.
  app.once('before-quit', () => {
    try {
      downloadManagerInstance?.cancelAll();
    } catch (error) {
      logger.warn('[downloads] Failed to cancel downloads during shutdown.', { error });
    }
  });

  ipcMain.handle('downloads/search', (_, query: string, limit?: number): Promise<OnlineTrackResult[]> => {
    if (!query.trim()) return Promise.resolve([]);
    return extractorInstance!.search(query, { limit });
  });

  ipcMain.handle(
    'downloads/resolvePlaylist',
    (_, urlOrId: string): Promise<OnlinePlaylistInfo> => extractorInstance!.resolvePlaylist(urlOrId)
  );

  ipcMain.handle('downloads/enqueue', async (_, input: EnqueueDownloadInput) => {
    const result = await downloadManagerInstance!.enqueue(input);
    void ensureDownloadsFolderInLibrary().catch((error) =>
      logger.error('[downloads] Failed to link download folder with library.', { error })
    );
    return result;
  });

  ipcMain.handle(
    'downloads/enqueueMany',
    async (_, inputs: EnqueueDownloadInput[], playlistId?: string, playlistName?: string) => {
      const normalized = inputs.map((input) =>
        playlistId ? { ...input, playlistId, playlistName } : input
      );
      const result = await downloadManagerInstance!.enqueueMany(normalized);
      void ensureDownloadsFolderInLibrary().catch((error) =>
        logger.error('[downloads] Failed to link download folder with library.', { error })
      );
      return result;
    }
  );

  ipcMain.handle('downloads/cancel', (_, jobId: string) => downloadManagerInstance!.cancel(jobId));

  ipcMain.handle('downloads/getState', () => downloadManagerInstance!.getSnapshot());

  logger.info('[downloads] IPC handlers registered.');
}

/**
 * Nudges the library change tracker for scan modes without filesystem watchers
 * (startup/manual). In automatic mode watchers already handle ingestion; in
 * manual mode this only marks the library dirty so the UI indicates that a scan
 * will pick the file up — it never forces a scan against the user's choice.
 */
async function markDownloadedFileDirty(finalPath: string): Promise<void> {
  const settings = await getUserSettings();
  if (!settings.addDownloadsToLibrary) return;
  if (settings.libraryScanMode === 'automatic') return;

  libraryChangeTracker.markDirty({ path: finalPath, source: 'folder-watcher' });
}
