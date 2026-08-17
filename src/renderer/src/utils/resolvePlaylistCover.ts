import type { PlaylistDto } from '@common/collections/dtos';

import DefaultImgCover from '../assets/images/webp/song_cover_default.webp';
import type { PlaylistCoverSettings, ResolvedPlaylistCover } from '../types/playlistCover';
import type { MaterializedCoverDraft } from '../types/playlistCoverDraft';
import { getDraftSongs } from './buildMaterializedCoverDraft';
import { resolveEffectiveCoverSongs } from './resolveEffectiveCoverSongs';

export function resolvePlaylistCover(
  playlist: PlaylistDto,
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = []
): ResolvedPlaylistCover {
  // 0. If playlist has a custom static artworkPath set and no custom collage: return custom artworkPath
  if ((!settings || settings.type === 'auto') && playlist.artworkPath) {
    return { layout: 'grid', artworks: [playlist.artworkPath] };
  }

  const layout = settings?.collage?.layout || 'grid';
  const variant = settings?.collage?.variant;
  const size = settings?.collage?.size || 4;

  const effectiveSongs = resolveEffectiveCoverSongs(settings, playlistSongs, size);
  const artworks = effectiveSongs.map((s) => s?.artworkPaths?.artworkPath || DefaultImgCover);

  return { layout, variant, artworks };
}

export function resolvePlaylistCoverFromDraft(
  draft: MaterializedCoverDraft,
  playlistSongs: SongData[] = []
): ResolvedPlaylistCover {
  const draftSongs = getDraftSongs(draft, playlistSongs);
  const artworks = draftSongs.map((s) => s?.artworkPaths?.artworkPath || DefaultImgCover);

  return {
    layout: draft.layout,
    variant: draft.variant,
    artworks
  };
}
