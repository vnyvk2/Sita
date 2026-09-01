import { describe, expect, it, vi } from 'vitest';

import type { ResourceMutationPayload } from '../../domain/MetadataTransaction';
import { MetadataTransactionManager } from '../MetadataTransactionManager';

describe('Metadata Transaction Manager Blueprint Test Suite', () => {
  it('executes atomic mutations via MetadataTransactionManager and records UndoToken snapshots', async () => {
    const mockDbUpdater = vi.fn().mockResolvedValue(true);

    const txManager = new MetadataTransactionManager({
      dbUpdater: mockDbUpdater
    });

    const mutations: ResourceMutationPayload[] = [
      {
        resourceId: 101,
        filePath: 'song.mp3',
        fieldMutations: [
          {
            fieldId: 'title',
            oldValue: 'brutal (audio)',
            newValue: 'brutal',
            providerId: 'musicbrainz',
            confidenceScore: 0.98
          }
        ]
      }
    ];

    const result = await txManager.executeTransaction('op-sour', mutations);

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.undoToken).toBeDefined();
    expect(result.undoToken?.operationId).toBe('op-sour');
    expect(mockDbUpdater).toHaveBeenCalled();

    // Verify snapshot recorded in history
    expect(txManager.history.canUndo).toBe(true);

    // Rollback transaction
    const rollbackRes = await txManager.rollbackLastTransaction();
    expect(rollbackRes.success).toBe(true);
    expect(rollbackRes.revertedCount).toBe(1);
    expect(txManager.history.canUndo).toBe(false);
  });

  it('handles missing file path validation errors cleanly', async () => {
    const txManager = new MetadataTransactionManager({
      dbUpdater: vi.fn().mockResolvedValue(true)
    });

    const mutations: ResourceMutationPayload[] = [
      {
        resourceId: 102,
        fieldMutations: [{ fieldId: 'title', newValue: 'test' }]
      }
    ];

    const result = await txManager.executeTransaction('op-err', mutations);

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain('missing file path');
  });

  it('delivers artwork through the full chain: tagPayload reaches dbUpdater as artworkBuffer', async () => {
    const artworkBuffer = Buffer.from('fake-image-bytes');
    const mockDbUpdater = vi.fn().mockResolvedValue(true);
    const fakeDownloader = {
      fetchAndValidateArtwork: vi.fn().mockResolvedValue(artworkBuffer)
    };

    const txManager = new MetadataTransactionManager({
      dbUpdater: mockDbUpdater,
      artworkDownloader: fakeDownloader as any
    });

    const mutations: ResourceMutationPayload[] = [
      {
        resourceId: 103,
        filePath: 'song-with-art.mp3',
        fieldMutations: [
          {
            fieldId: 'title',
            oldValue: 'old',
            newValue: 'with art',
            providerId: 'musicbrainz',
            confidenceScore: 0.95
          }
        ]
      }
    ];

    const result = await txManager.executeTransaction('op-art', mutations, {
      replaceArtwork: true,
      artworkUrl: 'https://coverartarchive.org/release/xyz/front.jpg'
    });

    expect(result.success).toBe(true);
    expect(fakeDownloader.fetchAndValidateArtwork).toHaveBeenCalledWith(
      'https://coverartarchive.org/release/xyz/front.jpg'
    );

    // The four-link chain must deliver the buffer to the persistence owner
    expect(mockDbUpdater).toHaveBeenCalledTimes(1);
    const updaterData = mockDbUpdater.mock.calls[0][1];
    expect(updaterData.artworkBuffer).toBe(artworkBuffer);
  });

  it('does NOT fabricate artworkBuffer for transactions without artwork changes', async () => {
    const mockDbUpdater = vi.fn().mockResolvedValue(true);

    const txManager = new MetadataTransactionManager({
      dbUpdater: mockDbUpdater
    });

    const mutations: ResourceMutationPayload[] = [
      {
        resourceId: 104,
        filePath: 'plain-song.mp3',
        fieldMutations: [
          {
            fieldId: 'title',
            oldValue: 'a',
            newValue: 'b',
            providerId: 'musicbrainz',
            confidenceScore: 0.9
          }
        ]
      }
    ];

    const result = await txManager.executeTransaction('op-plain', mutations);

    expect(result.success).toBe(true);
    const updaterData = mockDbUpdater.mock.calls[0][1];
    expect(updaterData.artworkBuffer).toBeUndefined();
  });
});
