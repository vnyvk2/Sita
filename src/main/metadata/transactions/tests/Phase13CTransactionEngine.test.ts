import { describe, expect, it, vi } from 'vitest';
import { MetadataTransactionManager } from '../MetadataTransactionManager';
import { TagWriterService } from '../../services/TagWriterService';
import type { ResourceMutationPayload } from '../../domain/MetadataTransaction';

describe('Phase 13C — Unified Transaction Manager Blueprint Test Suite', () => {
  it('executes atomic mutations via MetadataTransactionManager and generates UndoToken', async () => {
    const mockTagWriter = new TagWriterService();
    vi.spyOn(mockTagWriter, 'writeBatch').mockResolvedValue([
      { filePath: 'song.mp3', success: true }
    ]);

    const txManager = new MetadataTransactionManager({
      tagWriter: mockTagWriter
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
    expect(result.undoToken?.affectedResourceIds).toEqual([101]);
  });

  it('handles missing file path validation errors cleanly', async () => {
    const txManager = new MetadataTransactionManager();

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
