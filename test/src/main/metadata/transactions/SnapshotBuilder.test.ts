import { describe, expect, it, vi } from 'vitest';
import { SnapshotBuilder, type DraftSnapshot } from '@main/metadata/transactions/SnapshotBuilder';
import { MetadataTransactionManager } from '@main/metadata/transactions/MetadataTransactionManager';
import type { ResourceMutationPayload } from '@main/metadata/domain/MetadataTransaction';

describe('SnapshotBuilder', () => {
  it('captures all 7 mutable metadata fields in both previousSongs and updatedSongs', () => {
    const drafts: DraftSnapshot[] = [
      {
        songId: 42,
        filePath: '/music/album/track01.mp3',
        previousTags: {
          title: 'Old Title',
          artist: 'Old Artist',
          album: 'Old Album',
          year: 2000,
          trackNumber: 1,
          discNumber: 1,
          genre: 'Rock'
        },
        appliedTags: {
          title: 'New Title',
          artist: 'New Artist',
          album: 'New Album',
          year: 2024,
          trackNumber: 5,
          discNumber: 2,
          genre: 'Indie Rock'
        }
      }
    ];

    const undoToken = {
      id: 'undo-123',
      operationId: 'op-01',
      timestamp: Date.now(),
      description: 'AutoTag apply',
      affectedResourceIds: [42]
    };

    const snapshot = SnapshotBuilder.buildHistorySnapshot('op-01', undoToken, drafts);

    expect(snapshot.previousSongs).toHaveLength(1);
    const prev = snapshot.previousSongs[0];
    expect(prev.songId).toBe(42);
    expect(prev.path).toBe('/music/album/track01.mp3');
    expect(prev.title).toBe('Old Title');
    expect(prev.artist).toBe('Old Artist');
    expect(prev.album).toBe('Old Album');
    expect(prev.year).toBe(2000);
    expect(prev.trackNumber).toBe(1);
    expect(prev.discNumber).toBe(1);
    expect(prev.genre).toBe('Rock');

    expect(snapshot.updatedSongs).toHaveLength(1);
    const updated = snapshot.updatedSongs[0];
    expect(updated.title).toBe('New Title');
    expect(updated.artist).toBe('New Artist');
    expect(updated.album).toBe('New Album');
    expect(updated.year).toBe(2024);
    expect(updated.trackNumber).toBe(5);
    expect(updated.discNumber).toBe(2);
    expect(updated.genre).toBe('Indie Rock');
  });

  it('handles undefined optional fields gracefully without inserting NaN', () => {
    const drafts: DraftSnapshot[] = [
      {
        songId: 43,
        filePath: '/music/minimal.mp3',
        previousTags: {
          title: 'Minimal'
        },
        appliedTags: {
          title: 'Minimal (AutoTagged)'
        }
      }
    ];

    const undoToken = {
      id: 'undo-456',
      operationId: 'op-02',
      timestamp: Date.now(),
      description: 'Minimal apply',
      affectedResourceIds: [43]
    };

    const snapshot = SnapshotBuilder.buildHistorySnapshot('op-02', undoToken, drafts);
    const prev = snapshot.previousSongs[0];
    expect(prev.trackNumber).toBeUndefined();
    expect(prev.discNumber).toBeUndefined();
    expect(prev.genre).toBeUndefined();
  });
});

describe('MetadataTransactionManager Rollback', () => {
  it('restores trackNumber, discNumber, and genre along with standard tags on rollback', async () => {
    let lastPassedTags: Record<string, string | number | undefined> | null = null;
    const mockDbUpdater = vi.fn().mockImplementation(async (_songId: number, tags: Record<string, string | number | undefined>) => {
      lastPassedTags = tags;
      return true;
    });

    const txManager = new MetadataTransactionManager({
      dbUpdater: mockDbUpdater
    });

    const mutations: ResourceMutationPayload[] = [
      {
        resourceId: 200,
        filePath: '/music/test.mp3',
        fieldMutations: [
          { fieldId: 'title', oldValue: 'Original Title', newValue: 'New Title' },
          { fieldId: 'artist', oldValue: 'Original Artist', newValue: 'New Artist' },
          { fieldId: 'album', oldValue: 'Original Album', newValue: 'New Album' },
          { fieldId: 'year', oldValue: 1995, newValue: 2025 },
          { fieldId: 'trackNumber', oldValue: 3, newValue: 7 },
          { fieldId: 'discNumber', oldValue: 1, newValue: 2 },
          { fieldId: 'genre', oldValue: 'Grunge', newValue: 'Pop' }
        ]
      }
    ];

    const txResult = await txManager.executeTransaction('op-all-fields', mutations);
    expect(txResult.success).toBe(true);

    // Now trigger rollback
    const rollbackResult = await txManager.rollbackLastTransaction();
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.revertedCount).toBe(1);

    // Verify all 7 fields were passed back to dbUpdater
    expect(lastPassedTags).toEqual({
      title: 'Original Title',
      artist: 'Original Artist',
      album: 'Original Album',
      year: 1995,
      trackNumber: 3,
      discNumber: 1,
      genre: 'Grunge'
    });
  });
});
