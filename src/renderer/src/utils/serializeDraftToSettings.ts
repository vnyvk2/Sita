import type { PlaylistCoverSettings } from '../types/playlistCover';
import type { MaterializedCoverDraft } from '../types/playlistCoverDraft';

export function serializeDraftToSettings(draft: MaterializedCoverDraft): PlaylistCoverSettings {
  if (draft.type === 'auto') {
    return {
      version: draft.version,
      type: 'auto',
      autoStrategy: draft.autoStrategy,
      collage: {
        layout: draft.layout,
        variant: draft.variant,
        size: draft.size,
        songIds: []
      }
    };
  }

  return {
    version: draft.version,
    type: 'collage',
    autoStrategy: draft.autoStrategy,
    collage: {
      layout: draft.layout,
      variant: draft.variant,
      size: draft.size,
      songIds: draft.slots.map((s) => (s.songId === null ? 0 : s.songId))
    }
  };
}
