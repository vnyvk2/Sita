export type CollectionType =
  | 'playlist'
  | 'album'
  | 'artist'
  | 'genre'
  | 'folder'
  | 'favorites'
  | 'history'
  | 'queue'
  | 'search'
  | 'smartPlaylist';

export type CollectionSource = 'local' | 'remote' | 'search' | 'queue' | 'generated';

export type PlaylistViewMode =
  | 'customOrder'
  | 'originalOrder'
  | 'aToZ'
  | 'zToA'
  | 'dateAddedAscending'
  | 'dateAddedDescending'
  | 'dateModifiedAscending'
  | 'dateModifiedDescending'
  | 'releasedYearAscending'
  | 'releasedYearDescending'
  | 'trackNoAscending'
  | 'trackNoDescending'
  | 'artistNameAscending'
  | 'artistNameDescending'
  | 'allTimeMostListened'
  | 'allTimeLeastListened'
  | 'monthlyMostListened'
  | 'monthlyLeastListened'
  | 'albumNameAscending'
  | 'albumNameDescending'
  | 'mostSkipped'
  | 'leastSkipped'
  | 'blacklistedSongs'
  | 'whitelistedSongs';

export interface CollectionId {
  uri: string;
  source: CollectionSource;
  type: CollectionType;
  key: string | number;
}

export interface CollectionCapabilities {
  canRename: boolean;
  canDelete: boolean;
  canReorder: boolean;
  canAddSongs: boolean;
  canRemoveSongs: boolean;
  canExport: boolean;
  canImport: boolean;
  canPin: boolean;
  supportsUndo: boolean;
  supportsDragDrop: boolean;
  supportsRules: boolean;
  supportsHierarchy: boolean;
}

export type CollectionState = 'loading' | 'ready' | 'error' | 'syncing';

export interface CollectionStats {
  totalEntries: number;
  totalDuration: number;
  uniqueArtists: number;
  uniqueAlbums: number;
}

export interface CollectionEntry {
  entryId: number | string;
  song: SongData;
  position: number;
  addedAt: Date | string;
}

export interface Collection {
  id: CollectionId;
  title: string;
  description?: string;
  icon: string;
  state: CollectionState;
  capabilities: CollectionCapabilities;
  artworkPaths?: {
    isDefaultArtwork: boolean;
    artworkPath: string;
    optimizedArtworkPath: string;
  };
  stats: CollectionStats;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type PlaylistExportFormat = 'm3u' | 'm3u8';

export interface PlaylistExportOptions {
  format: PlaylistExportFormat;
  order: 'customOrder' | 'originalOrder';
  pathType: 'absolute' | 'relative';
  includeExtInf?: boolean;
}

export interface PlaylistImportIpcOptions {
  targetPlaylistId?: number;
  filePath?: string;
  mode?: 'create' | 'merge' | 'replace';
}

export interface PlaylistImportAnalysis {
  filePath: string;
  playlistName: string;
  totalEntries: number;
  skippedCount: number;
  repairedCount: number;
}

