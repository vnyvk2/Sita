import { beforeEach, describe, expect, it, vi } from 'vitest';

import storage from '@renderer/utils/localStorage';
import {
  SONG_ROW_HEIGHTS,
  getSongRowHeight,
  resolveSongViewMode,
  setSongViewMode,
  type SongViewMode
} from './songViewMode';

vi.mock('@renderer/utils/localStorage', () => ({
  default: {
    preferences: {
      setPreferences: vi.fn(),
      getPreferences: vi.fn()
    }
  }
}));

describe('songViewMode utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SONG_ROW_HEIGHTS and getSongRowHeight', () => {
    it('returns exact pixel heights for all 3 density tiers', () => {
      expect(SONG_ROW_HEIGHTS.compact).toBe(38);
      expect(SONG_ROW_HEIGHTS.small).toBe(48);
      expect(SONG_ROW_HEIGHTS.normal).toBe(60);

      expect(getSongRowHeight('compact')).toBe(38);
      expect(getSongRowHeight('small')).toBe(48);
      expect(getSongRowHeight('normal')).toBe(60);
    });

    it('falls back to 60px normal height for unknown or undefined inputs', () => {
      expect(getSongRowHeight(undefined as unknown as SongViewMode)).toBe(60);
      expect(getSongRowHeight('unknown' as unknown as SongViewMode)).toBe(60);
    });
  });

  describe('resolveSongViewMode', () => {
    it('resolves directly from preferences object with songViewMode', () => {
      expect(resolveSongViewMode({ songViewMode: 'compact' })).toBe('compact');
      expect(resolveSongViewMode({ songViewMode: 'small' })).toBe('small');
      expect(resolveSongViewMode({ songViewMode: 'normal' })).toBe('normal');
    });

    it('falls back to legacy isCompactSongView when songViewMode is not set', () => {
      expect(resolveSongViewMode({ isCompactSongView: true })).toBe('compact');
      expect(resolveSongViewMode({ isCompactSongView: false })).toBe('normal');
      expect(resolveSongViewMode({})).toBe('normal');
      expect(resolveSongViewMode(null)).toBe('normal');
    });

    it('resolves from string and legacy boolean positional arguments', () => {
      expect(resolveSongViewMode('compact')).toBe('compact');
      expect(resolveSongViewMode('small')).toBe('small');
      expect(resolveSongViewMode('normal')).toBe('normal');
      expect(resolveSongViewMode(undefined, true)).toBe('compact');
      expect(resolveSongViewMode(undefined, false)).toBe('normal');
      expect(resolveSongViewMode(undefined, undefined)).toBe('normal');
    });
  });

  describe('setSongViewMode', () => {
    it('atomically persists both songViewMode and isCompactSongView for compact', () => {
      setSongViewMode('compact');
      expect(storage.preferences.setPreferences).toHaveBeenCalledWith('songViewMode', 'compact');
      expect(storage.preferences.setPreferences).toHaveBeenCalledWith('isCompactSongView', true);
    });

    it('atomically persists both songViewMode and isCompactSongView for small', () => {
      setSongViewMode('small');
      expect(storage.preferences.setPreferences).toHaveBeenCalledWith('songViewMode', 'small');
      expect(storage.preferences.setPreferences).toHaveBeenCalledWith('isCompactSongView', false);
    });

    it('atomically persists both songViewMode and isCompactSongView for normal', () => {
      setSongViewMode('normal');
      expect(storage.preferences.setPreferences).toHaveBeenCalledWith('songViewMode', 'normal');
      expect(storage.preferences.setPreferences).toHaveBeenCalledWith('isCompactSongView', false);
    });
  });
});
