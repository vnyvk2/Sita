import type { PlaylistViewMode } from '@common/collections/types';
import type { 
  CreateFolderInput,
  CreatePlaylistInput,
  AddSongsInput,
  RemoveSongsInput,
  ReorderSongsInput,
  RenameInput,  
  MoveCollectionInput, 
  DeleteInput, 
  DuplicateInput,
  MergePlaylistsInput,
  BulkDeleteInput,
  BulkRestoreInput,
  PinInput,
  UnpinInput,
  CollectionEvent
} from './CollectionTypes';

export const CollectionClient = {
  // Read
  getCollection: (id: number) => window.api.collections.read.getCollection(id),
  getChildren: (id: number | null) => window.api.collections.read.getChildren(id),
  getEntries: (id: number, offset?: number, limit?: number, sortType?: PlaylistViewMode) => window.api.collections.read.getEntries(id, offset, limit, sortType),
  getBreadcrumbs: (id: number) => window.api.collections.read.getBreadcrumbs(id),
  getArtworks: (songIds: number[]) => window.api.collections.read.getArtworks(songIds),

  // Write
  createFolder: (input: CreateFolderInput) => window.api.collections.write.createFolder(input),
  createPlaylist: (input: CreatePlaylistInput) => window.api.collections.write.createPlaylist(input),
  addSongs: (input: AddSongsInput) => window.api.collections.write.addSongs(input),
  removeSongs: (input: RemoveSongsInput) => window.api.collections.write.removeSongs(input),
  reorderSongs: (input: ReorderSongsInput) => window.api.collections.write.reorder(input),
  rename: (input: RenameInput) => window.api.collections.write.rename(input),
  move: (input: MoveCollectionInput) => window.api.collections.write.move(input),
  delete: (input: DeleteInput) => window.api.collections.write.delete(input),
  duplicate: (input: DuplicateInput) => window.api.collections.write.duplicate(input),
  merge: (input: MergePlaylistsInput) => window.api.collections.write.merge(input),
  bulkDelete: (input: BulkDeleteInput) => window.api.collections.write.bulkDelete(input),
  bulkRestore: (input: BulkRestoreInput) => window.api.collections.write.bulkRestore(input),
  pin: (input: PinInput) => window.api.collections.write.pin(input),
  unpin: (input: UnpinInput) => window.api.collections.write.unpin(input),
  setArtwork: (playlistId: number, artworkPath: string) => window.api.collections.write.setArtwork(playlistId, artworkPath),

  // History
  undo: (collectionId: string) => window.api.collections.history.undo(collectionId),
  redo: (collectionId: string) => window.api.collections.history.redo(collectionId),

  // Events
  onEvent: (callback: (e: unknown, event: CollectionEvent) => void) => window.api.collections.events.onEvent(callback as any),
  offEvent: (callback: (e: unknown, event: CollectionEvent) => void) => window.api.collections.events.offEvent(callback as any),

  // Import / Export
  export: (playlistId: number) => window.api.collections.export(playlistId),
  import: (targetPlaylistId?: number) => window.api.collections.import(targetPlaylistId),
};
