import { describe, it, expect, vi } from 'vitest';
import { PlaylistImportExecutor } from '@main/playlistImport/executor/PlaylistImportExecutor';
import type { PlaylistPersistence } from '@main/playlistImport/interfaces/PlaylistPersistence';
import type { PlaylistImportPlan } from '@main/playlistImport/models/PlaylistImportPlan';

describe('PlaylistImportExecutor', () => {
  it('should execute IMPORT decisions in order inside a transaction and skip other decisions', async () => {
    const mockPersistence: PlaylistPersistence = {
      createPlaylist: vi.fn(async () => 101),
      addEntries: vi.fn(async () => {}),
      runInTransaction: vi.fn(async (work) => await work())
    };

    const executor = new PlaylistImportExecutor(mockPersistence);

    const plan: PlaylistImportPlan = {
      playlistName: 'My Awesome Playlist',
      description: 'Imported from M3U',
      statistics: {
        totalEntries: 3,
        importedEntries: 2,
        skippedEntries: 1,
        missingEntries: 1,
        notInLibraryEntries: 0,
        invalidEntries: 0,
        warningCount: 1,
        plannedImportPercentage: 67
      },
      warnings: [{ code: 'MISSING_FILE', message: 'Missing song', lineNumber: 3 }],
      entries: [
        {
          decision: 'IMPORT',
          source: {
            position: 1,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'song1.mp3' }, resolution: { originalReference: 'song1.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 501 }
            }
          }
        },
        {
          decision: 'SKIP_MISSING',
          source: {
            position: 2,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'missing.mp3' }, resolution: { originalReference: 'missing.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'MISSING' } },
              libraryMatch: { status: 'MISSING', confidence: 0 }
            }
          }
        },
        {
          decision: 'IMPORT',
          source: {
            position: 3,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'song2.mp3' }, resolution: { originalReference: 'song2.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 502 }
            }
          }
        }
      ]
    };

    const result = await executor.execute(plan);

    expect(mockPersistence.runInTransaction).toHaveBeenCalled();
    expect(mockPersistence.createPlaylist).toHaveBeenCalledWith('My Awesome Playlist', 'Imported from M3U');
    expect(mockPersistence.addEntries).toHaveBeenCalledWith(101, [501, 502]);

    expect(result.playlistId).toBe(101);
    expect(result.success).toBe(true);
    expect(result.importedSongIds).toEqual([501, 502]);
    expect(result.statistics.importedEntriesCount).toBe(2);
    expect(result.statistics.skippedEntriesCount).toBe(1);
  });

  it('should rollback transaction and throw error if persistence fails', async () => {
    const mockPersistence: PlaylistPersistence = {
      createPlaylist: vi.fn(async () => {
        throw new Error('Database disk full');
      }),
      addEntries: vi.fn(async () => {}),
      runInTransaction: vi.fn(async (work) => await work())
    };

    const executor = new PlaylistImportExecutor(mockPersistence);

    const plan: PlaylistImportPlan = {
      playlistName: 'Failed Playlist',
      statistics: {
        totalEntries: 1,
        importedEntries: 1,
        skippedEntries: 0,
        missingEntries: 0,
        notInLibraryEntries: 0,
        invalidEntries: 0,
        warningCount: 0,
        plannedImportPercentage: 100
      },
      warnings: [],
      entries: [
        {
          decision: 'IMPORT',
          source: {
            position: 1,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'song1.mp3' }, resolution: { originalReference: 'song1.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 501 }
            }
          }
        }
      ]
    };

    await expect(executor.execute(plan)).rejects.toThrow('Database disk full');
  });
});
