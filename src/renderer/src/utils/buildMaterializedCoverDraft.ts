import type { PlaylistCoverSettings } from '../types/playlistCover';
import type { MaterializedCoverDraft } from '../types/playlistCoverDraft';
import { resolveCoverSlotAssignments } from './resolveCoverSlotAssignments';

export function buildMaterializedCoverDraft(
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = []
): MaterializedCoverDraft {
  const isAuto = !settings || settings.type === 'auto' || !settings.collage;
  const layout = settings?.collage?.layout || 'grid';
  const variant = settings?.collage?.variant;
  const size = settings?.collage?.size || 4;
  const autoStrategy = settings?.autoStrategy || 'firstN';

  const slotIds = resolveCoverSlotAssignments(settings, playlistSongs, size);

  return {
    version: settings?.version || 1,
    type: isAuto ? 'auto' : 'collage',
    autoStrategy,
    layout,
    variant,
    size,
    slots: slotIds.map((songId) => ({ songId }))
  };
}

export function getDraftSongs(
  draft: MaterializedCoverDraft,
  playlistSongs: SongData[] = []
): (SongData | undefined)[] {
  const songMap = new Map<number, SongData>();
  for (const song of playlistSongs) {
    if (song && song.songId !== undefined) {
      songMap.set(song.songId, song);
    }
  }

  return draft.slots.map((slot) => (slot.songId === null ? undefined : songMap.get(slot.songId)));
}
