import type { FileSystemAccess } from '@main/playlistImport/interfaces/FileSystemAccess';
import type { TransactionRunner } from '@main/playlistImport/interfaces/TransactionRunner';
import type { PlaylistImportPlan } from '@main/playlistImport/models/PlaylistImportPlan';
import { PlaylistSyncExecutor } from '@main/playlistSync/executor/PlaylistSyncExecutor';
import type { PlaylistSyncPersistence } from '@main/playlistSync/interfaces/PlaylistSyncPersistence';
import type { PlaylistLink } from '@main/playlistSync/models/PlaylistLink';
import { PlaylistSyncPlanner } from '@main/playlistSync/planner/PlaylistSyncPlanner';
import { PlaylistSourceTracker } from '@main/playlistSync/services/PlaylistSourceTracker';
import { describe, it, expect, vi } from 'vitest';

describe('Playlist Synchronization Framework Refinements', () => {
  it('should detect source file modifications using PlaylistSourceTracker', async () => {
    const mockFs: FileSystemAccess = {
      exists: vi.fn(async () => true),
      readFile: vi.fn(async () => '#EXTM3U\nsong1.mp3')
    };

    const tracker = new PlaylistSourceTracker(mockFs);

    const link: PlaylistLink = {
      id: 'link_1',
      playlistId: 10,
      sourceFile: '/playlists/rock.m3u',
      format: 'm3u',
      lastImportedAt: new Date(),
      fileHash: 'old_different_hash',
      syncPolicy: 'ONE_WAY_SOURCE_WINS'
    };

    const changed = await tracker.hasSourceChanged(link);
    expect(changed).toBe(true);
  });

  it('should generate sync plan detecting additions and removals under ONE_WAY_SOURCE_WINS policy', () => {
    const planner = new PlaylistSyncPlanner();

    const link: PlaylistLink = {
      id: 'link_1',
      playlistId: 10,
      sourceFile: '/playlists/rock.m3u',
      format: 'm3u',
      lastImportedAt: new Date(),
      syncPolicy: 'ONE_WAY_SOURCE_WINS'
    };

    const importPlan: PlaylistImportPlan = {
      playlistName: 'rock',
      statistics: {
        totalEntries: 2,
        importedEntries: 2,
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
              resolvedTrack: {
                track: { originalLocation: 'song1.mp3' },
                resolution: {
                  originalReference: 'song1.mp3',
                  resolutionStatus: 'RESOLVED',
                  verificationStatus: 'FOUND'
                }
              },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 101 }
            }
          }
        },
        {
          decision: 'IMPORT',
          source: {
            position: 2,
            trackReference: {
              resolvedTrack: {
                track: { originalLocation: 'song2.mp3' },
                resolution: {
                  originalReference: 'song2.mp3',
                  resolutionStatus: 'RESOLVED',
                  verificationStatus: 'FOUND'
                }
              },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 102 }
            }
          }
        }
      ]
    };

    const currentSongIds = [101, 999];

    const syncPlan = planner.createSyncPlan(link, importPlan, currentSongIds);

    expect(syncPlan.hasChanges).toBe(true);
    expect(syncPlan.additionsCount).toBe(1);
    expect(syncPlan.removalsCount).toBe(1);

    expect(syncPlan.operations).toEqual([
      { type: 'ADD_SONG', songId: 102, reason: 'Song present in updated source playlist' },
      { type: 'REMOVE_SONG', songId: 999, reason: 'Song removed from source playlist' }
    ]);
  });

  it('should execute sync plan inside transaction and apply both additions and removals via PlaylistSyncPersistence', async () => {
    const mockSyncPersistence: PlaylistSyncPersistence = {
      addEntries: vi.fn(async () => {}),
      removeEntries: vi.fn(async () => {}),
      reorderEntries: vi.fn(async () => {})
    };

    const mockTransactionRunner: TransactionRunner = {
      runInTransaction: vi.fn(async (work) => await work())
    };

    const executor = new PlaylistSyncExecutor(mockSyncPersistence, mockTransactionRunner);

    const syncPlan = {
      linkId: 'link_1',
      playlistId: 10,
      sourceFile: '/playlists/rock.m3u',
      syncPolicy: 'ONE_WAY_SOURCE_WINS' as const,
      hasChanges: true,
      additionsCount: 1,
      removalsCount: 1,
      operations: [
        {
          type: 'ADD_SONG' as const,
          songId: 102,
          reason: 'Song present in updated source playlist'
        },
        { type: 'REMOVE_SONG' as const, songId: 999, reason: 'Song removed from source playlist' }
      ]
    };

    const result = await executor.executeSync(syncPlan);

    expect(result.success).toBe(true);
    expect(result.appliedAdditionsCount).toBe(1);
    expect(result.appliedRemovalsCount).toBe(1);
    expect(mockSyncPersistence.removeEntries).toHaveBeenCalledWith(10, [999]);
    expect(mockSyncPersistence.addEntries).toHaveBeenCalledWith(10, [{ songId: 102, position: 1 }]);
  });
});
