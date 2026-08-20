import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../../../src/main/db/db';
import { SpotifyApiClient } from '../../../../src/main/spotify/api/SpotifyApiClient';
import type { PlaylistOccurrence } from '../../../../src/main/spotify/api/types';
import { SpotifyTokenStore } from '../../../../src/main/spotify/auth/SpotifyTokenStore';
import { SpotifyPlaylistSyncDriftDetector } from '../../../../src/main/spotify/sync/SpotifyPlaylistSyncDriftDetector';
import { SpotifyPlaylistSyncService } from '../../../../src/main/spotify/sync/SpotifyPlaylistSyncService';

describe('SpotifyPlaylistSyncExecution (Target-State Invariants & E2E Verification)', () => {
  let mockApiClient: SpotifyApiClient;
  let service: SpotifyPlaylistSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    SpotifyPlaylistSyncService.activeSyncLocks.clear();

    mockApiClient = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'sp_user_1', displayName: 'Spotify User' }),
      getPlaylistDetails: vi.fn().mockResolvedValue({
        id: 'sp_pl_1',
        name: 'Remote Playlist',
        snapshot_id: 'snap_base_100',
        public: true,
        owner: { id: 'sp_user_1' },
        tracks: { total: 3 }
      }),
      getAllPlaylistItems: vi.fn().mockResolvedValue([]),
      replacePlaylistItems: vi.fn().mockResolvedValue({ snapshot_id: 'snap_mutated_101' }),
      addPlaylistItems: vi.fn().mockResolvedValue({ snapshot_id: 'snap_mutated_102' }),
      searchTracks: vi.fn().mockResolvedValue([])
    } as unknown as SpotifyApiClient;

    service = new SpotifyPlaylistSyncService(mockApiClient);

    vi.spyOn(SpotifyTokenStore, 'getValidAccessToken').mockResolvedValue('mock_access_token');
    vi.spyOn(SpotifyTokenStore, 'hasRequiredScopes').mockResolvedValue(true);
  });

  it('Test 1 (REMOTE_WINS): Local [A, B, C] vs Remote [A, C, D] -> Local becomes [A, C, D]', async () => {
    const localEntries = [
      { songId: 101, position: 0, song: { id: 101 } },
      { songId: 102, position: 1, song: { id: 102 } },
      { songId: 103, position: 2, song: { id: 103 } }
    ];
    const baseHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
      localEntries.map((e, idx) => ({ position: idx + 1, songId: e.songId, isrc: undefined }))
    );

    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 10,
      entries: localEntries
    } as any);

    vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
      id: 1,
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      spotifyUserId: 'sp_user_1',
      lastSyncedSnapshotId: 'snap_base_100',
      lastSyncedEntriesHash: baseHash,
      syncStrategy: 'REMOTE_WINS',
      syncState: 'SYNCED'
    });

    const mockLocalTarget: PlaylistOccurrence[] = [
      { occurrenceId: 'A#0', identityKey: 'A', occurrenceIndex: 0, position: 0, canonicalTrack: { title: 'A', artists: ['Art'] }, localSongId: 101 },
      { occurrenceId: 'C#0', identityKey: 'C', occurrenceIndex: 0, position: 1, canonicalTrack: { title: 'C', artists: ['Art'] }, localSongId: 103 },
      { occurrenceId: 'D#0', identityKey: 'D', occurrenceIndex: 0, position: 2, canonicalTrack: { title: 'D', artists: ['Art'] }, localSongId: 104 }
    ];

    vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      strategy: 'REMOTE_WINS',
      base: { localEntriesHash: baseHash, remoteSnapshotId: 'snap_base_100' },
      localTarget: mockLocalTarget,
      remoteTarget: [
        { occurrenceId: 'A#0', identityKey: 'A', occurrenceIndex: 0, position: 0, canonicalTrack: { title: 'A', artists: ['Art'] }, spotifyUri: 'spotify:track:A' },
        { occurrenceId: 'C#0', identityKey: 'C', occurrenceIndex: 0, position: 1, canonicalTrack: { title: 'C', artists: ['Art'] }, spotifyUri: 'spotify:track:C' },
        { occurrenceId: 'D#0', identityKey: 'D', occurrenceIndex: 0, position: 2, canonicalTrack: { title: 'D', artists: ['Art'] }, spotifyUri: 'spotify:track:D' }
      ],
      localOperations: [],
      remoteOperations: [],
      unresolvedRemoteOccurrences: [],
      statistics: { inSyncOccurrences: 2, localAdditionsCount: 1, localRemovalsCount: 1, remoteAdditionsCount: 0, remoteRemovalsCount: 0, unresolvedRemoteCount: 0 },
      plannedAt: new Date().toISOString()
    });

    // Remote verification mock
    vi.spyOn(mockApiClient, 'getAllPlaylistItems').mockResolvedValue([
      { item: { track: { uri: 'spotify:track:A' } } },
      { item: { track: { uri: 'spotify:track:C' } } },
      { item: { track: { uri: 'spotify:track:D' } } }
    ] as any);

    let deletedAll = false;
    const insertedSongs: { songId: number; position: number }[] = [];

    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      return await cb({
        delete: vi.fn().mockImplementation(() => {
          deletedAll = true;
          return { where: vi.fn().mockResolvedValue({}) };
        }),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            insertedSongs.push({ songId: val.songId, position: val.position });
            return Promise.resolve({});
          })
        }))
      });
    });

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) })
    } as any);

    const result = await service.executeSync(10, 'REMOTE_WINS');

    expect(result.status).toBe('SUCCESS');
    expect(deletedAll).toBe(true);
    expect(insertedSongs).toEqual([
      { songId: 101, position: 0 },
      { songId: 103, position: 1 },
      { songId: 104, position: 2 }
    ]);
  });

  it('Test 2 (LOCAL_WINS): Local [A, B, C] vs Remote [A, C] -> Spotify replaced with [A, B, C]', async () => {
    const localEntries = [
      { songId: 101, position: 0, song: { id: 101 } },
      { songId: 102, position: 1, song: { id: 102 } },
      { songId: 103, position: 2, song: { id: 103 } }
    ];
    const baseHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
      localEntries.map((e, idx) => ({ position: idx + 1, songId: e.songId, isrc: undefined }))
    );

    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 10,
      entries: localEntries
    } as any);

    vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
      id: 1,
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      spotifyUserId: 'sp_user_1',
      lastSyncedSnapshotId: 'snap_base_100',
      lastSyncedEntriesHash: baseHash,
      syncStrategy: 'LOCAL_WINS',
      syncState: 'SYNCED'
    });

    vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      strategy: 'LOCAL_WINS',
      base: { localEntriesHash: baseHash, remoteSnapshotId: 'snap_base_100' },
      localTarget: [
        { occurrenceId: 'A#0', identityKey: 'A', occurrenceIndex: 0, position: 0, canonicalTrack: { title: 'A', artists: ['Art'] }, localSongId: 101 },
        { occurrenceId: 'B#0', identityKey: 'B', occurrenceIndex: 0, position: 1, canonicalTrack: { title: 'B', artists: ['Art'] }, localSongId: 102 },
        { occurrenceId: 'C#0', identityKey: 'C', occurrenceIndex: 0, position: 2, canonicalTrack: { title: 'C', artists: ['Art'] }, localSongId: 103 }
      ],
      remoteTarget: [
        { occurrenceId: 'A#0', identityKey: 'A', occurrenceIndex: 0, position: 0, canonicalTrack: { title: 'A', artists: ['Art'] }, spotifyUri: 'spotify:track:A' },
        { occurrenceId: 'B#0', identityKey: 'B', occurrenceIndex: 0, position: 1, canonicalTrack: { title: 'B', artists: ['Art'] }, spotifyUri: 'spotify:track:B' },
        { occurrenceId: 'C#0', identityKey: 'C', occurrenceIndex: 0, position: 2, canonicalTrack: { title: 'C', artists: ['Art'] }, spotifyUri: 'spotify:track:C' }
      ],
      localOperations: [],
      remoteOperations: [],
      unresolvedRemoteOccurrences: [],
      statistics: { inSyncOccurrences: 2, localAdditionsCount: 0, localRemovalsCount: 0, remoteAdditionsCount: 1, remoteRemovalsCount: 0, unresolvedRemoteCount: 0 },
      plannedAt: new Date().toISOString()
    });

    vi.spyOn(mockApiClient, 'getAllPlaylistItems').mockResolvedValue([
      { item: { track: { uri: 'spotify:track:A' } } },
      { item: { track: { uri: 'spotify:track:B' } } },
      { item: { track: { uri: 'spotify:track:C' } } }
    ] as any);

    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      return await cb({
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) })
      });
    });

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) })
    } as any);

    const result = await service.executeSync(10, 'LOCAL_WINS');

    expect(result.status).toBe('SUCCESS');
    expect(mockApiClient.replacePlaylistItems).toHaveBeenCalledWith(
      'mock_access_token',
      'sp_pl_1',
      ['spotify:track:A', 'spotify:track:B', 'spotify:track:C']
    );
  });

  it('Test 5 (>100 tracks staged replacement): 250 items -> PUT(0..99) + POST(100..199) + POST(200..249)', async () => {
    const localEntries: any[] = [];
    const baseHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash([]);

    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 10,
      entries: localEntries
    } as any);

    vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
      id: 1,
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      spotifyUserId: 'sp_user_1',
      lastSyncedSnapshotId: 'snap_base_100',
      lastSyncedEntriesHash: baseHash,
      syncStrategy: 'LOCAL_WINS',
      syncState: 'SYNCED'
    });

    const target250Uris = Array.from({ length: 250 }, (_, i) => `spotify:track:t_${i}`);
    const remoteTarget250: PlaylistOccurrence[] = target250Uris.map((uri, idx) => ({
      occurrenceId: `t_${idx}#0`,
      identityKey: `t_${idx}`,
      occurrenceIndex: 0,
      position: idx,
      canonicalTrack: { title: `Track ${idx}`, artists: ['Artist'] },
      spotifyUri: uri
    }));

    vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      strategy: 'LOCAL_WINS',
      base: { localEntriesHash: baseHash, remoteSnapshotId: 'snap_base_100' },
      localTarget: [],
      remoteTarget: remoteTarget250,
      localOperations: [],
      remoteOperations: [],
      unresolvedRemoteOccurrences: [],
      statistics: { inSyncOccurrences: 0, localAdditionsCount: 0, localRemovalsCount: 0, remoteAdditionsCount: 250, remoteRemovalsCount: 0, unresolvedRemoteCount: 0 },
      plannedAt: new Date().toISOString()
    });

    vi.spyOn(mockApiClient, 'getAllPlaylistItems').mockResolvedValue(
      target250Uris.map((uri) => ({ item: { track: { uri } } })) as any
    );

    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      return await cb({
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) })
      });
    });

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) })
    } as any);

    const result = await service.executeSync(10, 'LOCAL_WINS');

    expect(result.status).toBe('SUCCESS');
    expect(result.completedRemoteBatches).toBe(3); // 1 PUT + 2 POSTs
    expect(mockApiClient.replacePlaylistItems).toHaveBeenCalledTimes(1);
    expect(mockApiClient.replacePlaylistItems).toHaveBeenCalledWith(
      'mock_access_token',
      'sp_pl_1',
      target250Uris.slice(0, 100)
    );
    expect(mockApiClient.addPlaylistItems).toHaveBeenCalledTimes(2);
    expect(mockApiClient.addPlaylistItems).toHaveBeenNthCalledWith(
      1,
      'mock_access_token',
      'sp_pl_1',
      target250Uris.slice(100, 200)
    );
    expect(mockApiClient.addPlaylistItems).toHaveBeenNthCalledWith(
      2,
      'mock_access_token',
      'sp_pl_1',
      target250Uris.slice(200, 250)
    );
  });

  it('Test 6 (Remote batch failure): batch 2 fails -> PARTIAL_FAILURE with failedBatchIndex = 1 and lock released', async () => {
    const baseHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash([]);

    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 10,
      entries: []
    } as any);

    vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
      id: 1,
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      spotifyUserId: 'sp_user_1',
      lastSyncedSnapshotId: 'snap_base_100',
      lastSyncedEntriesHash: baseHash,
      syncStrategy: 'LOCAL_WINS',
      syncState: 'SYNCED'
    });

    const target250Uris = Array.from({ length: 250 }, (_, i) => `spotify:track:t_${i}`);
    const remoteTarget250: PlaylistOccurrence[] = target250Uris.map((uri, idx) => ({
      occurrenceId: `t_${idx}#0`,
      identityKey: `t_${idx}`,
      occurrenceIndex: 0,
      position: idx,
      canonicalTrack: { title: `Track ${idx}`, artists: ['Artist'] },
      spotifyUri: uri
    }));

    vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      strategy: 'LOCAL_WINS',
      base: { localEntriesHash: baseHash, remoteSnapshotId: 'snap_base_100' },
      localTarget: [],
      remoteTarget: remoteTarget250,
      localOperations: [],
      remoteOperations: [],
      unresolvedRemoteOccurrences: [],
      statistics: { inSyncOccurrences: 0, localAdditionsCount: 0, localRemovalsCount: 0, remoteAdditionsCount: 250, remoteRemovalsCount: 0, unresolvedRemoteCount: 0 },
      plannedAt: new Date().toISOString()
    });

    // First chunk PUT succeeds, second chunk POST fails
    vi.spyOn(mockApiClient, 'replacePlaylistItems').mockResolvedValue({ snapshot_id: 'snap_put_1' });
    vi.spyOn(mockApiClient, 'addPlaylistItems').mockRejectedValue(new Error('Spotify HTTP 429 Too Many Requests'));

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) })
    } as any);

    const result = await service.executeSync(10, 'LOCAL_WINS');

    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.failureStage).toBe('REMOTE');
    expect(result.completedRemoteBatches).toBe(1);
    expect(result.failedBatchIndex).toBe(1);
    expect(SpotifyPlaylistSyncService.activeSyncLocks.has(10)).toBe(false); // Lock released!
  });

  it('Test 7 (Remote post-write verification mismatch): PUT succeeds but GET returns wrong items -> PARTIAL_FAILURE', async () => {
    const baseHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash([]);

    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 10,
      entries: []
    } as any);

    vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
      id: 1,
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      spotifyUserId: 'sp_user_1',
      lastSyncedSnapshotId: 'snap_base_100',
      lastSyncedEntriesHash: baseHash,
      syncStrategy: 'LOCAL_WINS',
      syncState: 'SYNCED'
    });

    vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      strategy: 'LOCAL_WINS',
      base: { localEntriesHash: baseHash, remoteSnapshotId: 'snap_base_100' },
      localTarget: [],
      remoteTarget: [
        { occurrenceId: 'A#0', identityKey: 'A', occurrenceIndex: 0, position: 0, canonicalTrack: { title: 'A', artists: ['Art'] }, spotifyUri: 'spotify:track:A' },
        { occurrenceId: 'B#0', identityKey: 'B', occurrenceIndex: 0, position: 1, canonicalTrack: { title: 'B', artists: ['Art'] }, spotifyUri: 'spotify:track:B' }
      ],
      localOperations: [],
      remoteOperations: [],
      unresolvedRemoteOccurrences: [],
      statistics: { inSyncOccurrences: 0, localAdditionsCount: 0, localRemovalsCount: 0, remoteAdditionsCount: 2, remoteRemovalsCount: 0, unresolvedRemoteCount: 0 },
      plannedAt: new Date().toISOString()
    });

    vi.spyOn(mockApiClient, 'replacePlaylistItems').mockResolvedValue({ snapshot_id: 'snap_put_1' });

    // Mock GET returning only 1 track instead of 2
    vi.spyOn(mockApiClient, 'getAllPlaylistItems').mockResolvedValue([
      { item: { track: { uri: 'spotify:track:A' } } }
    ] as any);

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) })
    } as any);

    const result = await service.executeSync(10, 'LOCAL_WINS');

    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.failureStage).toBe('REMOTE');
    expect(result.error).toContain('Remote Spotify verification failed');
    expect(SpotifyPlaylistSyncService.activeSyncLocks.has(10)).toBe(false);
  });

  it('Test 8 (Concurrent remote modification): Remote snapshot changed during sync -> Abort with CONFLICT', async () => {
    const baseHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash([]);

    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 10,
      entries: []
    } as any);

    vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
      id: 1,
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      spotifyUserId: 'sp_user_1',
      lastSyncedSnapshotId: 'snap_base_100',
      lastSyncedEntriesHash: baseHash,
      syncStrategy: 'LOCAL_WINS',
      syncState: 'SYNCED'
    });

    vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      strategy: 'LOCAL_WINS',
      base: { localEntriesHash: baseHash, remoteSnapshotId: 'snap_base_100' },
      localTarget: [],
      remoteTarget: [],
      localOperations: [],
      remoteOperations: [],
      unresolvedRemoteOccurrences: [],
      statistics: { inSyncOccurrences: 0, localAdditionsCount: 0, localRemovalsCount: 0, remoteAdditionsCount: 0, remoteRemovalsCount: 0, unresolvedRemoteCount: 0 },
      plannedAt: new Date().toISOString()
    });

    // Remote snapshot changed from snap_base_100 to snap_diverged_200
    vi.spyOn(mockApiClient, 'getPlaylistDetails').mockResolvedValue({
      id: 'sp_pl_1',
      name: 'Remote Playlist',
      snapshot_id: 'snap_diverged_200',
      public: true,
      owner: { id: 'sp_user_1' }
    } as any);

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) })
    } as any);

    const result = await service.executeSync(10, 'LOCAL_WINS');

    expect(result.status).toBe('ERROR');
    expect(result.syncState).toBe('CONFLICT');
    expect(result.error).toContain('Remote Spotify playlist was modified');
    expect(mockApiClient.replacePlaylistItems).not.toHaveBeenCalled();
    expect(SpotifyPlaylistSyncService.activeSyncLocks.has(10)).toBe(false);
  });

  it('Test 9 (Concurrent local modification): Local entries hash changed during sync -> Abort with CONFLICT', async () => {
    const baseHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash([]);

    vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
      id: 1,
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      spotifyUserId: 'sp_user_1',
      lastSyncedSnapshotId: 'snap_base_100',
      lastSyncedEntriesHash: baseHash,
      syncStrategy: 'LOCAL_WINS',
      syncState: 'SYNCED'
    });

    vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
      playlistId: 10,
      spotifyPlaylistId: 'sp_pl_1',
      strategy: 'LOCAL_WINS',
      base: { localEntriesHash: baseHash, remoteSnapshotId: 'snap_base_100' },
      localTarget: [],
      remoteTarget: [],
      localOperations: [],
      remoteOperations: [],
      unresolvedRemoteOccurrences: [],
      statistics: { inSyncOccurrences: 0, localAdditionsCount: 0, localRemovalsCount: 0, remoteAdditionsCount: 0, remoteRemovalsCount: 0, unresolvedRemoteCount: 0 },
      plannedAt: new Date().toISOString()
    });

    // Local playlist changed so entries hash does not match baseHash
    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 10,
      entries: [{ songId: 999, position: 0, song: { id: 999, isrc: 'NEW_ISRC' } }]
    } as any);

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) })
    } as any);

    const result = await service.executeSync(10, 'LOCAL_WINS');

    expect(result.status).toBe('ERROR');
    expect(result.syncState).toBe('CONFLICT');
    expect(result.error).toContain('Local playlist was modified');
    expect(mockApiClient.replacePlaylistItems).not.toHaveBeenCalled();
    expect(SpotifyPlaylistSyncService.activeSyncLocks.has(10)).toBe(false);
  });
});
