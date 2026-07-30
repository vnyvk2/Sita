import { describe, it, expect, vi } from 'vitest';
import { PlaylistSourceTracker } from '@main/playlistSync/services/PlaylistSourceTracker';
import { PlaylistSyncPlanner } from '@main/playlistSync/planner/PlaylistSyncPlanner';
import { PlaylistSyncExecutor } from '@main/playlistSync/executor/PlaylistSyncExecutor';
import { PlaylistSyncWorkflow } from '@main/playlistSync/workflow/PlaylistSyncWorkflow';
import type { PlaylistLink } from '@main/playlistSync/models/PlaylistLink';
import type { PlaylistImportPlan } from '@main/playlistImport/models/PlaylistImportPlan';
import type { FileSystemAccess } from '@main/playlistImport/interfaces/FileSystemAccess';
import type { PlaylistPersistence } from '@main/playlistImport/interfaces/PlaylistPersistence';
import type { TransactionRunner } from '@main/playlistImport/interfaces/TransactionRunner';
import type { PlaylistImportPipeline } from '@main/playlistImport/pipeline/PlaylistImportPipeline';

describe('Playlist Synchronization Framework (Phase 10)', () => {
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
              resolvedTrack: { track: { originalLocation: 'song1.mp3' }, resolution: { originalReference: 'song1.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 101 }
            }
          }
        },
        {
          decision: 'IMPORT',
          source: {
            position: 2,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'song2.mp3' }, resolution: { originalReference: 'song2.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 102 }
            }
          }
        }
      ]
    };

    // Current Nora playlist contains songId 101 and stale songId 999
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

  it('should execute sync plan inside transaction and apply additions', async () => {
    const mockPersistence: PlaylistPersistence = {
      createPlaylist: vi.fn(async () => 10),
      addEntries: vi.fn(async () => {})
    };

    const mockTransactionRunner: TransactionRunner = {
      runInTransaction: vi.fn(async (work) => await work())
    };

    const executor = new PlaylistSyncExecutor(mockPersistence, mockTransactionRunner);

    const syncPlan = {
      linkId: 'link_1',
      playlistId: 10,
      sourceFile: '/playlists/rock.m3u',
      syncPolicy: 'ONE_WAY_SOURCE_WINS' as const,
      hasChanges: true,
      additionsCount: 1,
      removalsCount: 0,
      operations: [
        { type: 'ADD_SONG' as const, songId: 102, reason: 'Song present in updated source playlist' }
      ]
    };

    const result = await executor.executeSync(syncPlan);

    expect(result.success).toBe(true);
    expect(result.appliedAdditionsCount).toBe(1);
    expect(mockPersistence.addEntries).toHaveBeenCalledWith(10, [{ songId: 102, position: 1 }]);
  });
});
