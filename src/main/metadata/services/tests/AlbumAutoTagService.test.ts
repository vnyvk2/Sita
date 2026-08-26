import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_METADATA_PREFERENCES } from '../../../../common/metadata/preferences';
import { getTrackPreviewKey } from '../../../../common/metadata/preview';
import { RequestPipeline } from '../../../platform/networking/RequestPipeline';
import { IdentityResolutionCache } from '../../cache/IdentityResolutionCache';
import type { AutoTagStage } from '../../models/AlbumTagPreview';
import { MusicBrainzAdapter } from '../../providers/musicbrainz/MusicBrainzAdapter';
import { MusicBrainzApiClient } from '../../providers/musicbrainz/MusicBrainzApiClient';
import { MetadataProviderRuntime } from '../../runtime/MetadataProviderRuntime';
import { AlbumAutoTagService } from '../AlbumAutoTagService';
import { AlbumMetadataService } from '../AlbumMetadataService';
import { MetadataApplyService } from '../MetadataApplyService';
import { TagWriterService } from '../TagWriterService';

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
    vi.spyOn(tagWriter, 'writeBatch').mockImplementation(async (payloads) =>
      payloads.map((p) => ({ filePath: p.filePath, success: true })));
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const applyService = new MetadataApplyService({ tagWriter, dbUpdater });
    const autoTagService = new AlbumAutoTagService({
      albumMetadataService: metadataService,
      applyService
    });

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
            {
              id: 't3',
              title: 'drivers license',
              length: 242000,
              position: 3,
              recording: { id: 'rec-3' }
            }
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
    const releases = await autoTagService.searchReleases('SOUR', 'Olivia Rodrigo', {
      limit: 10,
      targetTrackCount: 11,
      operationId: 'op-search'
    });
    expect(releases).toHaveLength(1);
    expect(stages).toContain('searching');
    expect(stages).toContain('completed');
    expect(releases[0].rankingScore).toBeDefined();

    // 2. Build Preview
    const localSongs = [
      {
        songId: 101,
        title: 'brutal (audio)',
        artist: 'Olivia Rodrigo',
        path: '01.mp3',
        duration: 203,
        trackNumber: 1
      },
      {
        songId: 102,
        title: 'traitor',
        artist: 'Olivia Rodrigo',
        path: '02.mp3',
        duration: 229,
        trackNumber: 2
      },
      {
        songId: 103,
        title: 'drivers license',
        artist: 'Olivia Rodrigo',
        path: '03.mp3',
        duration: 242,
        trackNumber: 3
      }
    ];

    const preview = await autoTagService.buildPreview(
      localSongs,
      releases[0].releaseId!,
      releases[0].provider,
      undefined,
      'op-preview'
    );
    expect(preview.matches).toHaveLength(3);
    expect(preview.overallConfidence).toBeGreaterThanOrEqual(0.9);
    expect(preview.confidenceLevel).toBe('Excellent');
    expect(preview.resolvedRelease).not.toBeUndefined();

    // 3. Apply Preview
    const applyResult = await autoTagService.applyPreview(
      preview,
      undefined,
      undefined,
      'op-apply'
    );
    expect(applyResult.success).toBe(true);
    expect(applyResult.updatedCount).toBe(3);

    // 4. Undo Last AutoTag (Restores BOTH physical file tags AND DB records)
    const undoResult = await autoTagService.undoLastAutoTag('op-undo');
    expect(undoResult.success).toBe(true);
    expect(undoResult.restoredCount).toBe(3);
  });

  it('rolls back physical file tags and reports errors on DB update failure', async () => {
    const tagWriter = new TagWriterService();
    const writeBatchSpy = vi
      .spyOn(tagWriter, 'writeBatch')
      .mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
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

    await expect(
      autoTagService.searchReleases(
        'SOUR',
        'Olivia Rodrigo',
        { limit: 10, operationId: 'op-1' },
        signal1
      )
    ).rejects.toThrow(/aborted/);
  });

  it('forwards targetTrackCount to AlbumMetadataService.search', async () => {
    const mockMetadataService = {
      search: vi.fn().mockResolvedValue([]),
      searchAlbums: vi.fn().mockResolvedValue([]),
      resolveRelease: vi.fn().mockResolvedValue(null),
      buildAlbumMatch: vi.fn(),
      applyAlbum: vi.fn()
    };

    const autoTagService = new AlbumAutoTagService({
      albumMetadataService: mockMetadataService as any
    });
    await autoTagService.searchReleases('SOUR', 'Olivia Rodrigo', {
      limit: 10,
      targetTrackCount: 11,
      operationId: 'op-track-count'
    });

    expect(mockMetadataService.search).toHaveBeenCalledWith(
      'SOUR',
      'Olivia Rodrigo',
      expect.objectContaining({ limit: 10, targetTrackCount: 11, operationId: 'op-track-count' })
    );
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
    const writeBatchSpy = vi
      .spyOn(tagWriter, 'writeBatch')
      .mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
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
    const writeBatchSpy = vi
      .spyOn(tagWriter, 'writeBatch')
      .mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
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

    const result = await applyService.applyPreview(preview, {
      replaceArtwork: true,
      artworkUrl: 'http://invalid.url/404.jpg'
    });
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
    const writeBatchSpy = vi
      .spyOn(tagWriter, 'writeBatch')
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

  describe('Independent Album-Level and Track-Level Mutation Contracts', () => {
    it('applies global album mutations successfully even when 0 / 11 tracks are selected', async () => {
      const tagWriter = new TagWriterService();
      const writeBatchSpy = vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([
        { filePath: '01.mp3', success: true },
        { filePath: '02.mp3', success: true }
      ]);
      const dbUpdater = vi.fn().mockResolvedValue(undefined);
      const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

      const preview: any = {
        album: { title: 'SOUR', artist: 'Olivia Rodrigo', year: 2021 },
        matches: [
          {
            localSongId: 101,
            songPath: '01.mp3',
            oldTitle: 'brutal',
            oldArtist: 'Olivia Rodrigo',
            oldAlbum: 'SOUR',
            applyTrack: false, // 0 tracks selected!
            fieldDiffs: [
              { fieldId: 'title', applyField: true, suggestedValue: 'brutal (remastered)' }
            ]
          },
          {
            localSongId: 102,
            songPath: '02.mp3',
            oldTitle: 'traitor',
            oldArtist: 'Olivia Rodrigo',
            oldAlbum: 'SOUR',
            applyTrack: false, // 0 tracks selected!
            fieldDiffs: [
              { fieldId: 'title', applyField: true, suggestedValue: 'traitor (remastered)' }
            ]
          }
        ]
      };

      const options = {
        globalMutations: {
          albumArtist: 'Olivia Rodrigo',
          genre: 'Pop',
          applyAlbumArtist: true,
          applyGenre: true
        }
      };

      const result = await applyService.applyPreview(preview, options);

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(2);
      expect(writeBatchSpy).toHaveBeenCalledTimes(1);

      const writePayloads = writeBatchSpy.mock.calls[0][0];
      expect(writePayloads).toHaveLength(2);
      // Album-level fields are applied
      expect(writePayloads[0].albumArtist).toBe('Olivia Rodrigo');
      expect(writePayloads[0].genre).toBe('Pop');
      // Track-level fields remain UNTOUCHED because applyTrack was false
      expect(writePayloads[0].title).toBeUndefined();
    });

    it('applies track-level mutations when tracks are selected and global mutations are empty', async () => {
      const tagWriter = new TagWriterService();
      const writeBatchSpy = vi
        .spyOn(tagWriter, 'writeBatch')
        .mockResolvedValue([{ filePath: '01.mp3', success: true }]);
      const dbUpdater = vi.fn().mockResolvedValue(undefined);
      const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

      const preview: any = {
        album: { title: 'SOUR' },
        matches: [
          {
            localSongId: 101,
            songPath: '01.mp3',
            oldTitle: 'brutal (demo)',
            oldArtist: 'Olivia',
            applyTrack: true,
            fieldDiffs: [
              { fieldId: 'title', applyField: true, suggestedValue: 'brutal' },
              { fieldId: 'artist', applyField: true, suggestedValue: 'Olivia Rodrigo' }
            ]
          }
        ]
      };

      const result = await applyService.applyPreview(preview);

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(1);
      expect(writeBatchSpy).toHaveBeenCalledTimes(1);

      const writePayloads = writeBatchSpy.mock.calls[0][0];
      expect(writePayloads[0].title).toBe('brutal');
      expect(writePayloads[0].artist).toBe('Olivia Rodrigo');
    });

    it('applies global album mutations and partial track selections in one apply operation', async () => {
      const tagWriter = new TagWriterService();
      const writeBatchSpy = vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([
        { filePath: '01.mp3', success: true },
        { filePath: '02.mp3', success: true }
      ]);
      const dbUpdater = vi.fn().mockResolvedValue(undefined);
      const applyService = new MetadataApplyService({ tagWriter, dbUpdater });

      const preview: any = {
        album: { title: 'SOUR', artist: 'Olivia Rodrigo' },
        matches: [
          {
            localSongId: 101,
            songPath: '01.mp3',
            oldTitle: 'brutal (demo)',
            applyTrack: true, // Selected for track mutation
            fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'brutal' }]
          },
          {
            localSongId: 102,
            songPath: '02.mp3',
            oldTitle: 'traitor',
            applyTrack: false, // NOT selected for track mutation
            fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'traitor (deluxe)' }]
          }
        ]
      };

      const options = {
        globalMutations: {
          albumArtist: 'Olivia Rodrigo',
          genre: 'Pop',
          applyAlbumArtist: true,
          applyGenre: true
        }
      };

      const result = await applyService.applyPreview(preview, options);

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(2);

      const writePayloads = writeBatchSpy.mock.calls[0][0];
      // Track 101: received both global mutations AND track title mutation
      expect(writePayloads[0].albumArtist).toBe('Olivia Rodrigo');
      expect(writePayloads[0].genre).toBe('Pop');
      expect(writePayloads[0].title).toBe('brutal');

      // Track 102: received global mutations ONLY (title left untouched)
      expect(writePayloads[1].albumArtist).toBe('Olivia Rodrigo');
      expect(writePayloads[1].genre).toBe('Pop');
      expect(writePayloads[1].title).toBeUndefined();
    });

    it('builds full album tracklist with multi-disc release, eliminates fabricated diffs, and protects apply boundary', async () => {
      const pipeline = new RequestPipeline();
      const apiClient = new MusicBrainzApiClient(pipeline);
      const cache = new IdentityResolutionCache();
      const adapter = new MusicBrainzAdapter(apiClient, { cache });
      const runtime = new MetadataProviderRuntime(adapter);
      await runtime.initialize();

      const metadataService = new AlbumMetadataService(runtime);
      const tagWriter = new TagWriterService();
      const writeBatchSpy = vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([
        { filePath: 'd1_t2.mp3', success: true },
        { filePath: 'd2_t2.mp3', success: true }
      ]);
      const dbUpdater = vi.fn().mockResolvedValue(undefined);
      const applyService = new MetadataApplyService({ tagWriter, dbUpdater });
      const autoTagService = new AlbumAutoTagService({
        albumMetadataService: metadataService,
        applyService
      });

      // Mock multi-disc release (2 discs, 2 tracks each: D1T1, D1T2, D2T1, D2T2)
      vi.spyOn(apiClient, 'getReleaseById').mockResolvedValue({
        id: 'mb-rel-multi',
        title: 'Speakerboxxx / The Love Below',
        date: '2003-09-23',
        status: 'Official',
        'artist-credit': [{ name: 'OutKast' }],
        media: [
          {
            position: 1,
            tracks: [
              {
                id: 't101',
                title: 'Intro (Speakerboxxx)',
                length: 89000,
                position: 1,
                recording: { id: 'rec-101' }
              },
              {
                id: 't102',
                title: 'GhettoMusick',
                length: 236000,
                position: 2,
                recording: { id: 'rec-102' }
              }
            ]
          },
          {
            position: 2,
            tracks: [
              {
                id: 't201',
                title: 'The Love Below (Intro)',
                length: 87000,
                position: 1,
                recording: { id: 'rec-201' }
              },
              {
                id: 't202',
                title: 'Love Hater',
                length: 169000,
                position: 2,
                recording: { id: 'rec-202' }
              }
            ]
          }
        ]
      } as any);

      // User has only 2 local tracks: Disc 1 Track 2 (#102) and Disc 2 Track 2 (#202)
      const localSongs = [
        {
          songId: 102,
          title: 'GhettoMusick',
          artist: 'OutKast',
          path: 'd1_t2.mp3',
          duration: 236,
          trackNumber: 2,
          discNumber: 1
        },
        {
          songId: 202,
          title: 'Love Hater',
          artist: 'OutKast',
          path: 'd2_t2.mp3',
          duration: 169,
          trackNumber: 2,
          discNumber: 2
        }
      ];

      const preview = await autoTagService.buildPreview(localSongs, 'mb-rel-multi', 'musicbrainz');

      // 1. All 4 release tracks must be present in correct multi-disc order!
      expect(preview.matches).toHaveLength(4);

      // 2. Multi-disc ordering invariant: (D1, T1), (D1, T2), (D2, T1), (D2, T2)
      expect(preview.matches[0].discNumber).toBe(1);
      expect(preview.matches[0].trackNumber).toBe(1);
      expect(preview.matches[0].isMissingLocally).toBe(true);
      expect(preview.matches[0].remoteTitle).toBe('Intro (Speakerboxxx)');
      expect(preview.matches[0].fieldDiffs).toHaveLength(0); // NO fabricated diffs!

      expect(preview.matches[1].discNumber).toBe(1);
      expect(preview.matches[1].trackNumber).toBe(2);
      expect(preview.matches[1].localSongId).toBe(102);
      expect(preview.matches[1].isMissingLocally).toBeUndefined();

      expect(preview.matches[2].discNumber).toBe(2);
      expect(preview.matches[2].trackNumber).toBe(1);
      expect(preview.matches[2].isMissingLocally).toBe(true);
      expect(preview.matches[2].remoteTitle).toBe('The Love Below (Intro)');
      expect(preview.matches[2].fieldDiffs).toHaveLength(0); // NO fabricated diffs!

      expect(preview.matches[3].discNumber).toBe(2);
      expect(preview.matches[3].trackNumber).toBe(2);
      expect(preview.matches[3].localSongId).toBe(202);
      expect(preview.matches[3].isMissingLocally).toBeUndefined();

      // 3. Collision-free stable React keys across discs
      const keys = preview.matches.map((m, idx) => getTrackPreviewKey(m, idx));
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(4);
      expect(keys[0]).toContain('missing-d1-t1');
      expect(keys[2]).toContain('missing-d2-t1');

      // 4. Hard Apply Boundary Protection: Applying with global mutations must only mutate local files 102 and 202
      const applyOptions = {
        globalMutations: {
          albumArtist: 'OutKast',
          genre: 'Hip Hop',
          applyAlbumArtist: true,
          applyGenre: true
        }
      };

      const applyResult = await autoTagService.applyPreview(preview, applyOptions);
      expect(applyResult.success).toBe(true);
      expect(applyResult.updatedCount).toBe(2);

      // Verify physical disk writer was only dispatched for the 2 local files
      expect(writeBatchSpy).toHaveBeenCalledTimes(1);
      const writePayloads = writeBatchSpy.mock.calls[0][0];
      expect(writePayloads).toHaveLength(2);
      expect(writePayloads[0].filePath).toBe('d1_t2.mp3');
      expect(writePayloads[1].filePath).toBe('d2_t2.mp3');

      // Verify DB updates were strictly called for 102 and 202 (never 0 or sentinels)
      expect(dbUpdater).toHaveBeenCalledTimes(2);
      expect(dbUpdater).toHaveBeenCalledWith(102, expect.any(Object));
      expect(dbUpdater).toHaveBeenCalledWith(202, expect.any(Object));
    });
  });

  it('builds federation merge policy from preferences and propagates federated genre/artwork onto the album preview', async () => {
    const resolvedAlbum: {
      title: string;
      artist: string;
      year: number;
      genre?: string;
      artwork?: unknown;
    } = {
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      year: 2021
    };

    const mockMetadataService = {
      search: vi.fn().mockResolvedValue([]),
      searchAlbums: vi.fn().mockResolvedValue([]),
      resolveRelease: vi.fn().mockResolvedValue({
        album: resolvedAlbum,
        tracks: [],
        provider: 'musicbrainz',
        providerReleaseId: 'mb-rel-policy'
      }),
      buildAlbumMatch: vi.fn().mockImplementation(async (_songs: unknown[], album: unknown) => ({
        album,
        trackList: [],
        warnings: [],
        confidence: 1,
        changesCount: 0
      })),
      applyAlbum: vi.fn()
    };

    const resolveSpy = vi.fn().mockResolvedValue({
      operationId: 'op-policy',
      resourceId: 1,
      candidates: [],
      mergedResult: {
        title: 'SOUR',
        artist: 'Olivia Rodrigo',
        genre: 'Pop, Alternative Rock',
        artworkUrl: 'https://coverartarchive.org/release/mb-rel-policy/front.jpg',
        fieldAttributions: {},
        fieldAlternatives: {}
      },
      resolvedAt: Date.now()
    });

    const mockPreferencesService = {
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_METADATA_PREFERENCES,
        defaultGenreProvider: 'musicbrainz'
      })
    };

    const autoTagService = new AlbumAutoTagService({
      albumMetadataService: mockMetadataService as any,
      resolutionManager: { resolve: resolveSpy } as any,
      preferencesService: mockPreferencesService as any
    });

    const preview = await autoTagService.buildPreview(
      [{ songId: 1, title: 'brutal', path: 'C:\\music\\01-brutal.mp3' }],
      'mb-rel-policy'
    );

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    const policy = resolveSpy.mock.calls[0][0].policy;
    expect(policy).toBeDefined();
    expect(policy.level).toBe('operation');
    expect(policy.merge.providerPriorities.musicbrainz).toBe(900);
    expect(policy.merge.providerPriorities.coverartarchive).toBe(850);
    expect(policy.merge.fieldPolicies.genre.preferredProviderId).toBe('musicbrainz');
    expect(policy.merge.fieldPolicies.artworkUrl.preferredProviderId).toBe('coverartarchive');

    expect(preview.album.genre).toBe('Pop, Alternative Rock');
    expect(preview.album.artwork?.primaryPath).toBe(
      'https://coverartarchive.org/release/mb-rel-policy/front.jpg'
    );
  });

  it('omits the merge policy without a preferences service but still propagates merged fields', async () => {
    const resolvedAlbum: { title: string; artist: string; genre?: string } = {
      title: 'SOUR',
      artist: 'Olivia Rodrigo'
    };

    const mockMetadataService = {
      search: vi.fn().mockResolvedValue([]),
      searchAlbums: vi.fn().mockResolvedValue([]),
      resolveRelease: vi.fn().mockResolvedValue({
        album: resolvedAlbum,
        tracks: [],
        provider: 'musicbrainz',
        providerReleaseId: 'mb-rel-nopolicy'
      }),
      buildAlbumMatch: vi.fn().mockImplementation(async (_songs: unknown[], album: unknown) => ({
        album,
        trackList: [],
        warnings: [],
        confidence: 1,
        changesCount: 0
      })),
      applyAlbum: vi.fn()
    };

    const resolveSpy = vi.fn().mockResolvedValue({
      operationId: 'op-nopolicy',
      resourceId: 1,
      candidates: [],
      mergedResult: {
        title: 'SOUR',
        artist: 'Olivia Rodrigo',
        genre: 'Federated Genre',
        fieldAttributions: {},
        fieldAlternatives: {}
      },
      resolvedAt: Date.now()
    });

    const autoTagService = new AlbumAutoTagService({
      albumMetadataService: mockMetadataService as any,
      resolutionManager: { resolve: resolveSpy } as any
    });

    const preview = await autoTagService.buildPreview(
      [{ songId: 1, title: 'brutal', path: 'C:\\music\\01-brutal.mp3' }],
      'mb-rel-nopolicy'
    );

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy.mock.calls[0][0].policy).toBeUndefined();
    expect(preview.album.genre).toBe('Federated Genre');
  });
});
