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
  prefsOrMode?:
    | SongViewMode
    | { songViewMode?: SongViewMode; isCompactSongView?: boolean; songRowSize?: 'normal' | 'small' }
    | null,
  legacyIsCompact?: boolean
): SongViewMode {
  if (prefsOrMode && typeof prefsOrMode === 'object') {
    const mode = prefsOrMode.songViewMode;
    if (mode === 'compact') {
      return 'compact';
    }
    if (prefsOrMode.isCompactSongView) {
      return 'compact';
    }
    if (mode === 'small' || mode === 'normal') {
      return mode;
    }
    if (prefsOrMode.songRowSize === 'small') {
      return 'small';
    }
    return 'normal';
  }
  if (prefsOrMode === 'compact' || prefsOrMode === 'small' || prefsOrMode === 'normal') {
    return prefsOrMode;
  }
  return legacyIsCompact ? 'compact' : 'normal';
}

export function getPreferredSongRowSize(
  prefsOrSize?:
    | 'normal'
    | 'small'
    | { songRowSize?: 'normal' | 'small'; songViewMode?: SongViewMode }
    | null
): 'normal' | 'small' {
  if (prefsOrSize === 'small' || prefsOrSize === 'normal') {
    return prefsOrSize;
  }
  if (prefsOrSize && typeof prefsOrSize === 'object') {
    if (prefsOrSize.songRowSize === 'small' || prefsOrSize.songRowSize === 'normal') {
      return prefsOrSize.songRowSize;
    }
    if (prefsOrSize.songViewMode === 'small') {
      return 'small';
    }
  }
  return 'normal';
}

/**
 * Atomically writes `songViewMode`, legacy `isCompactSongView`, and standard `songRowSize`
 * to eliminate writer desync across old and new UI call sites.
 */
export function setSongViewMode(mode: SongViewMode): void {
  storage.preferences.setPreferences('songViewMode', mode);
  storage.preferences.setPreferences('isCompactSongView', mode === 'compact');
  if (mode !== 'compact') {
    storage.preferences.setPreferences('songRowSize', mode);
  }
}

