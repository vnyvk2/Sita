export interface PlaylistDto {
  id: number;
  name: string;
  description: string | null;
  playlistType: 'standard' | 'smart' | 'folder';
  parentId: number | null;
  itemCount: number;
  totalDuration: number;
  isPinned: boolean;
  artworkPath: string | null;
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
}

export interface PlaylistEntryDto {
  id: number;
  playlistId: number;
  songId: number;
  position: number;
  addedAt: string; // ISO String
}

export interface CollectionHierarchyNodeDto {
  id: number;
  parentId: number | null;
  name: string;
  playlistType: string;
}

export interface CollectionEventDto {
  type: string;
  payload: any;
}

import type { PlaylistViewMode } from './types';

export interface PlaylistCatalogOptions {
  sortType?: PlaylistViewMode;
  filterType?: SongFilterTypes;
  keyword?: string;
  language?: string;
}

export interface PlaylistCatalogEntry {
  entryId: number;
  songId: number;
}

export interface PlaylistCatalogResult {
  entries: PlaylistCatalogEntry[];
  total: number;
  totalDuration?: number;
  blacklistedIds: number[];
  languages: string[];
  alphabetMap?: Record<string, number>;
  letterCounts?: Record<string, number>;
}

