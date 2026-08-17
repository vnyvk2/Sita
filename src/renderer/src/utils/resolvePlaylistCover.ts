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

/**
 * Reconstructs the candidate songs array for playlist cover rendering: 1. Preserves exact playlist
 * position order matching collectionEntries (0, 1, 2, 3...). 2. Appends any configured custom
 * collage song IDs that reside beyond the entry limit. 3. Deduplicates to ensure unique song
 * representations.
 */
export function reconstructPlaylistCoverSongs(
  collectionEntries: Array<{ songId: number }> = [],
  fetchedSongData: SongData[] = [],
  settings?: PlaylistCoverSettings,
  providedSongs?: SongData[]
): SongData[] {
  if (providedSongs) return providedSongs;

  const songMap = new Map(fetchedSongData.map((s) => [s.songId, s]));
  const positionOrderedSongs: SongData[] = [];
  const addedSongIds = new Set<number>();

  for (const entry of collectionEntries) {
    const song = songMap.get(entry.songId);
    if (song) {
      positionOrderedSongs.push(song);
      addedSongIds.add(song.songId);
    }
  }

  if (settings?.type === 'collage' && settings?.collage?.songIds) {
    for (const id of settings.collage.songIds) {
      if (id > 0 && !addedSongIds.has(id)) {
        const song = songMap.get(id);
        if (song) {
          positionOrderedSongs.push(song);
          addedSongIds.add(id);
        }
      }
    }
  }

  return positionOrderedSongs;
}
