import type { PlaylistDto } from '@main/collections/ipc/dtos';
import DefaultImgCover from '../assets/images/webp/song_cover_default.webp';
import type { PlaylistCoverSettings, ResolvedPlaylistCover } from '../types/playlistCover';
import { resolveEffectiveCoverSongs } from './resolveEffectiveCoverSongs';

export function resolvePlaylistCover(
  playlist: PlaylistDto,
  settings?: PlaylistCoverSettings,
  playlistSongs: SongData[] = []
): ResolvedPlaylistCover {
  // 0. If playlist has a custom static artworkPath set and no custom collage: return custom artworkPath
  if ((!settings || settings.type === 'auto') && playlist.artworkPath && playlistSongs.length === 0) {
    return { layout: 'grid', artworks: [playlist.artworkPath] };
  }

  const layout = settings?.collage?.layout || 'grid';
  const size = settings?.collage?.size || 4;

  const effectiveSongs = resolveEffectiveCoverSongs(settings, playlistSongs, size);
  const artworks = effectiveSongs.map((s) => s.artworkPaths?.artworkPath || DefaultImgCover);

  return { layout, artworks };
}
