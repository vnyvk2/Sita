import { describe, it, expect, vi } from 'vitest';
import { LibraryResolver } from '@main/playlistImport/resolver/LibraryResolver';
import type { LibraryLookup, LibrarySongRecord } from '@main/playlistImport/interfaces/LibraryLookup';
import type { ResolvedPlaylist } from '@main/playlistImport/models/ResolvedPlaylist';

describe('LibraryResolver', () => {
  it('should match song with 100 confidence when exact canonical path exists in library', async () => {
    const mockSong: LibrarySongRecord = {
      id: 4182,
      path: '/music/queen/bohemian.mp3',
      title: 'Bohemian Rhapsody',
      artist: 'Queen'
    };

    const mockLookup: LibraryLookup = {
      findByCanonicalPath: vi.fn(async (path: string) => {
        if (path === '/music/queen/bohemian.mp3') return mockSong;
        return null;
      })
    };

    const resolver = new LibraryResolver(mockLookup);

    const playlist: ResolvedPlaylist = {
      name: 'Rock Classics',
      entries: [
        {
          position: 1,
          resolvedTrack: {
            track: { originalLocation: 'bohemian.mp3' },
            resolution: {
              originalReference: 'bohemian.mp3',
              resolvedPath: '/music/queen/bohemian.mp3',
              resolutionStatus: 'RESOLVED',
              verificationStatus: 'FOUND'
            }
          }
        },
        {
          position: 2,
          resolvedTrack: {
            track: { originalLocation: 'other.mp3' },
            resolution: {
              originalReference: 'other.mp3',
              resolvedPath: '/music/other.mp3',
              resolutionStatus: 'RESOLVED',
              verificationStatus: 'FOUND'
            }
          }
        },
        {
          position: 3,
          resolvedTrack: {
            track: { originalLocation: 'missing.mp3' },
            resolution: {
              originalReference: 'missing.mp3',
              resolvedPath: '/music/missing.mp3',
              resolutionStatus: 'RESOLVED',
              verificationStatus: 'MISSING'
            }
          }
        }
      ]
    };

    const result = await resolver.resolvePlaylist(playlist);

    expect(result.entries[0].entry.libraryMatch).toEqual({
      matchedSongId: 4182,
      status: 'MATCHED',
      confidence: 100,
      candidates: [mockSong]
    });

    expect(result.entries[1].entry.libraryMatch.status).toBe('NOT_IN_LIBRARY');
    expect(result.entries[1].entry.libraryMatch.confidence).toBe(0);

    expect(result.entries[2].entry.libraryMatch.status).toBe('MISSING');
  });
});
