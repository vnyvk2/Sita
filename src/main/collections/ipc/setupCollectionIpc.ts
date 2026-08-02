import { ipcMain } from 'electron';
import type { PlaylistEngine } from '../engine/PlaylistEngine';
import type { UndoEngine } from '../engine/UndoEngine';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { HierarchyService } from '../engine/HierarchyService';
import type { PlaylistImportWorkflow } from '../../playlistImport/workflow/PlaylistImportWorkflow';
import { collectionEventBus } from '../events/CollectionEventBus';
import { mapPlaylistToDto, mapEntryToDto } from './dtos';
import { parseCollectionUri } from '../../../common/collections/id';

import { ExportService } from '../../playlistExport/services/ExportService';
import importPlaylist, { analyzePlaylistImport } from '../../core/importPlaylist';
import addArtworkToAPlaylist from '../../core/addArtworkToAPlaylist';
import { CollectionArtworkRepository } from '../repositories/CollectionArtworkRepository';
import type { OpenDialogOptions } from 'electron';
import { showOpenDialog } from '../../main';
import type { PlaylistViewMode, PlaylistExportOptions, PlaylistImportIpcOptions, PlaylistBatchExportOptions } from '../../../common/collections/types';
import logger from '../../logger';

export function setupCollectionIpc(
  engine: PlaylistEngine,
  undoEngine: UndoEngine,
  repository: PlaylistRepository,
  hierarchyService: HierarchyService,
  workflow: PlaylistImportWorkflow,
  sendMessageToRenderer: (channel: string, ...args: any[]) => void
) {
  // Read Endpoints
  ipcMain.handle('collections/read/getCollection', async (_, id: number) => {
    const playlist = await repository.getById(id);
    return playlist ? mapPlaylistToDto(playlist) : null;
  });

  ipcMain.handle('collections/read/getChildren', async (_, id: number) => {
    const children = await repository.getChildren(id);
    return children.map(mapPlaylistToDto);
  });

  ipcMain.handle('collections/read/getEntries', async (_, id: number, offset?: number, limit?: number, sortType?: PlaylistViewMode) => {
    const entries = await repository.getEntries(id, { limit, offset, sortType });
    return entries.map(mapEntryToDto);
  });

  ipcMain.handle('collections/read/getBreadcrumbs', async (_, id: number) => {
    const ancestors = await hierarchyService.getAncestors(id);
    return ancestors; 
  });

  ipcMain.handle('collections/read/getArtworks', async (_, songIds: number[]) => {
    return await CollectionArtworkRepository.getArtworks(songIds);
  });

  // Write Endpoints
  ipcMain.handle('collections/write/createFolder', async (_, input) => {
    const result = await engine.createFolder(input);
    const playlist = await repository.getById(result);
    return playlist ? mapPlaylistToDto(playlist) : null;
  });

  ipcMain.handle('collections/write/createPlaylist', async (_, input) => {
    const result = await engine.createPlaylist(input);
    const playlist = await repository.getById(result);
    return playlist ? mapPlaylistToDto(playlist) : null;
  });

  ipcMain.handle('collections/write/reorder', async (_, input: { playlistId: number; entryId: number; newPosition: number }) => {
    return await engine.reorderSongs(input);
  });

  ipcMain.handle('collections/write/addSongs', async (_, input) => {
    return await engine.addSongs(input);
  });

  ipcMain.handle('collections/write/removeSongs', async (_, input) => {
    return await engine.removeSongs(input);
  });

  ipcMain.handle('collections/write/rename', async (_, input) => {
    return await engine.renamePlaylist(input);
  });

  ipcMain.handle('collections/write/move', async (_, input) => {
    return await engine.moveCollection(input);
  });

  ipcMain.handle('collections/write/delete', async (_, input) => {
    return await engine.deletePlaylist(input);
  });

  ipcMain.handle('collections/write/duplicate', async (_, input) => {
    return await engine.duplicatePlaylist(input);
  });

  ipcMain.handle('collections/write/merge', async (_, input) => {
    return await engine.mergePlaylists(input);
  });

  ipcMain.handle('collections/write/bulkDelete', async (_, input) => {
    logger.info('[IPC] collections/write/bulkDelete called', { input });
    try {
      const result = await engine.bulkDelete(input);
      logger.info('[IPC] collections/write/bulkDelete success', { result });
      return result;
    } catch (error) {
      logger.error('[IPC] collections/write/bulkDelete error', { error, input });
      throw error;
    }
  });

  ipcMain.handle('collections/write/bulkRestore', async (_, input) => {
    return await engine.bulkRestore(input);
  });
  
  ipcMain.handle('collections/write/pin', async (_, input) => {
    return await engine.pinPlaylist(input);
  });

  ipcMain.handle('collections/write/unpin', async (_, input) => {
    return await engine.unpinPlaylist(input);
  });

  ipcMain.handle('collections/write/setArtwork', async (_, input: { playlistId: number, artworkPath: string }) => {
    // Delegate to existing legacy implementation
    return await addArtworkToAPlaylist(input.playlistId, input.artworkPath);
  });

  // History Endpoints
  ipcMain.handle('collections/history/undo', async (_, collectionId: string) => {
    const uri = collectionId || 'local://playlist/0';
    return await undoEngine.undo(parseCollectionUri(uri));
  });

  ipcMain.handle('collections/history/redo', async (_, collectionId: string) => {
    const uri = collectionId || 'local://playlist/0';
    return await undoEngine.redo(parseCollectionUri(uri));
  });

  // Event Forwarding
  collectionEventBus.onEvent((event) => {
    sendMessageToRenderer('collections/event', event);
  });

  // Import / Export
  const exportService = new ExportService(repository);

  ipcMain.handle('collections/export', async (_, playlistId: number, options?: PlaylistExportOptions) => {
    return await exportService.exportPlaylist(playlistId, options || { format: 'm3u8', order: 'customOrder', pathType: 'absolute' });
  });

  ipcMain.handle('collections/export-batch', async (_, playlistIds: number[], options?: PlaylistBatchExportOptions) => {
    return await exportService.exportPlaylists(playlistIds, options);
  });

  ipcMain.handle('collections/analyze', async (_, filePath?: string) => {
    return await analyzePlaylistImport(workflow, filePath);
  });

  ipcMain.handle('collections/import', async (_, options?: PlaylistImportIpcOptions) => {
    return await importPlaylist(workflow, options);
  });

  ipcMain.handle('utils/showOpenDialog', async (_, options?: OpenDialogOptions) => {
    return await showOpenDialog(options);
  });
}
