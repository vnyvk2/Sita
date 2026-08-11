import type { PlaylistDto } from '@common/collections/dtos';

export function mapLegacyPlaylistToDto(playlist: Playlist): PlaylistDto {
  return {
    id: playlist.playlistId,
    name: playlist.name,
    description: null,
    playlistType: 'standard',
    parentId: null,
    isPinned: false,
    artworkPath: playlist.artworkPaths?.artworkPath ?? null,
    itemCount: playlist.songs ? playlist.songs.length : 0,
    totalDuration: 0,
    createdAt: playlist.createdDate ? playlist.createdDate.toISOString() : new Date().toISOString(),
    updatedAt: playlist.createdDate ? playlist.createdDate.toISOString() : new Date().toISOString()
  };
}
