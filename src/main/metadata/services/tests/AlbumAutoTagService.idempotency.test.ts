import { describe, expect, it, vi } from 'vitest';
import type { AlbumMetadata, ResolvedAlbumRelease } from '../../models/RecordingMetadata';
import { AlbumMetadataService } from '../AlbumMetadataService';
import { AlbumAutoTagService } from '../AlbumAutoTagService';
import type { LocalSongInput } from '../AlbumMetadataService';
import { TrackMatcher } from '../../matching/TrackMatcher';

describe('AlbumAutoTagService: Authoritative Baseline & Idempotency Suite', () => {
  // Test mock candidate release
  const mockRelease: ResolvedAlbumRelease = {
    releaseId: 'rel-sour-2021',
    provider: 'musicbrainz',
    providerReleaseId: 'mb-sour-2021',
    album: {
      releaseId: 'rel-sour-2021',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      year: 2021,
      genre: 'Pop, Alternative Rock',
      trackCount: 1,
      provider: 'musicbrainz'
    },
    tracks: [
      {
        trackId: 'tr-1',
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        album: 'SOUR',
        year: 2021,
        trackNumber: 1,
        discNumber: 1,
        duration: 177.5,
        isrc: 'USUG12101487',
        musicBrainzRecordingId: 'mb-rec-brutal',
        genres: ['Pop, Alternative Rock']
      }
    ]
  };

  const setupService = (initialDbSongs: Record<number, LocalSongInput>) => {
    // In-memory mock database store
    const dbStore = new Map<number, LocalSongInput>(
      Object.entries(initialDbSongs).map(([k, v]) => [Number(k), { ...v }])
    );

    const mockMetadataService = {
      search: vi.fn().mockResolvedValue([mockRelease.album]),
      resolveRelease: vi.fn().mockResolvedValue(mockRelease),
      buildAlbumMatch: async (localSongs: LocalSongInput[], album: AlbumMetadata, officialTracks: any[]) => {
        const matcher = new TrackMatcher();
        const trackList = matcher.matchTracks(localSongs, album.releaseId ?? '', officialTracks, {
          albumTitle: album.title,
          year: album.year
        });
        return {
          album,
          trackList,
          warnings: [],
          confidence: 0.98,
          changesCount: trackList.length
        };
      }
    } as unknown as AlbumMetadataService;

    // Database updater simulating SQLite atomic commit
    const mockDbUpdater = async (songId: number, data: Partial<LocalSongInput>) => {
      const existing = dbStore.get(songId);
      if (existing) {
        dbStore.set(songId, {
          ...existing,
          ...data
        });
      }
    };

    // Main process authoritative song hydrator
    const songHydrator = async (songId: number): Promise<LocalSongInput | null> => {
      const found = dbStore.get(songId);
      return found ? { ...found } : null;
    };

    const applyService = {
      updater: mockDbUpdater,
      history: { logTransaction: vi.fn() },
      applyPreview: async (preview: any) => {
        for (const match of preview.matches) {
          if (!match.applyTrack) continue;
          const updates: Partial<LocalSongInput> = {};
          for (const diff of match.fieldDiffs) {
            if (diff.applyField) {
              const val = diff.userValue !== undefined ? diff.userValue : diff.suggestedValue;
              (updates as any)[diff.fieldId] = val;
            }
          }
          await mockDbUpdater(match.localSongId, updates);
        }
        return { success: true, updatedCount: preview.matches.length, failedCount: 0, errors: [] };
      }
    };

    const autoTagService = new AlbumAutoTagService({
      albumMetadataService: mockMetadataService,
      applyService: applyService as any,
      songHydrator
    });

    return { autoTagService, dbStore, mockMetadataService };
  };

  it('Path A (Same Dialog): proves idempotency after applying preview and re-evaluating', async () => {
    // Initial state: Song in DB has empty genre, old year 2020
    const initialDbSongs: Record<number, LocalSongInput> = {
      101: {
        songId: 101,
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        album: 'SOUR',
        year: 2020,
        trackNumber: 1,
        discNumber: 1,
        genre: undefined, // Empty genre
        path: '/music/01-brutal.mp3',
        duration: 177.5
      }
    };

    const { autoTagService, dbStore } = setupService(initialDbSongs);

    // 1. Run 1: Build preview against release
    const preview1 = await autoTagService.buildPreview(
      [{ songId: 101, path: '/music/01-brutal.mp3', title: 'brutal' }],
      'rel-sour-2021'
    );

    expect(preview1.matches.length).toBe(1);
    const match1 = preview1.matches[0];

    const genreDiff1 = match1.fieldDiffs.find((d) => d.fieldId === 'genre');
    const yearDiff1 = match1.fieldDiffs.find((d) => d.fieldId === 'year');
    const trackNoDiff1 = match1.fieldDiffs.find((d) => d.fieldId === 'trackNumber');

    expect(genreDiff1?.status).toBe('new');
    expect(genreDiff1?.suggestedValue).toBe('Pop, Alternative Rock');
    expect(yearDiff1?.status).toBe('changed');
    expect(yearDiff1?.oldValue).toBe(2020);
    expect(yearDiff1?.suggestedValue).toBe(2021);
    expect(trackNoDiff1?.status).toBe('unchanged'); // Track number was already 1

    // 2. Apply preview 1
    const applyResult = await autoTagService.applyPreview(preview1);
    expect(applyResult.success).toBe(true);

    // Verify DB store was updated
    const updatedDbSong = dbStore.get(101);
    expect(updatedDbSong?.genre).toBe('Pop, Alternative Rock');
    expect(updatedDbSong?.year).toBe(2021);

    // 3. Run 2: Re-run buildPreview in the exact same session
    const preview2 = await autoTagService.buildPreview(
      [{ songId: 101, path: '/music/01-brutal.mp3', title: 'brutal' }],
      'rel-sour-2021'
    );

    const match2 = preview2.matches[0];
    const genreDiff2 = match2.fieldDiffs.find((d) => d.fieldId === 'genre');
    const yearDiff2 = match2.fieldDiffs.find((d) => d.fieldId === 'year');

    // IDEMPOTENCY CHECK: Both genre and year are now 'unchanged', producing 0 changed fields!
    expect(genreDiff2?.status).toBe('unchanged');
    expect(genreDiff2?.oldValue).toBe('Pop, Alternative Rock');
    expect(genreDiff2?.suggestedValue).toBe('Pop, Alternative Rock');

    expect(yearDiff2?.status).toBe('unchanged');
    expect(yearDiff2?.oldValue).toBe(2021);
    expect(yearDiff2?.suggestedValue).toBe(2021);

    const totalChanges = match2.fieldDiffs.filter((d) => d.status === 'changed' || d.status === 'new').length;
    expect(totalChanges).toBe(0);
  });

  it('Path B (Dialog Reopened): proves baseline consistency when dialog is closed and reopened', async () => {
    // Song already has canonical metadata from previous apply
    const initialDbSongs: Record<number, LocalSongInput> = {
      101: {
        songId: 101,
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        album: 'SOUR',
        year: 2021,
        trackNumber: 1,
        discNumber: 1,
        genre: 'Pop, Alternative Rock',
        isrc: 'USUG12101487',
        musicBrainzRecordingId: 'mb-rec-brutal',
        path: '/music/01-brutal.mp3',
        duration: 177.5
      }
    };

    const { autoTagService } = setupService(initialDbSongs);

    // Reopened dialog passes newly loaded songs
    const preview = await autoTagService.buildPreview(
      [{ songId: 101, path: '/music/01-brutal.mp3', title: 'brutal' }],
      'rel-sour-2021'
    );

    const match = preview.matches[0];
    const changedFields = match.fieldDiffs.filter((d) => d.status === 'changed' || d.status === 'new');
    expect(changedFields.length).toBe(0);
  });

  it('Path C (Stale/Incomplete Renderer Payload): proves main process DB hydration overrides stale frontend snapshots', async () => {
    // Authoritative DB has full metadata
    const initialDbSongs: Record<number, LocalSongInput> = {
      101: {
        songId: 101,
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        album: 'SOUR',
        year: 2021,
        trackNumber: 1,
        discNumber: 1,
        genre: 'Pop, Alternative Rock',
        isrc: 'USUG12101487',
        musicBrainzRecordingId: 'mb-rec-brutal',
        path: '/music/01-brutal.mp3',
        duration: 177.5
      }
    };

    const { autoTagService } = setupService(initialDbSongs);

    // Deliberately pass stale/incomplete SongData where genre is omitted and trackNo is used
    const staleRendererPayload: any[] = [
      {
        songId: 101,
        title: 'brutal',
        artists: [{ artistId: 1, name: 'Olivia Rodrigo' }],
        album: { albumId: 5, name: 'SOUR' },
        genres: [], // Stale empty genres array from client
        genre: undefined, // Omitted
        trackNo: 1, // Property name mismatch
        discNo: 1,
        path: '/music/01-brutal.mp3'
      }
    ];

    const preview = await autoTagService.buildPreview(staleRendererPayload, 'rel-sour-2021');
    const match = preview.matches[0];

    // Main process re-hydration must have fetched "Pop, Alternative Rock" from DB!
    const genreDiff = match.fieldDiffs.find((d) => d.fieldId === 'genre');
    expect(genreDiff?.oldValue).toBe('Pop, Alternative Rock');
    expect(genreDiff?.status).toBe('unchanged');

    const changedDiffs = match.fieldDiffs.filter((d) => d.status === 'changed' || d.status === 'new');
    expect(changedDiffs.length).toBe(0);
  });

  it('verifies all metadata fields (artist, album, trackNo, discNo, year, isrc, mbid) are idempotent', async () => {
    const initialDbSongs: Record<number, LocalSongInput> = {
      101: {
        songId: 101,
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        album: 'SOUR',
        year: 2021,
        trackNumber: 1,
        discNumber: 1,
        genre: 'Pop, Alternative Rock',
        isrc: 'USUG12101487',
        musicBrainzRecordingId: 'mb-rec-brutal',
        path: '/music/01-brutal.mp3',
        duration: 177.5
      }
    };

    const { autoTagService } = setupService(initialDbSongs);

    const preview = await autoTagService.buildPreview(
      [{ songId: 101, path: '/music/01-brutal.mp3', title: 'brutal' }],
      'rel-sour-2021'
    );

    const match = preview.matches[0];
    for (const diff of match.fieldDiffs) {
      expect(diff.status, `Field ${diff.fieldId} should have status 'unchanged'`).toBe('unchanged');
    }
  });

  it('proves no-op apply when totalChanges === 0', async () => {
    const initialDbSongs: Record<number, LocalSongInput> = {
      101: {
        songId: 101,
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        album: 'SOUR',
        year: 2021,
        trackNumber: 1,
        discNumber: 1,
        genre: 'Pop, Alternative Rock',
        isrc: 'USUG12101487',
        musicBrainzRecordingId: 'mb-rec-brutal',
        path: '/music/01-brutal.mp3',
        duration: 177.5
      }
    };

    const { autoTagService } = setupService(initialDbSongs);

    const preview = await autoTagService.buildPreview(
      [{ songId: 101, path: '/music/01-brutal.mp3', title: 'brutal' }],
      'rel-sour-2021'
    );

    // Apply when no fields are modified
    const result = await autoTagService.applyPreview(preview);
    expect(result.success).toBe(true);
  });
});
