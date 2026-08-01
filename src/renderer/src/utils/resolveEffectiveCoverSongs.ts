import type { PlaylistCoverSettings } from '../types/playlistCover';

export function resolveEffectiveCoverSongs(
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = [],
  maxSize: number = 4
): SongData[] {
  const songMap = new Map<number, SongData>();
  for (const song of playlistSongs) {
    if (song && song.songId !== undefined) {
      songMap.set(song.songId, song);
    }
  }

  // 1. If auto mode or no custom collage settings provided: default to taking first N playlist songs
  if (!settings || settings.type === 'auto' || !settings.collage) {
    return playlistSongs.slice(0, Math.min(4, maxSize));
  }

  const { size = maxSize, songIds = [] } = settings.collage;
  const targetSize = Math.min(size, maxSize);

  // 2. Validate requested songIds against available playlist songs
  const validSelectedSongs: SongData[] = [];
  for (const id of songIds) {
    const found = songMap.get(id);
    if (found && validSelectedSongs.length < targetSize) {
      validSelectedSongs.push(found);
    }
  }

  // 3. Fill missing slots from playlist songs if selected songs are fewer than requested size
  if (validSelectedSongs.length < targetSize) {
    const selectedSet = new Set(validSelectedSongs.map((s) => s.songId));
    for (const song of playlistSongs) {
      if (validSelectedSongs.length >= targetSize) break;
      if (song && !selectedSet.has(song.songId)) {
        validSelectedSongs.push(song);
        selectedSet.add(song.songId);
      }
    }
  }

  return validSelectedSongs;
}
