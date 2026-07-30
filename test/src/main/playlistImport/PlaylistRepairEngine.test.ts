import { describe, it, expect, vi } from 'vitest';
import { PlaylistRepairEngine } from '@main/playlistImport/repair/PlaylistRepairEngine';
import { RepairStrategyRegistry } from '@main/playlistImport/registry/RepairStrategyRegistry';
import { ExactFilenameStrategy } from '@main/playlistImport/strategies/ExactFilenameStrategy';
import { NormalizedFilenameStrategy } from '@main/playlistImport/strategies/NormalizedFilenameStrategy';
import type { LibraryLookup, LibrarySongRecord } from '@main/playlistImport/interfaces/LibraryLookup';
import type { LibraryResolvedPlaylist } from '@main/playlistImport/models/LibraryResolvedPlaylist';

describe('PlaylistRepairEngine', () => {
  it('should repair unresolved entries using ExactFilenameStrategy (confidence 95)', async () => {
    const mockSong: LibrarySongRecord = {
      id: 888,
      path: '/new/location/Bohemian Rhapsody.mp3',
      title: 'Bohemian Rhapsody'
    };

    const mockLookup: LibraryLookup = {
      findByCanonicalPath: vi.fn(async () => null),
      findByFilename: vi.fn(async (filename: string) => {
        if (filename === 'Bohemian Rhapsody.mp3') return [mockSong];
        return [];
      })
    };

    const registry = new RepairStrategyRegistry();
    registry.register(new ExactFilenameStrategy());

    const repairEngine = new PlaylistRepairEngine(registry, mockLookup);

    const playlist: LibraryResolvedPlaylist = {
      name: 'Test',
      entries: [
        {
          position: 1,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'old/location/Bohemian Rhapsody.mp3' },
              resolution: { originalReference: 'old/location/Bohemian Rhapsody.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' }
            },
            libraryMatch: { status: 'NOT_IN_LIBRARY', confidence: 0 }
          }
        }
      ]
    };

    const repaired = await repairEngine.repairPlaylist(playlist);

    expect(repaired.entries[0].trackReference.libraryMatch).toEqual({
      matchedSongId: 888,
      status: 'MATCHED',
      confidence: 95,
      candidates: [mockSong],
      diagnostics: [
        "Repaired via strategy 'ExactFilename' (confidence 95%): Matched exact filename: Bohemian Rhapsody.mp3"
      ]
    });
  });

  it('should repair unresolved entries using NormalizedFilenameStrategy (confidence 85)', async () => {
    const mockSong: LibrarySongRecord = {
      id: 999,
      path: '/music/bohemian_rhapsody.mp3',
      title: 'Bohemian Rhapsody'
    };

    const mockLookup: LibraryLookup = {
      findByCanonicalPath: vi.fn(async () => null),
      findByFilename: vi.fn(async () => [mockSong])
    };

    const registry = new RepairStrategyRegistry();
    registry.register(new NormalizedFilenameStrategy());

    const repairEngine = new PlaylistRepairEngine(registry, mockLookup);

    const playlist: LibraryResolvedPlaylist = {
      name: 'Test',
      entries: [
        {
          position: 1,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'Bohemian-Rhapsody.mp3' },
              resolution: { originalReference: 'Bohemian-Rhapsody.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' }
            },
            libraryMatch: { status: 'NOT_IN_LIBRARY', confidence: 0 }
          }
        }
      ]
    };

    const repaired = await repairEngine.repairPlaylist(playlist);

    expect(repaired.entries[0].trackReference.libraryMatch.status).toBe('MATCHED');
    expect(repaired.entries[0].trackReference.libraryMatch.confidence).toBe(85);
    expect(repaired.entries[0].trackReference.libraryMatch.matchedSongId).toBe(999);
  });

  it('should leave exact matches and missing entries untouched', async () => {
    const mockLookup: LibraryLookup = {
      findByCanonicalPath: vi.fn(async () => null)
    };

    const registry = new RepairStrategyRegistry();
    registry.register(new ExactFilenameStrategy());

    const repairEngine = new PlaylistRepairEngine(registry, mockLookup);

    const playlist: LibraryResolvedPlaylist = {
      name: 'Test',
      entries: [
        {
          position: 1,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'song.mp3' },
              resolution: { originalReference: 'song.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' }
            },
            libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 10 }
          }
        },
        {
          position: 2,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'missing.mp3' },
              resolution: { originalReference: 'missing.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'MISSING' }
            },
            libraryMatch: { status: 'MISSING', confidence: 0 }
          }
        }
      ]
    };

    const repaired = await repairEngine.repairPlaylist(playlist);

    expect(repaired.entries[0].trackReference.libraryMatch.confidence).toBe(100);
    expect(repaired.entries[1].trackReference.libraryMatch.status).toBe('MISSING');
  });
});
