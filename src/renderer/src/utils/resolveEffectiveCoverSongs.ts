import type { EffectiveCoverSlot, PlaylistCoverSettings } from '../types/playlistCover';
import { resolveCoverSlotAssignments } from './resolveCoverSlotAssignments';

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

  const slotIds = resolveCoverSlotAssignments(settings, playlistSongs, maxSize);
  return slotIds.map((id) => (id === null ? undefined : songMap.get(id)));
}

export function resolveEffectiveCoverSlots(
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = [],
  maxSize: number = 4
): EffectiveCoverSlot[] {
  const effectiveSongs = resolveEffectiveCoverSongs(settings, playlistSongs, maxSize);
  const isAutoMode = !settings || settings.type === 'auto' || !settings.collage;
  const configuredSongIds = settings?.collage?.songIds || [];

  return effectiveSongs.map((song, index) => {
    const slot = index as import('../types/playlistCover').CoverSlotIndex;
    const isExplicitSong = index < configuredSongIds.length && configuredSongIds[index] !== 0;

    if (isAutoMode) {
      return {
        slot,
        song,
        state: song ? 'normal' : 'fallback',
        editable: false,
        draggable: false
      };
    }

    if (song) {
      return {
        slot,
        song,
        state: 'normal',
        editable: true,
        draggable: true
      };
    }

    return {
      slot,
      song: undefined,
      state: isExplicitSong ? 'missing' : 'fallback',
      editable: true,
      draggable: false
    };
  });
}
