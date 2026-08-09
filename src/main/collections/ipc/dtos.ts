import type { PlaylistDto, PlaylistEntryDto } from '../../../common/collections/dtos';

export function mapPlaylistToDto(playlist: any): PlaylistDto {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    playlistType: playlist.playlistType,
    parentId: playlist.parentId,
    itemCount: playlist.itemCount,
    totalDuration: typeof playlist.totalDuration === 'string' ? parseFloat(playlist.totalDuration) : playlist.totalDuration,
    isPinned: playlist.pinnedAt !== null,
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
