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
