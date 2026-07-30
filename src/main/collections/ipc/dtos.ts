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

export function mapPlaylistToDto(playlist: any): PlaylistDto {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    playlistType: playlist.playlistType,
    parentId: playlist.parentId,
    itemCount: playlist.itemCount,
    totalDuration: typeof playlist.totalDuration === 'string' ? parseFloat(playlist.totalDuration) : playlist.totalDuration,
    isPinned: playlist.isPinned ?? false,
    artworkPath: playlist.artworkPath,
    createdAt: playlist.createdAt.toISOString(),
    updatedAt: playlist.updatedAt.toISOString(),
  };
}

export function mapEntryToDto(row: any): PlaylistEntryDto {
  const entry = row.entry || row; // fallback in case it's passed directly
  return {
    id: entry.id,
    playlistId: entry.playlistId,
    songId: entry.songId,
    position: entry.position,
    addedAt: entry.addedAt.toISOString(),
  };
}
