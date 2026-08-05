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

describe('Phase 4 — AutoTag Workflow & Preview Integration Suite', () => {
  it('executes search -> buildPreview -> user edits -> transactional apply -> undo flow', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new MusicBrainzApiClient(pipeline);
    const cache = new IdentityResolutionCache();
    const adapter = new MusicBrainzAdapter(apiClient, { cache });
    const runtime = new MetadataProviderRuntime(adapter);
    await runtime.initialize();

    const metadataService = new AlbumMetadataService(runtime);
    const tagWriter = new TagWriterService();
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
    const releases = await autoTagService.searchReleases('SOUR', 'Olivia Rodrigo');
    expect(releases).toHaveLength(1);
    expect(stages).toContain('searching');

    // 2. Build Preview
    const localSongs = [
      { songId: 101, title: 'brutal (audio)', artist: 'Olivia Rodrigo', path: '01.mp3', duration: 203 },
      { songId: 102, title: 'traitor', artist: 'Olivia Rodrigo', path: '02.mp3', duration: 229 },
      { songId: 103, title: 'drivers license', artist: 'Olivia Rodrigo', path: '03.mp3', duration: 242 }
    ];

    const preview = await autoTagService.buildPreview(localSongs, releases[0].releaseId!, releases[0].provider);
    expect(preview.matches).toHaveLength(3);
    expect(preview.overallConfidence).toBeGreaterThanOrEqual(0.90);
    expect(stages).toContain('resolving');
    expect(stages).toContain('matching');
    expect(stages).toContain('diffing');

    // Verify per-field MetadataDiff for track 1 (brutal)
    const track1 = preview.matches[0];
    const titleDiff = track1.fieldDiffs.find((f) => f.fieldId === 'title');
    expect(titleDiff?.oldValue).toBe('brutal (audio)');
    expect(titleDiff?.suggestedValue).toBe('brutal');
    expect(titleDiff?.status).toBe('changed');
    expect(titleDiff?.applyField).toBe(true);

    // 3. User edits preview (User override edit on Artist)
    const artistDiff = track1.fieldDiffs.find((f) => f.fieldId === 'artist');
    if (artistDiff) {
      artistDiff.userValue = 'Olivia Rodrigo (Featured)';
    }

    // 4. Apply Preview
    const applyResult = await autoTagService.applyPreview(preview);
    expect(applyResult.success).toBe(true);
    expect(applyResult.updatedCount).toBe(3);
    expect(dbUpdater).toHaveBeenCalledTimes(3);
    expect(stages).toContain('applying');
    expect(stages).toContain('completed');

    // 5. Undo Last AutoTag
    const undoResult = await autoTagService.undoLastAutoTag();
    expect(undoResult.success).toBe(true);
    expect(undoResult.restoredCount).toBe(3);
    expect(dbUpdater).toHaveBeenCalledTimes(6); // 3 apply + 3 restore
  });

  it('supports cancellation via AbortController', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new MusicBrainzApiClient(pipeline);
    const adapter = new MusicBrainzAdapter(apiClient);
    const runtime = new MetadataProviderRuntime(adapter);
    await runtime.initialize();

    const metadataService = new AlbumMetadataService(runtime);
    const autoTagService = new AlbumAutoTagService({ albumMetadataService: metadataService });

    const signal = autoTagService.createAbortSignal();
    autoTagService.cancel();

    await expect(autoTagService.searchReleases('SOUR', 'Olivia Rodrigo', 10, signal)).rejects.toThrow(/aborted/);
    expect(autoTagService.currentStage).toBe('cancelled');
  });
});
