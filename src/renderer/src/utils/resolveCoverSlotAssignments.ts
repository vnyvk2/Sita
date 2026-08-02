import type { PlaylistCoverSettings } from '../types/playlistCover';
import { getAutoCoverStrategy } from './autoCoverStrategies/AutoCoverStrategyRegistry';

export function resolveCoverSlotAssignments(
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = [],
  maxSize: number = 4
): (number | null)[] {
  const isAuto = !settings || settings.type === 'auto' || !settings.collage;
  // Clamp requested size to layout bounds (maxSize) to prevent rendering overflow
  const targetSize = Math.min(settings?.collage?.size || maxSize, maxSize);

  if (isAuto) {
    const strategy = getAutoCoverStrategy(settings?.autoStrategy);
    const resolvedSongs = strategy.resolveSongs({ songs: playlistSongs, targetSize });
    return resolvedSongs.map((s) => (s?.songId !== undefined ? s.songId : null));
  }

  // Set of valid song IDs available in the playlist for fast membership validation
  const availableSongIds = new Set<number>();
  for (const song of playlistSongs) {
    if (song && song.songId !== undefined) {
      availableSongIds.add(song.songId);
    }
  }

  const songIds = settings?.collage?.songIds || [];
  const assignedIds: (number | null)[] = [];
  const validSongsSet = new Set<number>();

  // 1. Map explicit configured song IDs
  for (let i = 0; i < targetSize; i++) {
    const id = songIds[i];
    if (id && id !== 0 && availableSongIds.has(id)) {
      assignedIds.push(id);
      validSongsSet.add(id);
    } else {
      assignedIds.push(null);
    }
  }

  // 2. Single shared fallback fill algorithm
  let fallbackIndex = 0;
  for (let i = 0; i < targetSize; i++) {
    if (assignedIds[i] === null) {
      while (fallbackIndex < playlistSongs.length) {
        const candidate = playlistSongs[fallbackIndex];
        fallbackIndex++;
        if (candidate && candidate.songId !== undefined && !validSongsSet.has(candidate.songId)) {
          assignedIds[i] = candidate.songId;
          validSongsSet.add(candidate.songId);
          break;
        }
      }
    }
  }

  // 3. Pad up to target size with null
  while (assignedIds.length < targetSize) {
    assignedIds.push(null);
  }

  return assignedIds;
}
