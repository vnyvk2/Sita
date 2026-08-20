import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SpotifyApiClient } from '../../../../src/main/spotify/api/SpotifyApiClient';
import type {
  CatalogResolution,
  SpotifyPlaylistDetails
} from '../../../../src/main/spotify/api/types';
import { SpotifyTokenStore } from '../../../../src/main/spotify/auth/SpotifyTokenStore';
import { SpotifyPlaylistExportService } from '../../../../src/main/spotify/export/SpotifyPlaylistExportService';
import type { ValidatedExportRequest } from '../../../../src/main/spotify/ipc/SpotifyExportValidator';

describe('SpotifyPlaylistExportService (Batch Boundaries & Partial Failure)', () => {
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
    expect(result.playlistId).toBe('sp_pl_fail');
    expect(result.playlistUrl).toBe('https://open.spotify.com/playlist/sp_pl_fail');
    expect(result.snapshotId).toBe('snap_batch_1_success');
    expect(result.totalBatches).toBe(2);
    expect(result.completedBatches).toBe(1);
    expect(result.failedBatchIndex).toBe(1);
    expect(result.error).toContain('429 Too Many Requests');
  });
});
