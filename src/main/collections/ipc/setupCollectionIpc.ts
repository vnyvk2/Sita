import { ipcMain, dialog } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { z } from 'zod';

import { parseCollectionUri } from '../../../common/collections/id';
import type { PlaylistViewMode } from '../../../common/collections/types';
import logger from '../../logger';
import type { HierarchyService } from '../engine/HierarchyService';
import type { PlaylistEngine } from '../engine/PlaylistEngine';
import type { UndoEngine } from '../engine/UndoEngine';
import { collectionEventBus } from '../events/CollectionEventBus';
import type { BulkRestoreInput } from '../operations/BulkDeleteOp';
import type { SetArtworkInput } from '../operations/SetArtworkOp';
import { CollectionArtworkRepository } from '../repositories/CollectionArtworkRepository';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import { mapPlaylistToDto, mapEntryToDto } from './dtos';
import {
  addSongsInputSchema,
  bulkDeleteInputSchema,
  bulkRestoreInputSchema,
  createFolderInputSchema,
  createPlaylistInputSchema,
  deleteInputSchema,
  duplicateInputSchema,
  historyUriSchema,
  idParamSchema,
  mergePlaylistsInputSchema,
  moveCollectionInputSchema,
  pinUnpinInputSchema,
  removeSongsInputSchema,
  renameInputSchema,
  reorderInputSchema,
  setArtworkInputSchema,
  createSmartPlaylistInputSchema,
  updateSmartPlaylistInputSchema,
  previewSmartPlaylistInputSchema
} from './schemas';

/** Parses an IPC payload against a schema, failing with a descriptive error. */
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid collections IPC payload: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`
    );
  }
  return result.data;
}

export function setupCollectionIpc(
  engine: PlaylistEngine,
  undoEngine: UndoEngine,
  repository: PlaylistRepository,
  hierarchyService: HierarchyService,
  sendMessageToRenderer: (channel: string, ...args: any[]) => void
) {
  // Read Endpoints
  ipcMain.handle('collections/read/getCollection', async (_, id: number) => {
    const safeId = parse(idParamSchema, id);
    const playlist = await repository.getById(safeId);
    return playlist ? mapPlaylistToDto(playlist) : null;
  });

  ipcMain.handle('collections/read/getChildren', async (_, id: number | null) => {
    const safeId = id === null ? null : parse(idParamSchema, id);
    const children = await repository.getChildren(safeId);
    return children.map(mapPlaylistToDto);
  });

  ipcMain.handle(
    'collections/read/getEntries',
    async (_, id: number, offset?: number, limit?: number, sortType?: PlaylistViewMode) => {
      const safeId = parse(idParamSchema, id);
      const safeOffset = offset === undefined ? undefined : parse(idParamSchema, offset);
      const safeLimit = limit === undefined ? undefined : parse(idParamSchema, limit);
      const entries = await repository.getEntries(safeId, {
        limit: safeLimit,
        offset: safeOffset,
        sortType
      });
      return entries.map(mapEntryToDto);
    }
  );

  ipcMain.handle('collections/read/getBreadcrumbs', async (_, id: number) => {
    const ancestors = await hierarchyService.getAncestors(parse(idParamSchema, id));
    return ancestors;
  });

  ipcMain.handle('collections/read/getArtworks', async (_, songIds: number[]) => {
    return await CollectionArtworkRepository.getArtworks(songIds);
  });

  ipcMain.handle('collections/read/getSmartRule', async (_, playlistId: number) => {
    const safeId = parse(idParamSchema, playlistId);
    return await repository.getSmartRule(safeId);
  });

  ipcMain.handle('collections/read/previewSmartPlaylist', async (_, input) => {
    const safeInput = parse(previewSmartPlaylistInputSchema, input);
    return await engine.previewSmartPlaylist(safeInput.definition, safeInput.maxEntries);
  });

  // Write Endpoints
  ipcMain.handle('collections/write/createFolder', async (_, input) => {
    const result = await engine.createFolder(parse(createFolderInputSchema, input));
    const playlist = await repository.getById(result);
    return playlist ? mapPlaylistToDto(playlist) : null;
  });

  ipcMain.handle('collections/write/createPlaylist', async (_, input) => {
    const result = await engine.createPlaylist(parse(createPlaylistInputSchema, input));
    const playlist = await repository.getById(result);
    return playlist ? mapPlaylistToDto(playlist) : null;
  });

  ipcMain.handle('collections/write/createSmartPlaylist', async (_, input) => {
    const safeInput = parse(createSmartPlaylistInputSchema, input);
    const result = await engine.createSmartPlaylist(safeInput);
    const playlist = await repository.getById(result);
    return playlist ? mapPlaylistToDto(playlist) : null;
  });

  ipcMain.handle('collections/write/updateSmartPlaylist', async (_, input) => {
    const safeInput = parse(updateSmartPlaylistInputSchema, input);
    return await engine.updateSmartPlaylist(safeInput);
  });

  ipcMain.handle('collections/write/reorder', async (_, input) => {
    return await engine.reorderSongs(parse(reorderInputSchema, input));
  });

  ipcMain.handle('collections/write/addSongs', async (_, input) => {
    return await engine.addSongs(parse(addSongsInputSchema, input));
  });

  ipcMain.handle('collections/write/removeSongs', async (_, input) => {
    return await engine.removeSongs(parse(removeSongsInputSchema, input));
  });

  ipcMain.handle('collections/write/rename', async (_, input) => {
    return await engine.renamePlaylist(parse(renameInputSchema, input));
  });

  ipcMain.handle('collections/write/move', async (_, input) => {
    return await engine.moveCollection(parse(moveCollectionInputSchema, input));
  });

  ipcMain.handle('collections/write/delete', async (_, input) => {
    return await engine.deletePlaylist(parse(deleteInputSchema, input));
  });

  ipcMain.handle('collections/write/duplicate', async (_, input) => {
    return await engine.duplicatePlaylist(parse(duplicateInputSchema, input));
  });

  ipcMain.handle('collections/write/merge', async (_, input) => {
    return await engine.mergePlaylists(parse(mergePlaylistsInputSchema, input));
  });

  ipcMain.handle('collections/write/bulkDelete', async (_, input) => {
    logger.info('[IPC] collections/write/bulkDelete called', { input });
    try {
      const result = await engine.bulkDelete(parse(bulkDeleteInputSchema, input));
      logger.info('[IPC] collections/write/bulkDelete success', { result });
      return result;
    } catch (error) {
      logger.error('[IPC] collections/write/bulkDelete error', { error, input });
      throw error;
    }
  });

  ipcMain.handle('collections/write/bulkRestore', async (_, input) => {
    // Structural validation only; the executor owns the deep shape of restores.
    parse(bulkRestoreInputSchema, input);
    return await engine.bulkRestore(input as BulkRestoreInput);
  });

  ipcMain.handle('collections/write/pin', async (_, input) => {
    return await engine.pinPlaylist(parse(pinUnpinInputSchema, input));
  });

  ipcMain.handle('collections/write/unpin', async (_, input) => {
    return await engine.unpinPlaylist(parse(pinUnpinInputSchema, input));
  });

  ipcMain.handle('collections/write/setArtwork', async (_, input) => {
    // Core fields validated; binary payload shape is owned by SetArtworkOp.
    parse(setArtworkInputSchema, input);
    return await engine.setArtwork(input as SetArtworkInput);
  });
  // History Endpoints
  ipcMain.handle('collections/history/undo', async (_, collectionId: string) => {
    const uri = parse(historyUriSchema, collectionId) || 'local://playlist/0';
    return await undoEngine.undo(parseCollectionUri(uri));
  });

  ipcMain.handle('collections/history/redo', async (_, collectionId: string) => {
    const uri = parse(historyUriSchema, collectionId) || 'local://playlist/0';
    return await undoEngine.redo(parseCollectionUri(uri));
  });

  // Event Forwarding
  collectionEventBus.onEvent((event) => {
    sendMessageToRenderer('collections/event', event);
  });

  ipcMain.handle('utils/showOpenDialog', async (_, options?: OpenDialogOptions) => {
    return await dialog.showOpenDialog(options || {});
  });
}
