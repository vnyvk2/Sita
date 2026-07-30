import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistPathResolver } from '@main/playlistImport/resolver/PlaylistPathResolver';
import { stat } from 'fs/promises';
import { normalize, resolve } from 'path';
import type { ImportedPlaylist } from '@main/playlistImport/models/ImportedPlaylist';

vi.mock('fs/promises', () => ({
  stat: vi.fn()
}));

describe('PlaylistPathResolver', () => {
  let resolver: PlaylistPathResolver;

  beforeEach(() => {
    resolver = new PlaylistPathResolver();
    vi.clearAllMocks();
  });

  it('should resolve relative paths against playlist directory and check existence', async () => {
    vi.mocked(stat).mockImplementation(async (targetPath) => {
      if (typeof targetPath === 'string' && targetPath.includes('song1.mp3')) {
        return {} as any;
      }
      throw new Error('File not found');
    });

    const playlist: ImportedPlaylist = {
      name: 'Test',
      entries: [
        {
          position: 1,
          track: { originalLocation: 'song1.mp3' }
        },
        {
          position: 2,
          track: { originalLocation: 'missing.mp3' }
        }
      ]
    };

    const result = await resolver.resolvePlaylist(playlist, '/music/playlists/test.m3u');

    expect(result.foundCount).toBe(1);
    expect(result.missingCount).toBe(1);

    expect(result.entries[0].resolvedTrack.resolution).toEqual({
      originalReference: 'song1.mp3',
      resolvedPath: normalize(resolve('/music/playlists', 'song1.mp3')),
      status: 'FOUND'
    });

    expect(result.entries[1].resolvedTrack.resolution).toEqual({
      originalReference: 'missing.mp3',
      resolvedPath: normalize(resolve('/music/playlists', 'missing.mp3')),
      status: 'MISSING'
    });
  });

  it('should handle file:// URIs correctly', async () => {
    vi.mocked(stat).mockResolvedValue({} as any);

    const result = await resolver.resolvePath('file:///C:/Music/Song.mp3', 'C:\\Base');

    expect(result.status).toBe('FOUND');
    expect(result.resolvedPath).toBe(normalize('C:/Music/Song.mp3'));
  });

  it('should return INVALID_URI for malformed file:// URIs', async () => {
    const result = await resolver.resolvePath('file://::invalid::', 'C:\\Base');
    expect(result.status).toBe('INVALID_URI');
  });
});
