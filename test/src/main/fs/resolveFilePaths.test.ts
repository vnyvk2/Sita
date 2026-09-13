import { describe, expect, test, vi } from 'vitest';

vi.mock('@db/schema', () => ({
  artworks: {
    $inferSelect: {}
  }
}));

vi.mock('../../../../src/main/filesystem', () => ({
  DEFAULT_ARTWORK_SAVE_LOCATION: 'artworks',
  DEFAULT_FILE_URL: 'nora://localfiles/'
}));

vi.mock('../../../../src/renderer/src/assets/images/webp/album_cover_default.webp?asset', () => ({
  default: 'album-cover.webp'
}));
vi.mock('../../../../src/renderer/src/assets/images/webp/artist_cover_default.webp?asset', () => ({
  default: 'artist-cover.webp'
}));
vi.mock(
  '../../../../src/renderer/src/assets/images/webp/favorites-playlist-icon.webp?asset',
  () => ({
    default: 'favorites-playlist.webp'
  })
);
vi.mock('../../../../src/renderer/src/assets/images/webp/history-playlist-icon.webp?asset', () => ({
  default: 'history-playlist.webp'
}));
vi.mock(
  '../../../../src/renderer/src/assets/images/webp/playlist_cover_default.webp?asset',
  () => ({
    default: 'playlist-cover.webp'
  })
);
vi.mock('../../../../src/renderer/src/assets/images/webp/song_cover_default.webp?asset', () => ({
  default: 'song-cover.webp'
}));

import {
  addDefaultAppProtocolToFilePath,
  getPlaylistArtworkPath,
  getSongArtworkPath,
  parseAlbumArtworks,
  parseSongArtworks,
  removeDefaultAppProtocolFromFilePath,
  resetArtworkCache,
  resolveSongFilePath
} from '../../../../src/main/fs/resolveFilePaths';

describe('resolveFilePaths', () => {
  test('resolveSongFilePath returns stable nora protocol path by default without cache-busting timestamp', () => {
    const resolved = resolveSongFilePath('C:/Music/Test.flac');

    expect(resolved).toBe('nora://localfiles/C:/Music/Test.flac');
    expect(resolved).not.toContain('?ts=');
  });

  test('resolveSongFilePath adds cache-busting timestamp when resetCache=true', () => {
    const resolved = resolveSongFilePath('C:/Music/Test.flac', true);

    expect(resolved).toContain('C:/Music/Test.flac');
    expect(resolved).toContain('?ts=');
  });

  test('resolveSongFilePath returns raw path when sendRealPath=true', () => {
    const resolved = resolveSongFilePath('C:/Music/Test.flac', false, true);

    expect(resolved).toBe('C:/Music/Test.flac');
  });

  test('resetArtworkCache returns numeric timestamp for single key and all', () => {
    const songTs = resetArtworkCache('songs');
    const allTs = resetArtworkCache('all');

    expect(typeof songTs).toBe('number');
    expect(typeof allTs).toBe('number');
    expect(allTs).toBeGreaterThanOrEqual(songTs);
  });

  test('getSongArtworkPath returns generated artwork paths when available', () => {
    const paths = getSongArtworkPath(42, true, true);

    expect(paths.isDefaultArtwork).toBe(false);
    expect(paths.artworkPath).toContain('42.webp');
    expect(paths.optimizedArtworkPath).toContain('42-optimized.webp');
    expect(paths.artworkPath).toContain('?ts=');
  });

  test('getSongArtworkPath returns default artwork when unavailable', () => {
    const paths = getSongArtworkPath(42, false, true);

    expect(paths.isDefaultArtwork).toBe(false);
    expect(paths.artworkPath).toContain('song-cover.webp');
    expect(paths.optimizedArtworkPath).toContain('song-cover.webp');
  });

  test('parseSongArtworks picks high resolution and optimized images when both exist', () => {
    const paths = parseSongArtworks(
      [
        { width: 1000, height: 1000, path: 'high.webp', isOptimized: false },
        { width: 300, height: 300, path: 'low.webp', isOptimized: true }
      ] as never,
      true,
      false
    );

    expect(paths.isDefaultArtwork).toBe(false);
    expect(paths.artworkPath).toContain('high.webp');
    expect(paths.optimizedArtworkPath).toContain('low.webp');
    expect(paths.artworkPath).toContain('?ts=');
  });

  test('parseSongArtworks falls back to default artwork when no artwork exists', () => {
    const paths = parseSongArtworks([] as never);

    expect(paths.isDefaultArtwork).toBe(true);
    expect(paths.artworkPath).toContain('song-cover.webp');
    expect(paths.optimizedArtworkPath).toContain('song-cover.webp');
  });

  test('parseAlbumArtworks dirty-data case (Audit D2 / P6): selects latest artwork when multiple artworks are linked', () => {
    const dirtyArtworks = [
      // Older artwork links (e.g. from initial library import)
      { id: 10, path: 'artworks/old_high.webp', isOptimized: false },
      { id: 11, path: 'artworks/old_opt.webp', isOptimized: true },
      // Newer artwork links (e.g. from subsequent auto-tag or metadata update)
      { id: 25, path: 'artworks/new_high.webp', isOptimized: false },
      { id: 26, path: 'artworks/new_opt.webp', isOptimized: true }
    ];

    const paths = parseAlbumArtworks(dirtyArtworks as never);

    expect(paths.isDefaultArtwork).toBe(false);
    // Highest ID non-optimized artwork must win
    expect(paths.artworkPath).toContain('new_high.webp');
    expect(paths.artworkPath).not.toContain('old_high.webp');
    // Highest ID optimized artwork must win
    expect(paths.optimizedArtworkPath).toContain('new_opt.webp');
    expect(paths.optimizedArtworkPath).not.toContain('old_opt.webp');
  });

  test('parseAlbumArtworks falls back to default artwork when no artwork exists', () => {
    const paths = parseAlbumArtworks([] as never);

    expect(paths.isDefaultArtwork).toBe(true);
    expect(paths.artworkPath).toContain('album-cover.webp');
    expect(paths.optimizedArtworkPath).toContain('album-cover.webp');
  });

  test('getPlaylistArtworkPath returns history and favorites defaults', () => {
    const history = getPlaylistArtworkPath('History', false, true);
    const favorites = getPlaylistArtworkPath('Favorites', false, true);

    expect(history.artworkPath).toContain('history-playlist.webp');
    expect(favorites.artworkPath).toContain('favorites-playlist.webp');
  });

  test('removeDefaultAppProtocolFromFilePath strips protocol and query string', () => {
    const input = 'nora://localfiles/C:/Music/Song.flac?ts=1234';
    const output = removeDefaultAppProtocolFromFilePath(input);

    expect(output).toContain('C:/Music/Song.flac');
    expect(output).not.toContain('?ts=');
  });

  test('removeDefaultAppProtocolFromFilePath returns windows-style path without leading slash', () => {
    const output = removeDefaultAppProtocolFromFilePath(
      'nora://localfiles/C:/Music/Song.flac?ts=1234',
      'win32'
    );

    expect(output).toBe('C:/Music/Song.flac');
  });

  test('removeDefaultAppProtocolFromFilePath returns leading slash on linux paths', () => {
    const output = removeDefaultAppProtocolFromFilePath(
      'nora://localfiles/home/ada/music/song.flac?ts=1234',
      'linux'
    );

    expect(output).toBe('/home/ada/music/song.flac');
  });

  test('removeDefaultAppProtocolFromFilePath returns leading slash on macos paths', () => {
    const output = removeDefaultAppProtocolFromFilePath(
      'nora://localfiles/Users/ada/Music/song.flac?ts=1234',
      'darwin'
    );

    expect(output).toBe('/Users/ada/Music/song.flac');
  });

  test('addDefaultAppProtocolToFilePath prefixes nora localfiles path', () => {
    const output = addDefaultAppProtocolToFilePath('C:/Music/Song.flac');

    expect(output).toContain('localfiles');
    expect(output).toContain('C:/Music/Song.flac');
    expect(output.startsWith('nora:')).toBe(true);
  });
});
