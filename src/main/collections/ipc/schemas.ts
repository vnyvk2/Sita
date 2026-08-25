import { z } from 'zod';

/**
 * Runtime validation for collection IPC inputs. The renderer is trusted for UX purposes only -
 * every payload crossing the boundary is parsed here before it reaches the engine/repositories so
 * malformed or hostile values fail fast instead of corrupting stored positions/state.
 */

const int = z.number().int();
const playlistIdSchema = int;
const optionalParentId = int.nullable().optional();

export const createFolderInputSchema = z.object({
  name: z.string().min(1),
  parentId: optionalParentId
});

export const createPlaylistInputSchema = z.object({
  name: z.string().min(1),
  parentId: optionalParentId
});

export const addSongsInputSchema = z.object({
  playlistId: playlistIdSchema,
  songIds: z.array(int).min(1),
  insertAt: int.optional()
});

export const removeSongsInputSchema = z.object({
  playlistId: playlistIdSchema,
  entryIds: z.array(int).min(1)
});

export const reorderInputSchema = z.object({
  playlistId: playlistIdSchema,
  entryId: int,
  newPosition: int
});

export const renameInputSchema = z.object({
  playlistId: playlistIdSchema,
  newName: z.string().min(1)
});

export const moveCollectionInputSchema = z.object({
  playlistIds: z.array(int).min(1),
  targetParentId: int.nullable(),
  sidebarPosition: int.optional()
});

export const deleteInputSchema = z.object({
  playlistId: playlistIdSchema
});

export const duplicateInputSchema = z.object({
  playlistId: playlistIdSchema
});

export const mergePlaylistsInputSchema = z.object({
  sourcePlaylistIds: z.array(int).min(1),
  targetPlaylistId: playlistIdSchema
});

export const bulkDeleteInputSchema = z.object({
  playlistIds: z.array(int).min(1)
});

export const bulkRestoreInputSchema = z.object({
  restores: z
    .object({
      playlist: z.record(z.string(), z.unknown()),
      entries: z.array(z.record(z.string(), z.unknown()))
    })
    .array()
});

export const pinUnpinInputSchema = z.object({
  playlistId: playlistIdSchema
});

export const setArtworkInputSchema = z.object({
  playlistId: playlistIdSchema,
  artworkPath: z.string().optional(),
  artworkId: int.optional(),
  processedArtwork: z.unknown().optional()
});

export const idParamSchema = int;
export const historyUriSchema = z.string().min(1);
