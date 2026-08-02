import type { PlaylistCoverSettings } from '../types/playlistCover';

export function isPlaylistCoverSettingsEqual(
  a: PlaylistCoverSettings,
  b: PlaylistCoverSettings
): boolean {
  if (a.type !== b.type) return false;

  const aCollage = a.collage;
  const bCollage = b.collage;

  if (!aCollage && !bCollage) return true;
  if (!aCollage || !bCollage) return false;

  if (aCollage.layout !== bCollage.layout) return false;
  if (aCollage.size !== bCollage.size) return false;

  const aSongIds = aCollage.songIds ?? [];
  const bSongIds = bCollage.songIds ?? [];

  const maxLength = Math.max(aSongIds.length, bSongIds.length);
  for (let i = 0; i < maxLength; i++) {
    if ((aSongIds[i] ?? 0) !== (bSongIds[i] ?? 0)) return false;
  }

  return true;
}
