import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetadataApplyService } from '../MetadataApplyService';
import { TagWriterService, type TagWritePayload, type TagWriteResult } from '../TagWriterService';
import type { TrackMatchPreview } from '../../../../common/metadata/types';
import { db } from '../../../db/db';
import { getSongById } from '../../../db/queries/songs';
import manageArtistsOfParsedSong from '../../../parseSong/manageArtistsOfParsedSong';

vi.mock('../../../db/db', () => ({
  db: {
    transaction: vi.fn()
  }
}));

vi.mock('../../../db/queries/songs', () => ({
  getSongById: vi.fn()
}));

vi.mock('../../../utils/convert', () => ({
  convertToSongData: vi.fn((x) => x)
}));

vi.mock('../../../removeSongsFromLibrary', () => ({
  removeDeletedArtistDataOfSong: vi.fn(),
  removeDeletedAlbumDataOfSong: vi.fn(),
  removeDeletedGenreDataOfSong: vi.fn()
}));

vi.mock('../../../parseSong/manageArtistsOfParsedSong', () => ({
  default: vi.fn()
}));

vi.mock('../../../parseSong/manageAlbumsOfParsedSong', () => ({
  default: vi.fn()
}));

vi.mock('../../../parseSong/manageGenresOfParsedSong', () => ({
  default: vi.fn()
}));

describe('MetadataApplyService — Production Drizzle Transaction & Rollback Invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls back ALL successfully written physical files when an intermediate file write fails', async () => {
    const mockWriteBatch = vi.fn();

    // First call: writing new tags for 4 files (index 1 fails, indices 0, 2, 3 succeed)
    mockWriteBatch.mockImplementationOnce(async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
      return [
        { filePath: payloads[0].filePath, success: true },
        { filePath: payloads[1].filePath, success: false, error: 'EACCES: permission denied' },
        { filePath: payloads[2].filePath, success: true },
        { filePath: payloads[3].filePath, success: true }
      ];
    });

    // Second call: rollback batch for the 3 files that succeeded
    mockWriteBatch.mockImplementationOnce(async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
      return payloads.map((p) => ({ filePath: p.filePath, success: true }));
    });

    const mockTagWriter = {
      writeBatch: mockWriteBatch
    } as unknown as TagWriterService;

    // Production configuration without dbUpdater override
    const service = new MetadataApplyService({
      tagWriter: mockTagWriter,
      batchChunkSize: 10
    });

    const matches: TrackMatchPreview[] = [
      {
        localSongId: 1,
        songPath: '/music/track1.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Old Title 1',
        suggestedTitle: 'New Title 1',
        fieldDiffs: [{ fieldId: 'title', fieldName: 'Title', oldValue: 'Old Title 1', suggestedValue: 'New Title 1', applyField: true }]
      },
      {
        localSongId: 2,
        songPath: '/music/track2.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Old Title 2',
        suggestedTitle: 'New Title 2',
        fieldDiffs: [{ fieldId: 'title', fieldName: 'Title', oldValue: 'Old Title 2', suggestedValue: 'New Title 2', applyField: true }]
      },
      {
        localSongId: 3,
        songPath: '/music/track3.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Old Title 3',
        suggestedTitle: 'New Title 3',
        fieldDiffs: [{ fieldId: 'title', fieldName: 'Title', oldValue: 'Old Title 3', suggestedValue: 'New Title 3', applyField: true }]
      },
      {
        localSongId: 4,
        songPath: '/music/track4.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Old Title 4',
        suggestedTitle: 'New Title 4',
        fieldDiffs: [{ fieldId: 'title', fieldName: 'Title', oldValue: 'Old Title 4', suggestedValue: 'New Title 4', applyField: true }]
      }
    ];

    const preview: any = {
      album: { title: 'Test Album' },
      matches,
      globalMutations: {},
      unmatchedFiles: []
    };

    const result = await service.applyPreview(preview);

    expect(result.success).toBe(false);
    expect(result.updatedCount).toBe(0);
    expect(result.failedCount).toBe(4);

    // Verify writeBatch was called twice: once for the write, once for the rollback
    expect(mockWriteBatch).toHaveBeenCalledTimes(2);

    // Verify rollback was invoked with payloads for tracks 1, 3, and 4 (indices 0, 2, 3), NOT just index 0
    const rollbackPayloads: TagWritePayload[] = mockWriteBatch.mock.calls[1][0];
    expect(rollbackPayloads).toHaveLength(3);
    expect(rollbackPayloads.map((p) => p.filePath)).toEqual([
      '/music/track1.mp3',
      '/music/track3.mp3',
      '/music/track4.mp3'
    ]);
    expect(rollbackPayloads.map((p) => p.title)).toEqual([
      'Old Title 1',
      'Old Title 3',
      'Old Title 4'
    ]);

    // Ensure production DB transaction was NEVER initiated because physical writes failed
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('executes production Drizzle db.transaction and rolls back physical file writes if DB update throws mid-transaction', async () => {
    const mockWriteBatch = vi.fn();

    // First call: all physical writes succeed for 2 tracks
    mockWriteBatch.mockImplementationOnce(async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
      return payloads.map((p) => ({ filePath: p.filePath, success: true }));
    });

    // Second call: rollback batch for all physical writes
    mockWriteBatch.mockImplementationOnce(async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
      return payloads.map((p) => ({ filePath: p.filePath, success: true }));
    });

    const mockTagWriter = {
      writeBatch: mockWriteBatch
    } as unknown as TagWriterService;

    // Production mock transaction handle
    const mockTrx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined)
        })
      })
    };

    // Track calls made inside the transaction
    const dbOperationsInTrx: string[] = [];

    // Simulate Drizzle transaction callback: track 1 succeeds, track 2 throws mid-transaction
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback(mockTrx);
    });

    vi.mocked(getSongById).mockImplementation(async (id, trx) => {
      expect(trx).toBe(mockTrx); // Invariant: trx handle propagated
      dbOperationsInTrx.push(`getSongById:${id}`);
      return { id, title: `Old Song ${id}` } as any;
    });

    vi.mocked(manageArtistsOfParsedSong).mockImplementation(async (args, trx) => {
      expect(trx).toBe(mockTrx); // Invariant: trx handle propagated
      if (args.songId === 2) {
        // Track 2 throws a database integrity / serialization error
        throw new Error('PGlite transaction aborted: foreign key constraint failure');
      }
      dbOperationsInTrx.push(`manageArtistsOfParsedSong:${args.songId}`);
      return { newArtists: [], relevantArtists: [] };
    });

    // Production service instance (uses real db.transaction code path)
    const service = new MetadataApplyService({
      tagWriter: mockTagWriter,
      batchChunkSize: 10
    });

    const matches: TrackMatchPreview[] = [
      {
        localSongId: 1,
        songPath: '/music/track1.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Old Title 1',
        suggestedTitle: 'New Title 1',
        fieldDiffs: [
          { fieldId: 'title', fieldName: 'Title', oldValue: 'Old Title 1', suggestedValue: 'New Title 1', applyField: true },
          { fieldId: 'artist', fieldName: 'Artist', oldValue: 'Old Artist 1', suggestedValue: 'New Artist 1', applyField: true }
        ]
      },
      {
        localSongId: 2,
        songPath: '/music/track2.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Old Title 2',
        suggestedTitle: 'New Title 2',
        fieldDiffs: [
          { fieldId: 'title', fieldName: 'Title', oldValue: 'Old Title 2', suggestedValue: 'New Title 2', applyField: true },
          { fieldId: 'artist', fieldName: 'Artist', oldValue: 'Old Artist 2', suggestedValue: 'New Artist 2', applyField: true }
        ]
      }
    ];

    const preview: any = {
      album: { title: 'Test Album' },
      matches,
      globalMutations: {},
      unmatchedFiles: []
    };

    const result = await service.applyPreview(preview);

    // Invariant: If DB transaction throws, apply fails and 0 tracks are considered updated
    expect(result.success).toBe(false);
    expect(result.updatedCount).toBe(0);
    expect(result.failedCount).toBe(2);

    // Verify db.transaction was executed exactly once covering the chunk
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // Verify operations executed in the transaction before the error
    expect(dbOperationsInTrx).toContain('getSongById:1');
    expect(dbOperationsInTrx).toContain('manageArtistsOfParsedSong:1');
    expect(dbOperationsInTrx).toContain('getSongById:2');

    // Verify physical rollback was executed for ALL files written to disk
    expect(mockWriteBatch).toHaveBeenCalledTimes(2);
    const rollbackPayloads: TagWritePayload[] = mockWriteBatch.mock.calls[1][0];
    expect(rollbackPayloads).toHaveLength(2);
    expect(rollbackPayloads.map((p) => p.title)).toEqual(['Old Title 1', 'Old Title 2']);
  });
});
