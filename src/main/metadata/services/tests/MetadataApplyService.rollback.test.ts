import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrackMatchPreview } from '../../../../common/metadata/types';
import { db } from '../../../db/db';
import { getSongById } from '../../../db/queries/songs';
import manageAlbumArtistOfParsedSongModule from '../../../parseSong/manageAlbumArtistOfParsedSong';
import manageAlbumsOfParsedSongModule from '../../../parseSong/manageAlbumsOfParsedSong';
import manageArtistsOfParsedSong from '../../../parseSong/manageArtistsOfParsedSong';
import manageGenresOfParsedSongModule from '../../../parseSong/manageGenresOfParsedSong';
import { MetadataHistoryService } from '../../history/MetadataHistoryService';
import { MetadataApplyService } from '../MetadataApplyService';
import { TagWriterService, type TagWritePayload, type TagWriteResult } from '../TagWriterService';

/**
 * Earlier tests embed trx-identity assertions inside shared mock implementations, which leak across
 * tests (only .calls are cleared). New tests reset them so stale expectations cannot fail unrelated
 * paths.
 */
const resetSharedDbMocks = () => {
  vi.mocked(getSongById).mockReset();
  (db.transaction as any).mockReset();
  vi.mocked(manageArtistsOfParsedSong)
    .mockReset()
    .mockResolvedValue({ newArtists: [], relevantArtists: [] });
  vi.mocked(manageAlbumArtistOfParsedSongModule)
    .mockReset()
    .mockResolvedValue({ newAlbumArtists: [], relevantAlbumArtists: [] });
  vi.mocked(manageAlbumsOfParsedSongModule).mockReset().mockResolvedValue({
    relevantAlbum: undefined,
    newAlbum: undefined,
    relevantAlbumArtists: []
  });
  vi.mocked(manageGenresOfParsedSongModule)
    .mockReset()
    .mockResolvedValue({ newGenres: [], relevantGenres: [] });
};

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

const { manageAlbumArtistOfParsedSong, manageAlbumsOfParsedSong } = vi.hoisted(() => ({
  // Default: album resolved but no id - keeps legacy tests on the no-link path
  manageAlbumsOfParsedSong: vi
    .fn()
    .mockResolvedValue({ relevantAlbum: undefined, newAlbum: undefined }),
  manageAlbumArtistOfParsedSong: vi
    .fn()
    .mockResolvedValue({ newAlbumArtists: [], relevantAlbumArtists: [] })
}));

vi.mock('../../../parseSong/manageAlbumArtistOfParsedSong', () => ({
  default: manageAlbumArtistOfParsedSong
}));

vi.mock('../../../parseSong/manageAlbumsOfParsedSong', () => ({
  default: manageAlbumsOfParsedSong
}));

vi.mock('../../../parseSong/manageGenresOfParsedSong', () => ({
  default: vi.fn()
}));

// Makes the dynamic import inside undoLastAutoTag fail -> exercises the inline
// drizzle fallback that owns junction restoration without reParseSong.
vi.mock('../../../parseSong/reParseSong', () => {
  throw new Error('reParseSong unavailable in unit tests');
});

describe('MetadataApplyService — Production Drizzle Transaction & Rollback Invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls back ALL successfully written physical files when an intermediate file write fails', async () => {
    const mockWriteBatch = vi.fn();

    // First call: writing new tags for 4 files (index 1 fails, indices 0, 2, 3 succeed)
    mockWriteBatch.mockImplementationOnce(
      async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return [
          { filePath: payloads[0].filePath, success: true },
          { filePath: payloads[1].filePath, success: false, error: 'EACCES: permission denied' },
          { filePath: payloads[2].filePath, success: true },
          { filePath: payloads[3].filePath, success: true }
        ];
      }
    );

    // Second call: rollback batch for the 3 files that succeeded
    mockWriteBatch.mockImplementationOnce(
      async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      }
    );

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
        confidence: 0.9,
        confidenceLevel: 'Good',
        why: 'Exact match',
        reasons: [],
        hasWarnings: false,
        warningCount: 0,
        applyTrack: true,
        oldTitle: 'Old Title 1',
        remoteTitle: 'New Title 1',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Old Title 1',
            suggestedValue: 'New Title 1',
            status: 'changed',
            applyField: true
          }
        ]
      },
      {
        localSongId: 2,
        songPath: '/music/track2.mp3',
        confidence: 0.9,
        confidenceLevel: 'Good',
        why: 'Exact match',
        reasons: [],
        hasWarnings: false,
        warningCount: 0,
        applyTrack: true,
        oldTitle: 'Old Title 2',
        remoteTitle: 'New Title 2',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Old Title 2',
            suggestedValue: 'New Title 2',
            status: 'changed',
            applyField: true
          }
        ]
      },
      {
        localSongId: 3,
        songPath: '/music/track3.mp3',
        confidence: 0.9,
        confidenceLevel: 'Good',
        why: 'Exact match',
        reasons: [],
        hasWarnings: false,
        warningCount: 0,
        applyTrack: true,
        oldTitle: 'Old Title 3',
        remoteTitle: 'New Title 3',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Old Title 3',
            suggestedValue: 'New Title 3',
            status: 'changed',
            applyField: true
          }
        ]
      },
      {
        localSongId: 4,
        songPath: '/music/track4.mp3',
        confidence: 0.9,
        confidenceLevel: 'Good',
        why: 'Exact match',
        reasons: [],
        hasWarnings: false,
        warningCount: 0,
        applyTrack: true,
        oldTitle: 'Old Title 4',
        remoteTitle: 'New Title 4',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Old Title 4',
            suggestedValue: 'New Title 4',
            status: 'changed',
            applyField: true
          }
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
    mockWriteBatch.mockImplementationOnce(
      async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      }
    );

    // Second call: rollback batch for all physical writes
    mockWriteBatch.mockImplementationOnce(
      async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      }
    );

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
        confidence: 0.9,
        confidenceLevel: 'Good',
        why: 'Exact match',
        reasons: [],
        hasWarnings: false,
        warningCount: 0,
        applyTrack: true,
        oldTitle: 'Old Title 1',
        remoteTitle: 'New Title 1',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Old Title 1',
            suggestedValue: 'New Title 1',
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'artist',
            fieldName: 'Artist',
            oldValue: 'Old Artist 1',
            suggestedValue: 'New Artist 1',
            status: 'changed',
            applyField: true
          }
        ]
      },
      {
        localSongId: 2,
        songPath: '/music/track2.mp3',
        confidence: 0.9,
        confidenceLevel: 'Good',
        why: 'Exact match',
        reasons: [],
        hasWarnings: false,
        warningCount: 0,
        applyTrack: true,
        oldTitle: 'Old Title 2',
        remoteTitle: 'New Title 2',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Old Title 2',
            suggestedValue: 'New Title 2',
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'artist',
            fieldName: 'Artist',
            oldValue: 'Old Artist 2',
            suggestedValue: 'New Artist 2',
            status: 'changed',
            applyField: true
          }
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

  it('normalizes previously-absent fields to explicit null clears in rollback payloads', async () => {
    const mockWriteBatch = vi.fn();

    // First call: track 1 fails, track 2 succeeds -> rollback only track 2
    mockWriteBatch.mockImplementationOnce(
      async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return [
          { filePath: payloads[0].filePath, success: false, error: 'EPERM' },
          { filePath: payloads[1].filePath, success: true }
        ];
      }
    );
    mockWriteBatch.mockImplementationOnce(
      async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      }
    );

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      batchChunkSize: 10
    });

    const matches: any[] = [
      {
        localSongId: 1,
        songPath: '/music/had-genre.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Had Everything',
        oldGenre: 'Rock',
        fieldDiffs: []
      },
      {
        localSongId: 2,
        songPath: '/music/was-empty.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Was Empty',
        suggestedTitle: 'Now Tagged',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Was Empty',
            suggestedValue: 'Now Tagged',
            applyField: true
          }
        ]
      }
    ];

    const preview: any = {
      album: { title: 'X' },
      matches,
      globalMutations: {},
      unmatchedFiles: []
    };
    await service.applyPreview(preview);

    expect(mockWriteBatch).toHaveBeenCalledTimes(2);
    const rollbackPayloads: TagWritePayload[] = mockWriteBatch.mock.calls[1][0];
    expect(rollbackPayloads).toHaveLength(1);
    const rollback = rollbackPayloads[0];

    // Previously-present value restores the original
    expect(rollback.title).toBe('Was Empty');
    // Previously-ABSENT values must be explicit clears, not undefined skips
    expect(rollback.artist).toBeNull();
    expect(rollback.album).toBeNull();
    expect(rollback.genre).toBeNull();
    expect(rollback.year).toBeNull();
    expect(rollback.trackNumber).toBeNull();
    expect(rollback.discNumber).toBeNull();
    expect(rollback.isrc).toBeNull();
    expect(rollback.musicBrainzRecordingId).toBeNull();
  });

  it('builds value-complete undo restore payloads including isrc and mbid clears', async () => {
    const mockWriteBatch = vi.fn().mockResolvedValue([{ filePath: '/m/a.mp3', success: true }]);
    const dbUpdater = vi.fn().mockResolvedValue(undefined);

    const historyService = new MetadataHistoryService();

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      historyService,
      dbUpdater
    });

    historyService.pushSnapshot({
      id: 'snap-1',
      timestamp: Date.now(),
      description: 'AutoTag apply',
      previousSongs: [
        {
          songId: 1,
          path: '/m/a.mp3',
          title: 'Original Title',
          isrc: 'USUM71700001',
          musicBrainzRecordingId: 'mbid-abc'
        }
      ],
      updatedSongs: []
    });

    const result = await service.undoLastAutoTag();
    expect(result.success).toBe(true);
    expect(result.restoredCount).toBe(1);

    const restorePayloads: TagWritePayload[] = mockWriteBatch.mock.calls[0][0];
    expect(restorePayloads).toHaveLength(1);
    expect(restorePayloads[0]).toMatchObject({
      filePath: '/m/a.mp3',
      title: 'Original Title',
      artist: null,
      album: null,
      genre: null,
      year: null,
      isrc: 'USUM71700001',
      musicBrainzRecordingId: 'mbid-abc'
    });
  });

  it('keeps the undo snapshot retryable when the physical restore fails', async () => {
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const historyService = new MetadataHistoryService();

    const mockWriteBatch = vi
      .fn()
      .mockResolvedValueOnce([{ filePath: '/m/a.mp3', success: false, error: 'EACCES: locked' }])
      .mockResolvedValue([{ filePath: '/m/a.mp3', success: true }]);

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      historyService,
      dbUpdater
    });

    historyService.pushSnapshot({
      id: 'snap-retry',
      timestamp: Date.now(),
      description: 'AutoTag apply',
      previousSongs: [{ songId: 1, path: '/m/a.mp3', title: 'Original Title' }],
      updatedSongs: []
    });

    // First attempt fails on disk...
    const firstAttempt = await service.undoLastAutoTag();
    expect(firstAttempt.success).toBe(false);

    // ...snapshot must NOT have been consumed by the failed attempt
    expect(historyService.canUndo).toBe(true);

    // Second attempt succeeds and now consumes the snapshot
    const secondAttempt = await service.undoLastAutoTag();
    expect(secondAttempt.success).toBe(true);
    expect(secondAttempt.restoredCount).toBe(1);
    expect(mockWriteBatch).toHaveBeenCalledTimes(2);
    expect(historyService.canUndo).toBe(false);

    // Nothing left to undo afterwards
    const third = await service.undoLastAutoTag();
    expect(third.success).toBe(false);
    expect(third.errors?.[0]).toContain('No AutoTag history available');
  });

  it('writes isrc and musicBrainzRecordingId to BOTH file payloads and DB scalar columns', async () => {
    const mockWriteBatch = vi
      .fn()
      .mockImplementation(async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      });

    const setCalls: Array<Record<string, unknown>> = [];
    const mockTrx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          setCalls.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        })
      })
    };
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => callback(mockTrx));
    vi.mocked(getSongById).mockResolvedValue({ id: 1, title: 'Old' } as any);

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      batchChunkSize: 10
    });

    const matches: any[] = [
      {
        localSongId: 1,
        songPath: '/music/identity.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'Old',
        suggestedTitle: 'New',
        fieldDiffs: [
          {
            fieldId: 'isrc',
            fieldName: 'ISRC',
            oldValue: undefined,
            suggestedValue: 'USUM71700001',
            applyField: true
          },
          {
            fieldId: 'musicBrainzRecordingId',
            fieldName: 'MBID',
            oldValue: undefined,
            suggestedValue: 'mbid-new',
            applyField: true
          }
        ]
      }
    ];
    await service.applyPreview({
      album: { title: 'X' },
      matches,
      globalMutations: {},
      unmatchedFiles: []
    } as any);

    // File side: TagLib frames receive the recording identities
    expect(mockWriteBatch.mock.calls[0][0][0]).toMatchObject({
      isrc: 'USUM71700001',
      musicBrainzRecordingId: 'mbid-new'
    });

    // DB side: songs columns move in the SAME operation
    expect(setCalls[0]).toMatchObject({
      isrc: 'USUM71700001',
      musicBrainzRecordingId: 'mbid-new'
    });
  });

  it('never touches identity fields when diffs are absent or effectively empty', async () => {
    const mockWriteBatch = vi
      .fn()
      .mockImplementation(async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      });

    const setCalls: Array<Record<string, unknown>> = [];
    const mockTrx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          setCalls.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        })
      })
    };
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => callback(mockTrx));
    vi.mocked(getSongById).mockResolvedValue({ id: 1, title: 'Old' } as any);

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      batchChunkSize: 10
    });

    const matches: any[] = [
      {
        // No isrc/mbid diffs at all -> fields must be absent from payload AND .set()
        localSongId: 1,
        songPath: '/music/a.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'A',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'A',
            suggestedValue: 'B',
            applyField: true
          }
        ]
      },
      {
        // Whitespace-only diff value -> guarded as intentionally-empty, not written
        localSongId: 2,
        songPath: '/music/b.mp3',
        matchConfidence: 0.9,
        applyTrack: true,
        oldTitle: 'B',
        fieldDiffs: [
          {
            fieldId: 'isrc',
            fieldName: 'ISRC',
            oldValue: 'OLD',
            suggestedValue: '   ',
            applyField: true
          }
        ]
      }
    ];
    await service.applyPreview({
      album: { title: 'X' },
      matches,
      globalMutations: {},
      unmatchedFiles: []
    } as any);

    const payloads = mockWriteBatch.mock.calls[0][0] as TagWritePayload[];
    expect(payloads[0].isrc).toBeUndefined();
    expect(payloads[0].musicBrainzRecordingId).toBeUndefined();
    expect(payloads[1].isrc).toBeUndefined();
    expect(setCalls[0].isrc).toBeUndefined();
    expect(setCalls[0].musicBrainzRecordingId).toBeUndefined();
    expect(setCalls[1].isrc).toBeUndefined();
  });

  it('links albums_artists from the release-level albumArtist, never the track artist', async () => {
    const mockWriteBatch = vi
      .fn()
      .mockImplementation(async (payloads: TagWritePayload[]): Promise<TagWriteResult[]> => {
        return payloads.map((p) => ({ filePath: p.filePath, success: true }));
      });
    const setCalls: Array<Record<string, unknown>> = [];
    const mockTrx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          setCalls.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        })
      })
    };

    // Album resolution returns a concrete album so the junction linker runs
    resetSharedDbMocks();
    manageAlbumsOfParsedSong.mockResolvedValue({ relevantAlbum: { id: 55 }, newAlbum: undefined });
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => callback(mockTrx));
    vi.mocked(getSongById).mockResolvedValue({ id: 1, title: 'Old' } as any);

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      batchChunkSize: 10
    });

    const matches: any[] = [
      {
        localSongId: 1,
        songPath: '/music/comp.mp3',
        matchConfidence: 0.95,
        applyTrack: true,
        oldTitle: 'Track',
        oldArtist: 'Track Guy', // per-track artist - must NOT reach albums_artists
        oldAlbumArtist: 'Various Artists',
        oldAlbum: 'Compilation',
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            oldValue: 'Track',
            suggestedValue: 'Track (Remastered)',
            applyField: true
          }
        ]
      }
    ];
    const previewResult: any = await service.applyPreview(
      {
        album: { title: 'Compilation' },
        matches,
        unmatchedFiles: []
      } as any,
      { globalMutations: { applyAlbumArtist: true, albumArtist: 'Various Artists' } }
    );
    expect(previewResult.errors ?? []).toEqual([]);

    // Relational input carries the RELEASE artist, not the track artist
    expect(manageAlbumsOfParsedSong).toHaveBeenCalledWith(
      expect.objectContaining({ albumArtists: ['Various Artists'], artists: ['Track Guy'] }),
      expect.anything()
    );
    // Junction link executed against the resolved album
    expect(manageAlbumArtistOfParsedSong).toHaveBeenCalledWith(
      { albumArtists: ['Various Artists'], albumId: 55 },
      expect.anything()
    );
  });

  it('undo restores the junction from snapshot albumArtist and never invents track artists', async () => {
    const historyService = new MetadataHistoryService();

    const mockWriteBatch = vi.fn().mockResolvedValue([{ filePath: '/m/a.mp3', success: true }]);
    manageAlbumsOfParsedSong.mockResolvedValue({ relevantAlbum: { id: 77 }, newAlbum: undefined });
    resetSharedDbMocks();
    manageAlbumsOfParsedSong.mockResolvedValue({ relevantAlbum: { id: 77 }, newAlbum: undefined });

    const setCalls: Array<Record<string, unknown>> = [];
    const mockTrx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          setCalls.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        })
      })
    };
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => callback(mockTrx));
    vi.mocked(getSongById).mockResolvedValue({ id: 1, title: 'Old' } as any);

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      historyService,
      dbUpdater: undefined // force the inline drizzle fallback that owns the junction
    });

    historyService.pushSnapshot({
      id: 'snap-junction',
      timestamp: Date.now(),
      description: 'AutoTag apply',
      previousSongs: [
        {
          songId: 1,
          path: '/m/a.mp3',
          title: 'Original Title',
          artist: 'Old Track Artist',
          albumArtist: 'Original VA',
          album: 'Original Compilation'
        }
      ],
      updatedSongs: []
    });

    const result = await service.undoLastAutoTag();
    expect(result.success).toBe(true);

    // No track-artist conflation in the relational input...
    expect(manageAlbumsOfParsedSong).toHaveBeenCalledWith(
      expect.objectContaining({ albumArtists: [], artists: ['Old Track Artist'] }),
      expect.anything()
    );
    // ...junction explicitly restored from the snapshot's release-level artist
    expect(manageAlbumArtistOfParsedSong).toHaveBeenCalledWith(
      { albumArtists: ['Original VA'], albumId: 77 },
      expect.anything()
    );
  });

  it('legacy snapshots without albumArtist leave the junction untouched during undo', async () => {
    const historyService = new MetadataHistoryService();

    const mockWriteBatch = vi.fn().mockResolvedValue([{ filePath: '/m/a.mp3', success: true }]);

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      historyService
    });

    // Inline fallback path requires a functioning transaction
    resetSharedDbMocks();
    const mockTrx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
      })
    };
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => callback(mockTrx));
    vi.mocked(getSongById).mockResolvedValue({ id: 1, title: 'Old' } as any);

    historyService.pushSnapshot({
      id: 'snap-legacy',
      timestamp: Date.now(),
      description: 'AutoTag apply (pre-albumArtist capture)',
      previousSongs: [
        {
          songId: 1,
          path: '/m/a.mp3',
          title: 'Original Title',
          artist: 'Some Artist',
          album: 'Album'
        }
      ],
      updatedSongs: []
    });

    const result = await service.undoLastAutoTag();
    expect(result.success).toBe(true);

    // Unknown pre-state -> no invented link, junction simply untouched
    expect(manageAlbumArtistOfParsedSong).not.toHaveBeenCalled();
  });

  it('partial physical failure: DB restored ONLY for succeeded tracks, snapshot retained for retry', async () => {
    const dbUpdater = vi.fn().mockResolvedValue(undefined);
    const historyService = new MetadataHistoryService();

    const mockWriteBatch = vi.fn().mockResolvedValue([
      { filePath: '/m/a.mp3', success: true },
      { filePath: '/m/b.mp3', success: false, error: 'EACCES: locked by player' }
    ]);

    const service = new MetadataApplyService({
      tagWriter: { writeBatch: mockWriteBatch } as unknown as TagWriterService,
      historyService,
      dbUpdater
    });

    historyService.pushSnapshot({
      id: 'snap-partial',
      timestamp: Date.now(),
      description: 'AutoTag apply',
      previousSongs: [
        { songId: 1, path: '/m/a.mp3', title: 'A-old' },
        { songId: 2, path: '/m/b.mp3', title: 'B-old' }
      ],
      updatedSongs: []
    });

    const res = await service.undoLastAutoTag();

    expect(res.success).toBe(false);
    expect(res.restoredCount).toBe(1);
    expect((res.errors ?? []).join(' ')).toContain('EACCES');

    // DB restore ran for the SUCCEEDED track only - no desync
    expect(dbUpdater).toHaveBeenCalledTimes(1);
    expect(dbUpdater.mock.calls[0][0]).toBe(1);

    // Snapshot retained so retry can attempt the failed track
    expect(historyService.canUndo).toBe(true);
  });
});
