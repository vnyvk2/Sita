export interface CreateFolderInput {
  name: string;
  parentId?: number | null;
}

export interface CreatePlaylistInput {
  name: string;
  parentId?: number | null;
}

export interface AddSongsInput {
  playlistId: number;
  songIds: readonly number[];
  insertAt?: number;
}

export interface RemoveSongsInput {
  playlistId: number;
  songIds: readonly number[];
}

export interface ReorderSongsInput {
  playlistId: number;
  entryId: number;
  newPosition: number;
}

export interface RenameInput {
  collectionId: number;
  name: string;
}

export interface MoveCollectionInput {
  collectionId: number;
  targetParentId: number | null;
  sidebarPosition?: number;
}

export interface DeleteInput {
  collectionId: number;
}

export interface DuplicateInput {
  collectionId: number;
}

export interface MergePlaylistsInput {
  sourceIds: number[];
  targetId: number;
}

export interface BulkDeleteInput {
  collectionIds: number[];
}

export interface BulkRestoreInput {
  collectionIds: number[];
}

export interface PinInput {
  collectionId: number;
}

export interface UnpinInput {
  collectionId: number;
}

export type CollectionEvent =
  | { type: 'CollectionCreated'; payload: { collectionId: number; parentId: number | null } }
  | { type: 'CollectionRenamed'; payload: { collectionId: number; newName: string } }
  | { type: 'CollectionMoved'; payload: { collectionId: number; newParentId: number | null } }
  | { type: 'CollectionPinned'; payload: { collectionId: number } }
  | { type: 'CollectionUnpinned'; payload: { collectionId: number } }
  | { type: 'CollectionDeleted'; payload: { collectionId: number } }
  | { type: 'CollectionChanged'; payload: { collectionId: number } }
  | { type: 'SmartPlaylistUpdated'; payload: { collectionId: number } }
  | { type: 'UndoExecuted'; payload: Record<string, never> }
  | { type: 'RedoExecuted'; payload: Record<string, never> };
