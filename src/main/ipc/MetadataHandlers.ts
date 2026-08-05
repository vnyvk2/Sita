import { ipcMain, type BrowserWindow } from 'electron';
import type { AlbumAutoTagService } from '../metadata/services/AlbumAutoTagService';
import type { LocalSongInput } from '../metadata/services/AlbumMetadataService';
import type { AlbumTagPreview, ApplyPreviewOptions, ProgressEventPayload } from '../metadata/models/AlbumTagPreview';
import type { MetadataProviderId } from '../metadata/models/RecordingMetadata';

const activeProgressListeners = new WeakSet<AlbumAutoTagService>();

export function registerMetadataHandlers(autoTagService: AlbumAutoTagService, mainWindow?: BrowserWindow): void {
  // Listen for progress events from AlbumAutoTagService and send over IPC to renderer
  if (!activeProgressListeners.has(autoTagService)) {
    activeProgressListeners.add(autoTagService);
    autoTagService.on('progress', (payload: ProgressEventPayload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('metadata/progress', payload);
      }
    });
  }

  // 1. Search Albums
  ipcMain.handle(
    'metadata/searchAlbums',
    async (_, albumName: string, artistName?: string, limit?: number, operationId = 'default') => {
      const signal = autoTagService.createAbortSignal(operationId);
      return autoTagService.searchReleases(albumName, artistName, limit, signal, operationId);
    }
  );

  // 2. Build AutoTag Preview Diff
  ipcMain.handle(
    'metadata/buildPreview',
    async (_, localSongs: LocalSongInput[], releaseId: string, providerId?: MetadataProviderId, operationId = 'default') => {
      const signal = autoTagService.createAbortSignal(operationId);
      return autoTagService.buildPreview(localSongs, releaseId, providerId, signal, operationId);
    }
  );

  // 3. Apply Preview Updates
  ipcMain.handle('metadata/applyPreview', async (_, preview: AlbumTagPreview, options?: ApplyPreviewOptions, operationId = 'default') => {
    const signal = autoTagService.createAbortSignal(operationId);
    return autoTagService.applyPreview(preview, options, signal, operationId);
  });

  // 4. Undo Last AutoTag Operation
  ipcMain.handle('metadata/undoLastAutoTag', async (_, operationId = 'default') => {
    return autoTagService.undoLastAutoTag(operationId);
  });

  // 5. Cancel Active AutoTag Operation
  ipcMain.handle('metadata/cancelAutoTag', (_, operationId = 'default') => {
    autoTagService.cancel(operationId);
    return { cancelled: true };
  });
}
