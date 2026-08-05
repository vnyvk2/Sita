import { describe, expect, it, vi } from 'vitest';
import { AlbumAutoTagService } from '../AlbumAutoTagService';
import { AlbumMetadataService } from '../AlbumMetadataService';
import { MetadataProviderRuntime } from '../../runtime/MetadataProviderRuntime';
import { MusicBrainzAdapter } from '../../providers/musicbrainz/MusicBrainzAdapter';
import { MusicBrainzApiClient } from '../../providers/musicbrainz/MusicBrainzApiClient';
import { RequestPipeline } from '../../../platform/networking/RequestPipeline';
import { IdentityResolutionCache } from '../../cache/IdentityResolutionCache';
import { MetadataApplyService } from '../MetadataApplyService';
import { TagWriterService } from '../TagWriterService';
import type { AutoTagStage } from '../../models/AlbumTagPreview';

describe('Phase 4 — AutoTag Workflow & Production-Grade Pipeline Suite', () => {
  it('executes search -> buildPreview -> user edits -> transactional apply -> complete undo flow', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new MusicBrainzApiClient(pipeline);
    const cache = new IdentityResolutionCache();
    const adapter = new MusicBrainzAdapter(apiClient, { cache });
    const runtime = new MetadataProviderRuntime(adapter);
    await runtime.initialize();

    const metadataService = new AlbumMetadataService(runtime);
    const tagWriter = new TagWriterService();
    vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([{ filePath: '01.mp3', success: true }]);
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });
    const autoTagService = new AlbumAutoTagService({ albumMetadataService: metadataService, applyService });

    // Mock API search releases
    vi.spyOn(apiClient, 'searchReleases').mockResolvedValueOnce([
      {
        id: 'mb-rel-sour',
        title: 'SOUR',
        date: '2021-05-21',
        status: 'Official',
        'artist-credit': [{ name: 'Olivia Rodrigo' }],
        media: [{ position: 1, 'track-count': 3 }]
      } as any
    ]);

    // Mock API get release details
    vi.spyOn(apiClient, 'getReleaseById').mockResolvedValue({
      id: 'mb-rel-sour',
      title: 'SOUR',
      date: '2021-05-21',
      status: 'Official',
      'artist-credit': [{ name: 'Olivia Rodrigo' }],
      media: [
        {
          position: 1,
          tracks: [
            { id: 't1', title: 'brutal', length: 203000, position: 1, recording: { id: 'rec-1' } },
            { id: 't2', title: 'traitor', length: 229000, position: 2, recording: { id: 'rec-2' } },
            { id: 't3', title: 'drivers license', length: 242000, position: 3, recording: { id: 'rec-3' } }
          ]
        }
      ]
    } as any);

    // Track progress events
    const stages: AutoTagStage[] = [];
    autoTagService.on('progress', (payload) => {
      stages.push(payload.stage);
    });

    // 1. Search Releases
    const releases = await autoTagService.searchReleases('SOUR', 'Olivia Rodrigo', 10, undefined, 'op-search');
    expect(releases).toHaveLength(1);
    expect(stages).toContain('searching');
    expect(stages).toContain('completed');

    // 2. Build Preview
    const localSongs = [
      { songId: 101, title: 'brutal (audio)', artist: 'Olivia Rodrigo', path: '01.mp3', duration: 203, trackNumber: 1 },
      { songId: 102, title: 'traitor', artist: 'Olivia Rodrigo', path: '02.mp3', duration: 229, trackNumber: 2 },
      { songId: 103, title: 'drivers license', artist: 'Olivia Rodrigo', path: '03.mp3', duration: 242, trackNumber: 3 }
    ];

    const preview = await autoTagService.buildPreview(localSongs, releases[0].releaseId!, releases[0].provider, undefined, 'op-preview');
    expect(preview.matches).toHaveLength(3);
    expect(preview.overallConfidence).toBeGreaterThanOrEqual(0.90);
    expect(preview.confidenceLevel).toBe('Excellent');
    expect(preview.resolvedRelease).not.toBeUndefined();

    // 3. Apply Preview
    const applyResult = await autoTagService.applyPreview(preview, undefined, 'op-apply');
    expect(applyResult.success).toBe(true);
    expect(applyResult.updatedCount).toBe(3);

    // 4. Undo Last AutoTag (Restores BOTH physical file tags AND DB records)
    const undoResult = await autoTagService.undoLastAutoTag('op-undo');
    expect(undoResult.success).toBe(true);
    expect(undoResult.restoredCount).toBe(3);
  });

  it('rolls back physical file tags and reports errors on DB update failure', async () => {
    const tagWriter = new TagWriterService();
    const writeBatchSpy = vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
    const dbUpdater = vi.fn().mockRejectedValue(new Error('SQLite lock exception'));
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

    const preview: any = {
      album: { title: 'Test Album' },
      matches: [
        {
          localSongId: 1,
          songPath: 'song.mp3',
          oldTitle: 'Old Title',
          applyTrack: true,
          fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'New Title' }]
        }
      ]
    };

    const result = await applyService.applyPreview(preview);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('DB transaction failed, rolled back physical file tags');
    expect(writeBatchSpy).toHaveBeenCalledTimes(2);
  });

  it('supports operationId-keyed concurrent cancellation and cleans up operation map', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new MusicBrainzApiClient(pipeline);
    const adapter = new MusicBrainzAdapter(apiClient);
    const runtime = new MetadataProviderRuntime(adapter);
    await runtime.initialize();

    const metadataService = new AlbumMetadataService(runtime);
    const autoTagService = new AlbumAutoTagService({ albumMetadataService: metadataService });

    const signal1 = autoTagService.createAbortSignal('op-1');

    // Cancel op-1
    autoTagService.cancel('op-1');

    await expect(autoTagService.searchReleases('SOUR', 'Olivia Rodrigo', 10, signal1, 'op-1')).rejects.toThrow(/aborted/);
  });
});
