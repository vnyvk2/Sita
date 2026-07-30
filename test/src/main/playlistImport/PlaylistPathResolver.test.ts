import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistPathResolver } from '@main/playlistImport/resolver/PlaylistPathResolver';
import { FilesystemVerifier } from '@main/playlistImport/verifier/FilesystemVerifier';
import type { FileSystemAccess } from '@main/playlistImport/interfaces/FileSystemAccess';
import { normalize, resolve } from 'path';
import type { ImportedPlaylist } from '@main/playlistImport/models/ImportedPlaylist';

describe('PlaylistPathResolver & FilesystemVerifier', () => {
  let resolver: PlaylistPathResolver;

  beforeEach(() => {
    resolver = new PlaylistPathResolver();
  });

  it('should calculate relative and absolute resolved paths without filesystem check', () => {
    const playlist: ImportedPlaylist = {
      name: 'Test',
      entries: [
        { position: 1, track: { originalLocation: 'song1.mp3' } },
        { position: 2, track: { originalLocation: String.raw`C:\Music\song2.flac` } },
        { position: 3, track: { originalLocation: 'spotify:track:12345' } }
      ]
    };

    const resolved = resolver.resolvePlaylist(playlist, '/music/playlists/test.m3u');

    expect(resolved.entries[0].resolvedTrack.resolution).toEqual({
      originalReference: 'song1.mp3',
      resolvedPath: normalize(resolve('/music/playlists', 'song1.mp3')),
      resolutionStatus: 'RESOLVED',
      verificationStatus: 'UNVERIFIED'
    });

    expect(resolved.entries[1].resolvedTrack.resolution.resolutionStatus).toBe('RESOLVED');
    expect(resolved.entries[2].resolvedTrack.resolution.resolutionStatus).toBe('UNRESOLVED');
  });

  it('should verify filesystem existence using FilesystemVerifier', async () => {
    const mockFs: FileSystemAccess = {
      exists: vi.fn(async (path: string) => path.includes('song1.mp3'))
    };

    const verifier = new FilesystemVerifier(mockFs);

    const playlist: ImportedPlaylist = {
      name: 'Test',
      entries: [
        { position: 1, track: { originalLocation: 'song1.mp3' } },
        { position: 2, track: { originalLocation: 'missing.mp3' } }
      ]
    };

    const resolved = resolver.resolvePlaylist(playlist, '/music/playlists/test.m3u');
    const verified = await verifier.verifyPlaylist(resolved);

    expect(verified.entries[0].resolvedTrack.resolution.resolutionStatus).toBe('RESOLVED');
    expect(verified.entries[0].resolvedTrack.resolution.verificationStatus).toBe('FOUND');

    expect(verified.entries[1].resolvedTrack.resolution.resolutionStatus).toBe('RESOLVED');
    expect(verified.entries[1].resolvedTrack.resolution.verificationStatus).toBe('MISSING');
  });
});
