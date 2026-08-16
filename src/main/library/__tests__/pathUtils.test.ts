import { describe, it, expect } from 'vitest';

import { normalizeLibraryPath, getNormalizedPathKey, isPathInsideRoot } from '../pathUtils';

describe('pathUtils', () => {
  describe('normalizeLibraryPath', () => {
    it('should normalize forward slashes and backward slashes on Windows', () => {
      const winPath = 'c:/Music/Rock/Song.mp3';
      const normalized = normalizeLibraryPath(winPath, 'win32');
      expect(normalized).toBe('C:\\Music\\Rock\\Song.mp3');
    });

    it('should capitalize drive letters on Windows', () => {
      const winPath = 'd:\\audio\\track.flac';
      const normalized = normalizeLibraryPath(winPath, 'win32');
      expect(normalized).toBe('D:\\audio\\track.flac');
    });

    it('should remove trailing separators', () => {
      const winFolder = 'C:\\Music\\Jazz\\';
      expect(normalizeLibraryPath(winFolder, 'win32')).toBe('C:\\Music\\Jazz');
    });
  });

  describe('getNormalizedPathKey', () => {
    it('should produce identical lowercase keys on Windows regardless of casing', () => {
      const p1 = 'C:\\Music\\Artist\\Song.MP3';
      const p2 = 'c:/music/artist/song.mp3';

      expect(getNormalizedPathKey(p1, 'win32')).toBe(getNormalizedPathKey(p2, 'win32'));
      expect(getNormalizedPathKey(p1, 'win32')).toBe('c:\\music\\artist\\song.mp3');
    });

    it('should preserve case on Linux', () => {
      const p1 = '/home/user/Music/Song.mp3';
      const p2 = '/home/user/music/song.mp3';

      expect(getNormalizedPathKey(p1, 'linux')).not.toBe(getNormalizedPathKey(p2, 'linux'));
      expect(getNormalizedPathKey(p1, 'linux')).toBe('/home/user/Music/Song.mp3');
    });
  });

  describe('isPathInsideRoot', () => {
    it('should identify child paths under a Windows root', () => {
      const root = 'D:\\Music';
      const child = 'd:/music/rock/metallica/one.mp3';

      expect(isPathInsideRoot(child, root, 'win32')).toBe(true);
    });

    it('should reject paths from a different root or drive', () => {
      const root = 'D:\\Music';
      const other = 'C:\\Music\\Song.mp3';
      const sibling = 'D:\\Music2\\Song.mp3';

      expect(isPathInsideRoot(other, root, 'win32')).toBe(false);
      expect(isPathInsideRoot(sibling, root, 'win32')).toBe(false);
    });

    it('should consider exact root match as inside', () => {
      const root = 'C:\\Music';
      expect(isPathInsideRoot('c:\\music', root, 'win32')).toBe(true);
    });
  });
});
