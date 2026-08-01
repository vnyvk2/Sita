import type { PlaylistCoverSettings } from '../types/playlistCover';

export function resolveEffectiveCoverSongs(
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = [],
  maxSize: number = 4
): (SongData | undefined)[] {
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

  // 2. Map requested songIds directly, preserving index and explicitly preserving undefined for '0'
  const validSelectedSongs: (SongData | undefined)[] = [];
  for (const id of songIds) {
    if (validSelectedSongs.length >= targetSize) break;
    if (id === 0) {
      validSelectedSongs.push(undefined);
    } else {
      validSelectedSongs.push(songMap.get(id));
    }
  }

  // 3. Fill missing slots from playlist songs where elements are undefined
  const validSongsSet = new Set(validSelectedSongs.filter((s): s is SongData => s !== undefined).map(s => s.songId));
  let fallbackIndex = 0;

  for (let i = 0; i < targetSize; i++) {
    if (validSelectedSongs[i] === undefined) {
      // Find next unused playlist song
      while (fallbackIndex < playlistSongs.length) {
        const fallbackSong = playlistSongs[fallbackIndex];
        fallbackIndex++;
        
        if (fallbackSong && !validSongsSet.has(fallbackSong.songId)) {
          validSelectedSongs[i] = fallbackSong;
          validSongsSet.add(fallbackSong.songId);
          break;
        }
      }
    }
  }

  // 4. Pad array up to targetSize with undefined so downstream renderers receive expected slot count
  while (validSelectedSongs.length < targetSize) {
    validSelectedSongs.push(undefined);
  }

  return validSelectedSongs;
}
