import { ipcMain } from 'electron';
import type { PlaylistEngine } from '../engine/PlaylistEngine';
import type { UndoEngine } from '../engine/UndoEngine';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { HierarchyService } from '../engine/HierarchyService';
import { collectionEventBus } from '../events/CollectionEventBus';
import { mapPlaylistToDto, mapEntryToDto } from './dtos';
import { parseCollectionUri } from '../../../common/collections/id';

export function setupCollectionIpc(
  engine: PlaylistEngine,
  undoEngine: UndoEngine,
  repository: PlaylistRepository,
  hierarchyService: HierarchyService,
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

  ipcMain.handle('collections/read/getEntries', async (_, id: number, offset: number, limit: number) => {
    const entries = await repository.getEntries(id); 
    return entries.slice(offset, offset + limit).map(mapEntryToDto);
  });

  ipcMain.handle('collections/read/getBreadcrumbs', async (_, id: number) => {
    const ancestors = await hierarchyService.getAncestors(id);
    return ancestors; 
  });

  // Write Endpoints
  ipcMain.handle('collections/write/createFolder', async (_, input) => {
    const result = await engine.createFolder(input);
    const playlist = await repository.getById(result);
    return playlist ? mapPlaylistToDto(playlist) : null;
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
    return await engine.bulkDelete(input);
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

  // History Endpoints
  ipcMain.handle('collections/history/undo', async (_, collectionId: string) => {
    return await undoEngine.undo(parseCollectionUri(collectionId));
  });

  ipcMain.handle('collections/history/redo', async (_, collectionId: string) => {
    return await undoEngine.redo(parseCollectionUri(collectionId));
  });

  // Event Forwarding
  collectionEventBus.onEvent((event) => {
    sendMessageToRenderer('collections/event', event);
  });
}
