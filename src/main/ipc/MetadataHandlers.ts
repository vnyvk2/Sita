import { ipcMain } from 'electron';
import type { AlbumAutoTagService } from '../metadata/services/AlbumAutoTagService';
import type { LocalSongInput } from '../metadata/services/AlbumMetadataService';
import type { AlbumTagPreview } from '../metadata/models/AlbumTagPreview';
import type { MetadataProviderId } from '../metadata/models/RecordingMetadata';

export function registerMetadataHandlers(autoTagService: AlbumAutoTagService): void {
  // 1. Search Albums
  ipcMain.handle(
    'metadata/searchAlbums',
    async (_, albumName: string, artistName?: string, limit?: number) => {
      const signal = autoTagService.createAbortSignal();
      return autoTagService.searchReleases(albumName, artistName, limit, signal);
    }
  );

  // 2. Build AutoTag Preview Diff
  ipcMain.handle(
    'metadata/buildPreview',
    async (_, localSongs: LocalSongInput[], releaseId: string, providerId?: MetadataProviderId) => {
      const signal = autoTagService.createAbortSignal();
      return autoTagService.buildPreview(localSongs, releaseId, providerId, signal);
    }
  );

  // 3. Apply Preview Updates
  ipcMain.handle('metadata/applyPreview', async (_, preview: AlbumTagPreview) => {
    const signal = autoTagService.createAbortSignal();
    return autoTagService.applyPreview(preview, signal);
  });

  // 4. Undo Last AutoTag Operation
  ipcMain.handle('metadata/undoLastAutoTag', async () => {
    return autoTagService.undoLastAutoTag();
  });

  // 5. Cancel Active AutoTag Operation
  ipcMain.handle('metadata/cancelAutoTag', () => {
    autoTagService.cancel();
    return { cancelled: true };
  });
}
