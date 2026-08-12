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
    const applyResult = await autoTagService.applyPreview(preview, undefined, undefined, 'op-apply');
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

  it('updates all 7 metadata fields in DB fallback when applyPreview is called', async () => {
    const tagWriter = new TagWriterService();
    vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

    const preview: any = {
      album: { title: 'Test Album' },
      matches: [
        {
          localSongId: 42,
          songPath: 'song.mp3',
          oldTitle: 'Old Title',
          oldArtist: 'Old Artist',
          applyTrack: true,
          fieldDiffs: [
            { fieldId: 'title', applyField: true, userValue: 'New Title' },
            { fieldId: 'artist', applyField: true, userValue: 'New Artist' },
            { fieldId: 'album', applyField: true, userValue: 'Test Album' },
            { fieldId: 'genre', applyField: true, userValue: 'Pop' },
            { fieldId: 'year', applyField: true, userValue: 2024 },
            { fieldId: 'trackNumber', applyField: true, userValue: 1 },
            { fieldId: 'discNumber', applyField: true, userValue: 2 }
          ]
        }
      ]
    };

    const result = await applyService.applyPreview(preview, { replaceArtwork: false });
    expect(result.success).toBe(true);
    expect(dbUpdater).toHaveBeenCalledWith(42, {
      title: 'New Title',
      artist: 'New Artist',
      album: 'Test Album',
      genre: 'Pop',
      year: 2024,
      trackNumber: 1,
      discNumber: 2
    });
  });

  it('omits artworkBuffer when replaceArtwork is false', async () => {
    const tagWriter = new TagWriterService();
    const writeBatchSpy = vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

    const preview: any = {
      album: { title: 'Test Album', artwork: { primaryPath: 'http://example.com/cover.jpg' } },
      matches: [
        {
          localSongId: 1,
          songPath: 'song.mp3',
          oldTitle: 'Old Title',
          applyTrack: true,
          fieldDiffs: [{ fieldId: 'title', applyField: true, userValue: 'New Title' }]
        }
      ]
    };

    const result = await applyService.applyPreview(preview, { replaceArtwork: false });
    expect(result.success).toBe(true);
    const passedPayload = writeBatchSpy.mock.calls[0][0][0];
    expect(passedPayload.artworkBuffer).toBeUndefined();
  });

  it('applies text metadata successfully even when artwork download fails or times out', async () => {
    const tagWriter = new TagWriterService();
    const writeBatchSpy = vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

    // Mock fetch to simulate 404 / network failure
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const preview: any = {
      album: { title: 'Test Album' },
      matches: [
        {
          localSongId: 1,
          songPath: 'song.mp3',
          oldTitle: 'Old Title',
          applyTrack: true,
          fieldDiffs: [{ fieldId: 'title', applyField: true, userValue: 'New Title' }]
        }
      ]
    };

    const result = await applyService.applyPreview(preview, { replaceArtwork: true, artworkUrl: 'http://invalid.url/404.jpg' });
    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);

    const passedPayload = writeBatchSpy.mock.calls[0][0][0];
    expect(passedPayload.artworkBuffer).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('[C-CRIT-1 regression] undo restores all 7 metadata fields via dbUpdater, not just title/year/trackNumber', async () => {
    const tagWriter = new TagWriterService();
    vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

    const preview: any = {
      album: { title: 'SOUR' },
      matches: [
        {
          localSongId: 42,
          songPath: 'song.mp3',
          oldTitle: 'Old Title',
          oldArtist: 'Old Artist',
          oldAlbum: 'Old Album',
          oldYear: 2020,
          oldTrackNumber: 5,
          oldDiscNumber: 2,
          oldGenre: 'Rock',
          applyTrack: true,
          fieldDiffs: [
            { fieldId: 'title', applyField: true, suggestedValue: 'New Title' },
            { fieldId: 'artist', applyField: true, suggestedValue: 'New Artist' },
            { fieldId: 'album', applyField: true, suggestedValue: 'SOUR' },
            { fieldId: 'genre', applyField: true, suggestedValue: 'Pop' },
            { fieldId: 'year', applyField: true, suggestedValue: 2021 },
            { fieldId: 'trackNumber', applyField: true, suggestedValue: 1 },
            { fieldId: 'discNumber', applyField: true, suggestedValue: 1 }
          ]
        }
      ]
    };

    // Apply first
    const applyResult = await applyService.applyPreview(preview, { replaceArtwork: false });
    expect(applyResult.success).toBe(true);

    // Now undo
    const undoResult = await applyService.undoLastAutoTag();
    expect(undoResult.success).toBe(true);
    expect(undoResult.restoredCount).toBe(1);

    // dbUpdater should have been called twice: once for apply, once for undo
    expect(dbUpdater).toHaveBeenCalledTimes(2);

    // Verify the UNDO call restores ALL 7 fields
    const undoCall = dbUpdater.mock.calls[1];
    expect(undoCall[0]).toBe(42); // songId
    expect(undoCall[1]).toEqual({
      title: 'Old Title',
      artist: 'Old Artist',
      album: 'Old Album',
      genre: 'Rock',
      year: 2020,
      trackNumber: 5,
      discNumber: 2
    });
  });

  it('[C-CRIT-2 regression] partial batch write failure rolls back successfully-written files before the failure', async () => {
    const tagWriter = new TagWriterService();

    // First call: writeBatch for apply — song1 succeeds, song2 succeeds, song3 fails
    const writeBatchSpy = vi.spyOn(tagWriter, 'writeBatch')
      .mockResolvedValueOnce([
        { filePath: 'song1.mp3', success: true },
        { filePath: 'song2.mp3', success: true },
        { filePath: 'song3.mp3', success: false, error: 'Permission denied' }
      ])
      // Second call: writeBatch for rollback of song1 + song2
      .mockResolvedValueOnce([
        { filePath: 'song1.mp3', success: true },
        { filePath: 'song2.mp3', success: true }
      ]);

    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

    const preview: any = {
      album: { title: 'Test Album' },
      matches: [
        {
          localSongId: 1,
          songPath: 'song1.mp3',
          oldTitle: 'Song 1 Old',
          oldArtist: 'Artist Old',
          applyTrack: true,
          fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'Song 1 New' }]
        },
        {
          localSongId: 2,
          songPath: 'song2.mp3',
          oldTitle: 'Song 2 Old',
          oldArtist: 'Artist Old',
          applyTrack: true,
          fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'Song 2 New' }]
        },
        {
          localSongId: 3,
          songPath: 'song3.mp3',
          oldTitle: 'Song 3 Old',
          oldArtist: 'Artist Old',
          applyTrack: true,
          fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'Song 3 New' }]
        }
      ]
    };

    const result = await applyService.applyPreview(preview, { replaceArtwork: false });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Permission denied');

    // writeBatch should have been called TWICE: once for apply, once for rollback
    expect(writeBatchSpy).toHaveBeenCalledTimes(2);

    // The rollback call should only include the 2 successfully-written files (not the failed one)
    const rollbackCall = writeBatchSpy.mock.calls[1][0];
    expect(rollbackCall).toHaveLength(2);
    expect(rollbackCall[0].filePath).toBe('song1.mp3');
    expect(rollbackCall[1].filePath).toBe('song2.mp3');

    // Verify rollback payloads restore OLD metadata
    expect(rollbackCall[0].title).toBe('Song 1 Old');
    expect(rollbackCall[1].title).toBe('Song 2 Old');

    // DB updater should NOT have been called (no DB writes should happen on batch failure)
    expect(dbUpdater).not.toHaveBeenCalled();
  });
});
