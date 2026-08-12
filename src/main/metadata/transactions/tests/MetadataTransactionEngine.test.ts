import { describe, expect, it, vi } from 'vitest';
import { MetadataTransactionManager } from '../MetadataTransactionManager';
import type { ResourceMutationPayload } from '../../domain/MetadataTransaction';

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
          { fieldId: 'title', oldValue: 'brutal (audio)', newValue: 'brutal', providerId: 'musicbrainz', confidenceScore: 0.98 }
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
});
