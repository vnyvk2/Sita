import storage from '@renderer/utils/localStorage';

export type SongViewMode = 'compact' | 'small' | 'normal';

export const SONG_ROW_HEIGHTS: Record<SongViewMode, number> = {
  compact: 38,
  small: 48,
  normal: 60
} as const;

export function getSongRowHeight(mode: SongViewMode = 'normal'): number {
  return SONG_ROW_HEIGHTS[mode] ?? 60;
}

export function resolveSongViewMode(
  prefsOrMode?: SongViewMode | { songViewMode?: SongViewMode; isCompactSongView?: boolean } | null,
  legacyIsCompact?: boolean
): SongViewMode {
  if (prefsOrMode && typeof prefsOrMode === 'object') {
    const mode = prefsOrMode.songViewMode;
    if (mode === 'compact' || mode === 'small' || mode === 'normal') {
      return mode;
    }
    return prefsOrMode.isCompactSongView ? 'compact' : 'normal';
  }
  if (prefsOrMode === 'compact' || prefsOrMode === 'small' || prefsOrMode === 'normal') {
    return prefsOrMode;
  }
  return legacyIsCompact ? 'compact' : 'normal';
}

/**
 * Atomically writes both `songViewMode` and legacy `isCompactSongView`
 * to eliminate writer desync across old and new UI call sites.
 */
export function setSongViewMode(mode: SongViewMode): void {
  storage.preferences.setPreferences('songViewMode', mode);
  storage.preferences.setPreferences('isCompactSongView', mode === 'compact');
}
