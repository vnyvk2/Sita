import { describe, it, expect, beforeEach } from 'vitest';
import { PlaylistImportPlanner } from '@main/playlistImport/planner/PlaylistImportPlanner';
import type { LibraryResolvedPlaylist } from '@main/playlistImport/models/LibraryResolvedPlaylist';

describe('PlaylistImportPlanner', () => {
  let planner: PlaylistImportPlanner;

  beforeEach(() => {
    planner = new PlaylistImportPlanner();
  });

  it('should generate import decisions and compute accurate statistics', () => {
    const resolvedPlaylist: LibraryResolvedPlaylist = {
      name: 'Road Trip',
      entries: [
        {
          position: 1,
          sourceLine: 2,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'song1.mp3' },
              resolution: { originalReference: 'song1.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' }
            },
            libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 10 }
          }
        },
        {
          position: 2,
          sourceLine: 3,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'song2.mp3' },
              resolution: { originalReference: 'song2.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'MISSING' }
            },
            libraryMatch: { status: 'MISSING', confidence: 0 }
          }
        },
        {
          position: 3,
          sourceLine: 4,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'song3.mp3' },
              resolution: { originalReference: 'song3.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' }
            },
            libraryMatch: { status: 'NOT_IN_LIBRARY', confidence: 0 }
          }
        },
        {
          position: 4,
          sourceLine: 5,
          trackReference: {
            resolvedTrack: {
              track: { originalLocation: 'spotify:track:123' },
              resolution: { originalReference: 'spotify:track:123', resolutionStatus: 'UNRESOLVED', verificationStatus: 'UNVERIFIED' }
            },
            libraryMatch: { status: 'UNRESOLVED', confidence: 0 }
          }
        }
      ]
    };

    const plan = planner.createPlan(resolvedPlaylist);

    expect(plan.playlistName).toBe('Road Trip');
    expect(plan.entries).toHaveLength(4);
    expect(plan.entries[0].source).toEqual(resolvedPlaylist.entries[0]);
    expect(plan.entries[0].decision).toBe('IMPORT');
    expect(plan.entries[1].decision).toBe('SKIP_MISSING');
    expect(plan.entries[2].decision).toBe('SKIP_NOT_IN_LIBRARY');
    expect(plan.entries[3].decision).toBe('SKIP_INVALID');

    expect(plan.statistics).toEqual({
      totalEntries: 4,
      importedEntries: 1,
      repairedEntries: 0,
      skippedEntries: 3,
      missingEntries: 1,
      notInLibraryEntries: 1,
      invalidEntries: 1,
      warningCount: 3,
      plannedImportPercentage: 25
    });

    expect(plan.warnings).toHaveLength(3);
    expect(plan.warnings[0].lineNumber).toBe(3);
    expect(plan.warnings[1].lineNumber).toBe(4);
    expect(plan.warnings[2].lineNumber).toBe(5);
  });
});
