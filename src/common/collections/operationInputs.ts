import type { SmartPlaylistDefinition } from './smartPlaylist';

export interface RestoreSongsInput {
  playlistId: number;
  entries: {
    playlistId: number;
    songId: number;
    position: number;
    source: string;
    createdAt?: Date;
  }[];
}

export interface RestorePlaylistInput {
  playlist: {
    id: number;
    name: string;
    description?: string | null;
    parentId?: number | null;
    playlistType: string;
    itemCount: number;
    totalDuration: string;
    sidebarPosition?: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  entries: RestoreSongsInput['entries'];
  smartRule?: {
    ruleAst: any;
    sortDefinition: any;
    maxEntries?: number | null;
    ruleVersion?: number;
  };
}

export interface CreateFolderInput {
  name: string;
  parentId?: number | null;
}

export interface CreatePlaylistInput {
  name: string;
  parentId?: number | null;
}

export interface CreateSmartPlaylistInput {
  name: string;
  parentId?: number | null;
  definition: SmartPlaylistDefinition;
  maxEntries?: number | null;
}

export interface UpdateSmartPlaylistInput {
  playlistId: number;
  name?: string;
  definition: SmartPlaylistDefinition;
  maxEntries?: number | null;
}

export interface AddSongsInput {
  playlistId: number;
  songIds: readonly number[];
  insertAt?: number;
}

export interface RemoveSongsInput {
  playlistId: number;
  entryIds: readonly number[];
}

export interface ReorderInput {
  playlistId: number;
  entryId: number;
  newPosition: number;
}

export interface RenameInput {
  playlistId: number;
  newName: string;
}

export interface MoveCollectionInput {
  playlistIds: number[];
  targetParentId: number | null;
  sidebarPosition?: number; // Preserved for renderer
}

export interface DeleteInput {
  playlistId: number;
}

export interface DuplicateInput {
  playlistId: number;
}

export interface MergePlaylistsInput {
  sourcePlaylistIds: number[];
  targetPlaylistId: number;
}

export interface BulkDeleteInput {
  playlistIds: number[];
}

export interface BulkRestoreInput {
  restores: RestorePlaylistInput[];
}

export interface PinInput {
  playlistId: number;
}

export interface UnpinInput {
  playlistId: number;
}

/**
 * Canonical collection event contract. Mirrors exactly what the main process emits (see
 * PlaylistEngine / EnginePlaylistPersistence) - variants that are not emitted anywhere must not be
 * added back without an emitter.
 */
export type CollectionEvent =
  | { type: 'CollectionCreated'; payload: { collectionId: number; parentId: number | null } }
  | { type: 'CollectionMoved'; payload: { collectionId: number; newParentId: number | null } }
  | { type: 'CollectionPinned'; payload: { collectionId: number; isPinned: boolean } }
  | { type: 'CollectionChanged'; payload: { collectionId?: number; action?: string } }
  | { type: 'CollectionDeleted'; payload: { collectionIds: number[] } };
