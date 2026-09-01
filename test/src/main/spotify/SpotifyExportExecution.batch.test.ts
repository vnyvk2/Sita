import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../../../src/main/db/db';
import * as songsQuery from '../../../../src/main/db/queries/songs';
import { SpotifyApiClient } from '../../../../src/main/spotify/api/SpotifyApiClient';
import type {
  CatalogResolution,
  SpotifyPlaylistDetails
} from '../../../../src/main/spotify/api/types';
import { SpotifyTokenStore } from '../../../../src/main/spotify/auth/SpotifyTokenStore';
import { SpotifyPlaylistExportService } from '../../../../src/main/spotify/export/SpotifyPlaylistExportService';
import type { ValidatedExportRequest } from '../../../../src/main/spotify/ipc/SpotifyExportValidator';

describe('SpotifyPlaylistExportService (Batch Boundaries, Race Guards & Positional Integrity)', () => {
  let apiClient: SpotifyApiClient;
  let exportService: SpotifyPlaylistExportService;

  beforeEach(() => {
    apiClient = new SpotifyApiClient();
    exportService = new SpotifyPlaylistExportService(apiClient);

    vi.spyOn(SpotifyTokenStore, 'getValidAccessToken').mockResolvedValue('valid-access-token');
  });

  it('should chunk 100 tracks into exactly 1 HTTP request', async () => {
    const mockTracks = Array.from({ length: 100 }, (_, i) => ({
      position: i + 1,
      songId: i + 1,
      title: `Song ${i + 1}`,
      artists: ['Artist'],
      durationSecs: 200,
      decision: 'EXPORT' as const,
      resolution: {
        songId: i + 1,
        status: 'MATCHED' as const,
        spotifyUri: `spotify:track:sp_${i + 1}`,
        diagnostics: []
      },
      notes: []
    }));

    vi.spyOn(exportService, 'generateExportPlan').mockResolvedValue({
      playlistId: 1,
      playlistName: '100 Tracks Playlist',
      revision: 'rev-1',
      entries: mockTracks,
      statistics: {
        totalEntries: 100,
        exportableEntries: 100,
        unmatchedEntries: 0,
        variantConflictEntries: 0,
        searchFailedEntries: 0,
        plannedExportPercentage: 100
      },
      sourceFormat: 'nora',
      targetProvider: 'spotify'
    });

    const createSpy = vi.spyOn(apiClient, 'createPlaylist').mockResolvedValue({
      id: 'sp_pl_100',
      name: '100 Tracks Playlist',
      snapshot_id: 'snap_0'
    } as SpotifyPlaylistDetails);

    const addItemsSpy = vi
      .spyOn(apiClient, 'addPlaylistItems')
      .mockResolvedValue({ snapshot_id: 'snap_1' });

    const validated: ValidatedExportRequest = {
      playlistId: 1,
      playlistName: '100 Tracks Playlist',
      isPublic: false,
      revision: 'rev-1'
    };

    const result = await exportService.executeExport(validated, 'test-client');

    expect(result.status).toBe('SUCCESS');
    expect(result.totalBatches).toBe(1);
    expect(result.completedBatches).toBe(1);
    expect(result.snapshotId).toBe('snap_1');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(addItemsSpy).toHaveBeenCalledTimes(1);
    expect(addItemsSpy).toHaveBeenCalledWith(
      'valid-access-token',
      'sp_pl_100',
      expect.arrayContaining(['spotify:track:sp_1', 'spotify:track:sp_100'])
    );
  });

  it('should chunk 101 tracks into exactly 2 HTTP requests (100 + 1) and preserve duplicates across boundary', async () => {
    const mockTracks = Array.from({ length: 101 }, (_, i) => ({
      position: i + 1,
      songId: i + 1,
      title: `Song ${i + 1}`,
      artists: ['Artist'],
      durationSecs: 200,
      decision: 'EXPORT' as const,
      resolution: {
        songId: i + 1,
        status: 'MATCHED' as const,
        // Duplicates at position 99, 100, 101
        spotifyUri:
          i === 98
            ? 'spotify:track:sp_duplicate_A'
            : i === 99
              ? 'spotify:track:sp_song_B'
              : i === 100
                ? 'spotify:track:sp_duplicate_A'
                : `spotify:track:sp_${i + 1}`,
        diagnostics: []
      },
      notes: []
    }));

    vi.spyOn(exportService, 'generateExportPlan').mockResolvedValue({
      playlistId: 2,
      playlistName: '101 Tracks Boundary Playlist',
      revision: 'rev-2',
      entries: mockTracks,
      statistics: {
        totalEntries: 101,
        exportableEntries: 101,
        unmatchedEntries: 0,
        variantConflictEntries: 0,
        searchFailedEntries: 0,
        plannedExportPercentage: 100
      },
      sourceFormat: 'nora',
      targetProvider: 'spotify'
    });

    vi.spyOn(apiClient, 'createPlaylist').mockResolvedValue({
      id: 'sp_pl_101',
      name: '101 Tracks Boundary Playlist',
      snapshot_id: 'snap_0'
    } as SpotifyPlaylistDetails);

    const snapshotCalls: string[] = [];
    const addItemsSpy = vi
      .spyOn(apiClient, 'addPlaylistItems')
      .mockImplementation(async (_token, _plId, uris) => {
        const snap = `snap_${uris.length}`;
        snapshotCalls.push(snap);
        return { snapshot_id: snap };
      });

    const validated: ValidatedExportRequest = {
      playlistId: 2,
      playlistName: '101 Tracks Boundary Playlist',
      isPublic: false,
      revision: 'rev-2'
    };

    const result = await exportService.executeExport(validated, 'test-client');

    expect(result.status).toBe('SUCCESS');
    expect(result.totalBatches).toBe(2);
    expect(result.completedBatches).toBe(2);
    expect(result.snapshotId).toBe('snap_1'); // Final snapshot
    expect(addItemsSpy).toHaveBeenCalledTimes(2);

    // Verify first batch had 100 items with duplicate A at position 99 and song B at position 100
    const firstCallUris = addItemsSpy.mock.calls[0][2];
    expect(firstCallUris).toHaveLength(100);
    expect(firstCallUris[98]).toBe('spotify:track:sp_duplicate_A');
    expect(firstCallUris[99]).toBe('spotify:track:sp_song_B');

    // Verify second batch had 1 item with duplicate A at position 101 (preserved across batch)
    const secondCallUris = addItemsSpy.mock.calls[1][2];
    expect(secondCallUris).toHaveLength(1);
    expect(secondCallUris[0]).toBe('spotify:track:sp_duplicate_A');
  });

  it('should chunk 201 tracks into exactly 3 HTTP requests (100 + 100 + 1)', async () => {
    const mockTracks = Array.from({ length: 201 }, (_, i) => ({
      position: i + 1,
      songId: i + 1,
      title: `Song ${i + 1}`,
      artists: ['Artist'],
      durationSecs: 200,
      decision: 'EXPORT' as const,
      resolution: {
        songId: i + 1,
        status: 'MATCHED' as const,
        spotifyUri: `spotify:track:sp_${i + 1}`,
        diagnostics: []
      },
      notes: []
    }));

    vi.spyOn(exportService, 'generateExportPlan').mockResolvedValue({
      playlistId: 3,
      playlistName: '201 Tracks Playlist',
      revision: 'rev-3',
      entries: mockTracks,
      statistics: {
        totalEntries: 201,
        exportableEntries: 201,
        unmatchedEntries: 0,
        variantConflictEntries: 0,
        searchFailedEntries: 0,
        plannedExportPercentage: 100
      },
      sourceFormat: 'nora',
      targetProvider: 'spotify'
    });

    vi.spyOn(apiClient, 'createPlaylist').mockResolvedValue({
      id: 'sp_pl_201',
      name: '201 Tracks Playlist',
      snapshot_id: 'snap_0'
    } as SpotifyPlaylistDetails);

    const addItemsSpy = vi
      .spyOn(apiClient, 'addPlaylistItems')
      .mockResolvedValue({ snapshot_id: 'snap_step' });

    const validated: ValidatedExportRequest = {
      playlistId: 3,
      playlistName: '201 Tracks Playlist',
      isPublic: false,
      revision: 'rev-3'
    };

    const result = await exportService.executeExport(validated, 'test-client');

    expect(result.status).toBe('SUCCESS');
    expect(result.totalBatches).toBe(3);
    expect(result.completedBatches).toBe(3);
    expect(addItemsSpy).toHaveBeenCalledTimes(3);
  });

  it('should return PARTIAL_FAILURE with last known snapshot and failedBatchIndex if a later batch fails', async () => {
    const mockTracks = Array.from({ length: 200 }, (_, i) => ({
      position: i + 1,
      songId: i + 1,
      title: `Song ${i + 1}`,
      artists: ['Artist'],
      durationSecs: 200,
      decision: 'EXPORT' as const,
      resolution: {
        songId: i + 1,
        status: 'MATCHED' as const,
        spotifyUri: `spotify:track:sp_${i + 1}`,
        diagnostics: []
      },
      notes: []
    }));

    vi.spyOn(exportService, 'generateExportPlan').mockResolvedValue({
      playlistId: 4,
      playlistName: '200 Tracks Fail Playlist',
      revision: 'rev-4',
      entries: mockTracks,
      statistics: {
        totalEntries: 200,
        exportableEntries: 200,
        unmatchedEntries: 0,
        variantConflictEntries: 0,
        searchFailedEntries: 0,
        plannedExportPercentage: 100
      },
      sourceFormat: 'nora',
      targetProvider: 'spotify'
    });

    vi.spyOn(apiClient, 'createPlaylist').mockResolvedValue({
      id: 'sp_pl_fail',
      name: '200 Tracks Fail Playlist',
      snapshot_id: 'snap_initial_0'
    } as SpotifyPlaylistDetails);

    let batchCount = 0;
    vi.spyOn(apiClient, 'addPlaylistItems').mockImplementation(async () => {
      batchCount++;
      if (batchCount === 1) {
        return { snapshot_id: 'snap_batch_1_success' };
      }
      throw new Error('Spotify HTTP 429 Too Many Requests');
    });

    const validated: ValidatedExportRequest = {
      playlistId: 4,
      playlistName: '200 Tracks Fail Playlist',
      isPublic: false,
      revision: 'rev-4'
    };

    const result = await exportService.executeExport(validated, 'test-client');

    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.playlistId).toBe(4);
    expect(result.spotifyPlaylistId).toBe('sp_pl_fail');
    expect(result.spotifyPlaylistUrl).toBe('https://open.spotify.com/playlist/sp_pl_fail');
    expect(result.snapshotId).toBe('snap_batch_1_success');
    expect(result.totalBatches).toBe(2);
    expect(result.completedBatches).toBe(1);
    expect(result.failedBatchIndex).toBe(1);
    expect(result.error).toContain('429 Too Many Requests');
  });

  it('should reject execution if playlist revision changed between preview and execution, without calling createPlaylist', async () => {
    // Preview plan was generated at revision 'rev-initial'
    // But fresh plan generated during execution reflects database mutation 'rev-mutated'
    vi.spyOn(exportService, 'generateExportPlan').mockResolvedValue({
      playlistId: 10,
      playlistName: 'Mutated Playlist',
      revision: 'rev-mutated',
      entries: [
        {
          position: 1,
          songId: 1,
          title: 'Track',
          artists: ['Artist'],
          durationSecs: 200,
          decision: 'EXPORT',
          resolution: {
            songId: 1,
            status: 'MATCHED',
            spotifyUri: 'spotify:track:123',
            diagnostics: []
          },
          notes: []
        }
      ],
      statistics: {
        totalEntries: 1,
        exportableEntries: 1,
        unmatchedEntries: 0,
        variantConflictEntries: 0,
        searchFailedEntries: 0,
        plannedExportPercentage: 100
      },
      sourceFormat: 'nora',
      targetProvider: 'spotify'
    });

    const createSpy = vi.spyOn(apiClient, 'createPlaylist');

    const validated: ValidatedExportRequest = {
      playlistId: 10,
      playlistName: 'Mutated Playlist',
      isPublic: false,
      revision: 'rev-initial' // Stale revision
    };

    await expect(exportService.executeExport(validated, 'test-client')).rejects.toThrow(
      'Playlist changed while export was being prepared. Please refresh the preview.'
    );

    // Invariant: createPlaylist must never have been called
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('should strictly preserve 1..N positions when a playlist entry has a missing local song record in the DB', async () => {
    // Playlist in DB has 3 entries: Entry 1 (Song 101), Entry 2 (Dangling Song 999), Entry 3 (Song 103)
    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 25,
      name: 'Playlist With Dangling Record',
      description: 'Test playlist',
      updatedAt: new Date('2026-08-20T12:00:00.000Z'),
      entries: [
        { id: 1, playlistId: 25, songId: 101, position: 0 },
        { id: 2, playlistId: 25, songId: 999, position: 1 },
        { id: 3, playlistId: 25, songId: 103, position: 2 }
      ]
    } as any);

    // getAllSongs returns records only for 101 and 103 (999 is missing from songs table)
    vi.spyOn(songsQuery, 'getAllSongs').mockResolvedValue([
      {
        id: 101,
        title: 'Song 101',
        duration: 200,
        artists: [{ artist: { name: 'Artist 101' } }]
      },
      {
        id: 103,
        title: 'Song 103',
        duration: 220,
        artists: [{ artist: { name: 'Artist 103' } }]
      }
    ] as any);

    vi.spyOn(apiClient, 'searchTracks').mockImplementation(async (_token, query) => {
      if (query.includes('song 101')) {
        return [
          {
            id: 'sp_101',
            uri: 'spotify:track:sp_101',
            name: 'Song 101',
            artists: [{ name: 'Artist 101' }],
            duration_ms: 200000,
            type: 'track'
          }
        ];
      }
      if (query.includes('song 103')) {
        return [
          {
            id: 'sp_103',
            uri: 'spotify:track:sp_103',
            name: 'Song 103',
            artists: [{ name: 'Artist 103' }],
            duration_ms: 220000,
            type: 'track'
          }
        ];
      }
      return [];
    });

    const plan = await exportService.generateExportPlan(25, 'test-client');

    // Invariant: Exact positional preservation 1..3 without collapsing or shifting
    expect(plan.entries).toHaveLength(3);

    // Position 1: Song 101 -> EXPORT
    expect(plan.entries[0].position).toBe(1);
    expect(plan.entries[0].songId).toBe(101);
    expect(plan.entries[0].decision).toBe('EXPORT');
    expect(plan.entries[0].resolution.spotifyUri).toBe('spotify:track:sp_101');

    // Position 2: Dangling Song 999 -> SKIP_NOT_IN_CATALOG with LOCAL_SONG_NOT_FOUND
    expect(plan.entries[1].position).toBe(2);
    expect(plan.entries[1].songId).toBe(999);
    expect(plan.entries[1].decision).toBe('SKIP_NOT_IN_CATALOG');
    expect(plan.entries[1].resolution.status).toBe('NOT_IN_CATALOG');
    expect(plan.entries[1].resolution.diagnostics).toContain('LOCAL_SONG_NOT_FOUND');

    // Position 3: Song 103 -> EXPORT (maintained position 3)
    expect(plan.entries[2].position).toBe(3);
    expect(plan.entries[2].songId).toBe(103);
    expect(plan.entries[2].decision).toBe('EXPORT');
    expect(plan.entries[2].resolution.spotifyUri).toBe('spotify:track:sp_103');

    // Statistics accuracy
    expect(plan.statistics.totalEntries).toBe(3);
    expect(plan.statistics.exportableEntries).toBe(2);
    expect(plan.statistics.unmatchedEntries).toBe(1);
    expect(plan.statistics.plannedExportPercentage).toBe(67);
  });

  describe('Revision-Aware Export Cache & Memoization', () => {
    it('1. Same playlist + same revision -> reuses cache without new search requests', async () => {
      vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
        id: 10,
        name: 'Cache Test Playlist',
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
        entries: [{ id: 1, playlistId: 10, songId: 50, position: 0 }]
      } as any);

      vi.spyOn(songsQuery, 'getAllSongs').mockResolvedValue([
        {
          id: 50,
          title: 'Cache Song',
          duration: 180,
          artists: [{ artist: { name: 'Cache Artist' } }]
        }
      ] as any);

      const searchSpy = vi
        .spyOn(apiClient, 'searchTracks')
        .mockResolvedValue([
          {
            id: 'sp_50',
            uri: 'spotify:track:sp_50',
            name: 'Cache Song',
            artists: [{ name: 'Cache Artist' }],
            duration_ms: 180000,
            type: 'track'
          }
        ]);

      const sessionCache: any = {};
      await exportService.generateExportPlan(10, 'test-client', sessionCache);
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Call again with same playlist and same revision
      searchSpy.mockClear();
      await exportService.generateExportPlan(10, 'test-client', sessionCache);
      expect(searchSpy).not.toHaveBeenCalled();
    });

    it('2. Same playlist + different revision -> re-resolves and ignores stale cache', async () => {
      let currentUpdatedAt = new Date('2026-08-20T10:00:00.000Z');
      vi.spyOn(db.query.playlists, 'findFirst').mockImplementation(
        async () =>
          ({
            id: 10,
            name: 'Cache Test Playlist',
            updatedAt: currentUpdatedAt,
            entries: [{ id: 1, playlistId: 10, songId: 50, position: 0 }]
          }) as any
      );

      vi.spyOn(songsQuery, 'getAllSongs').mockResolvedValue([
        {
          id: 50,
          title: 'Cache Song',
          duration: 180,
          artists: [{ artist: { name: 'Cache Artist' } }]
        }
      ] as any);

      const searchSpy = vi
        .spyOn(apiClient, 'searchTracks')
        .mockResolvedValue([
          {
            id: 'sp_50',
            uri: 'spotify:track:sp_50',
            name: 'Cache Song',
            artists: [{ name: 'Cache Artist' }],
            duration_ms: 180000,
            type: 'track'
          }
        ]);

      const sessionCache: any = {};
      await exportService.generateExportPlan(10, 'test-client', sessionCache);
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Mutate playlist revision (updatedAt changes)
      currentUpdatedAt = new Date('2026-08-20T11:00:00.000Z');
      searchSpy.mockClear();
      await exportService.generateExportPlan(10, 'test-client', sessionCache);
      expect(searchSpy).toHaveBeenCalledTimes(1);
    });

    it('3. Different playlist + same revision string -> does not reuse other playlist cache', async () => {
      vi.spyOn(db.query.playlists, 'findFirst').mockImplementation(async (opts: any) => {
        const id = opts?.where?.id ?? 11;
        return {
          id,
          name: `Playlist ${id}`,
          updatedAt: new Date('2026-08-20T10:00:00.000Z'),
          entries: [{ id: 1, playlistId: id, songId: 50, position: 0 }]
        } as any;
      });

      vi.spyOn(songsQuery, 'getAllSongs').mockResolvedValue([
        {
          id: 50,
          title: 'Cache Song',
          duration: 180,
          artists: [{ artist: { name: 'Cache Artist' } }]
        }
      ] as any);

      const searchSpy = vi
        .spyOn(apiClient, 'searchTracks')
        .mockResolvedValue([
          {
            id: 'sp_50',
            uri: 'spotify:track:sp_50',
            name: 'Cache Song',
            artists: [{ name: 'Cache Artist' }],
            duration_ms: 180000,
            type: 'track'
          }
        ]);

      const sessionCache: any = {};
      await exportService.generateExportPlan(10, 'test-client', sessionCache);
      expect(searchSpy).toHaveBeenCalledTimes(1);

      searchSpy.mockClear();
      // Query playlist 11 with same sessionCache
      await exportService.generateExportPlan(11, 'test-client', sessionCache);
      expect(searchSpy).toHaveBeenCalledTimes(1);
    });

    it('4. Duplicate entries in same playlist -> resolves track only once', async () => {
      vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
        id: 12,
        name: 'Duplicate Playlist',
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
        entries: [
          { id: 1, playlistId: 12, songId: 50, position: 0 },
          { id: 2, playlistId: 12, songId: 50, position: 1 },
          { id: 3, playlistId: 12, songId: 50, position: 2 }
        ]
      } as any);

      vi.spyOn(songsQuery, 'getAllSongs').mockResolvedValue([
        {
          id: 50,
          title: 'Duplicate Song',
          duration: 180,
          artists: [{ artist: { name: 'Cache Artist' } }]
        }
      ] as any);

      const searchSpy = vi
        .spyOn(apiClient, 'searchTracks')
        .mockResolvedValue([
          {
            id: 'sp_50',
            uri: 'spotify:track:sp_50',
            name: 'Duplicate Song',
            artists: [{ name: 'Cache Artist' }],
            duration_ms: 180000,
            type: 'track'
          }
        ]);

      const plan = await exportService.generateExportPlan(12, 'test-client');
      expect(searchSpy).toHaveBeenCalledTimes(1);
      expect(plan.entries).toHaveLength(3);
      expect(plan.entries[0].resolution.spotifyUri).toBe('spotify:track:sp_50');
      expect(plan.entries[1].resolution.spotifyUri).toBe('spotify:track:sp_50');
      expect(plan.entries[2].resolution.spotifyUri).toBe('spotify:track:sp_50');
    });

    it('5. Same playlist + same updatedAt timestamp + entries added/removed -> changes revision and invalidates cache', async () => {
      let currentEntries = [{ id: 1, playlistId: 13, songId: 50, position: 0 }];
      vi.spyOn(db.query.playlists, 'findFirst').mockImplementation(
        async () =>
          ({
            id: 13,
            name: 'Entry Mutation Playlist',
            updatedAt: new Date('2026-08-20T10:00:00.000Z'),
            entries: currentEntries
          }) as any
      );

      vi.spyOn(songsQuery, 'getAllSongs').mockImplementation(async (opts: any) => {
        const ids = opts?.songIds || [];
        return ids.map((id: number) => ({
          id,
          title: `Song ${id}`,
          duration: 180,
          artists: [{ artist: { name: 'Cache Artist' } }]
        })) as any;
      });

      const searchSpy = vi
        .spyOn(apiClient, 'searchTracks')
        .mockImplementation(async (_token, query) => [
          {
            id: `sp_${query}`,
            uri: `spotify:track:sp_${query}`,
            name: query,
            artists: [{ name: 'Cache Artist' }],
            duration_ms: 180000,
            type: 'track'
          }
        ]);

      const sessionCache: any = {};
      await exportService.generateExportPlan(13, 'test-client', sessionCache);
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Mutate entries count while updatedAt remains constant
      currentEntries = [
        { id: 1, playlistId: 13, songId: 50, position: 0 },
        { id: 2, playlistId: 13, songId: 51, position: 1 }
      ];
      searchSpy.mockClear();
      await exportService.generateExportPlan(13, 'test-client', sessionCache);
      expect(searchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
