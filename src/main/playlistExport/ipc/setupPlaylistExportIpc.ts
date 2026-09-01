import { ipcMain } from 'electron';

import type {
  PlaylistExportOptions,
  PlaylistBatchExportOptions
} from '../../../common/collections/types';
import type { PlaylistRepository } from '../../collections/repositories/PlaylistRepository';
import { ExportService } from '../services/ExportService';

export function setupPlaylistExportIpc(repository: PlaylistRepository): void {
  const exportService = new ExportService(repository);

  ipcMain.handle(
    'collections/export',
    async (_, playlistId: number, options?: PlaylistExportOptions) => {
      return await exportService.exportPlaylist(
        playlistId,
        options || { format: 'm3u8', order: 'customOrder', pathType: 'absolute' }
      );
    }
  );

  ipcMain.handle(
    'collections/export-batch',
    async (_, playlistIds: number[], options?: PlaylistBatchExportOptions) => {
      return await exportService.exportPlaylists(playlistIds, options);
    }
  );
}
