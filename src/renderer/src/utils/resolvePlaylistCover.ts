import type { PlaylistDto } from '@main/collections/ipc/dtos';
import type { PlaylistCoverSettings, ResolvedPlaylistCover } from '../types/playlistCover';

export function resolvePlaylistCover(
  playlist: PlaylistDto,
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = []
): ResolvedPlaylistCover {
  // 1. If auto mode or no custom collage settings provided: default to taking first 4 playlist song artworks
  if (!settings || settings.type === 'auto' || !settings.collage) {
    const defaultSongs = playlistSongs.slice(0, 4);
    const artworks = defaultSongs
      .map((s) => s.artworkPaths?.artworkPath)
      .filter((path): path is string => Boolean(path));
    return { layout: 'grid', artworks };
  }

  const { layout = 'grid', size = 4, songIds = [] } = settings.collage;
  const songMap = new Map<number, SongData>();
  for (const song of playlistSongs) {
    songMap.set(song.songId, song);
  }

  // 2. Validate requested songIds against available playlist songs
  const validSelectedSongs: SongData[] = [];
  for (const id of songIds) {
    const found = songMap.get(id);
    if (found && validSelectedSongs.length < size) {
      validSelectedSongs.push(found);
    }
  }

  // 3. Fill missing slots if selected songs were deleted or fewer than requested size
  if (validSelectedSongs.length < size) {
    const selectedSet = new Set(validSelectedSongs.map((s) => s.songId));
    for (const song of playlistSongs) {
      if (validSelectedSongs.length >= size) break;
      if (!selectedSet.has(song.songId)) {
        validSelectedSongs.push(song);
        selectedSet.add(song.songId);
      }
    }
  }

  const artworks = validSelectedSongs
    .map((s) => s.artworkPaths?.artworkPath)
    .filter((path): path is string => Boolean(path));

  return { layout, artworks };
}
