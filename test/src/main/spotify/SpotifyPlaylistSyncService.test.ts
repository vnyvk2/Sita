import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../../../src/main/db/db';
import * as songsQuery from '../../../../src/main/db/queries/songs';
import { SpotifyApiClient } from '../../../../src/main/spotify/api/SpotifyApiClient';
import { SpotifyTokenStore } from '../../../../src/main/spotify/auth/SpotifyTokenStore';
import { SpotifyPlaylistSyncService } from '../../../../src/main/spotify/sync/SpotifyPlaylistSyncService';

describe('SpotifyPlaylistSyncService', () => {
  let mockApiClient: SpotifyApiClient;
  let service: SpotifyPlaylistSyncService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApiClient = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'spotify_user_1', displayName: 'User 1' }),
      getPlaylistDetails: vi.fn().mockResolvedValue({
        id: 'sp_pl_1',
        name: 'Remote Playlist',
        snapshot_id: 'snap_remote_100',
        public: true,
        owner: { id: 'spotify_user_1' },
        tracks: { total: 2 }
      }),
      getAllPlaylistItems: vi.fn().mockResolvedValue([
        { item: { track: { id: 't1', name: 'Track 1', uri: 'spotify:track:t1', artists: [{ name: 'Artist 1' }] } } },
        { item: { track: { id: 't2', name: 'Track 2', uri: 'spotify:track:t2', artists: [{ name: 'Artist 2' }] } } }
      ]),
      addPlaylistItems: vi.fn().mockResolvedValue({ snapshot_id: 'snap_remote_101' }),
      removePlaylistItems: vi.fn().mockResolvedValue({ snapshot_id: 'snap_remote_102' }),
      searchTracks: vi.fn().mockResolvedValue([])
    } as unknown as SpotifyApiClient;

    service = new SpotifyPlaylistSyncService(mockApiClient);

    vi.spyOn(SpotifyTokenStore, 'getValidAccessToken').mockResolvedValue('valid_mock_token');
    vi.spyOn(SpotifyTokenStore, 'hasRequiredScopes').mockResolvedValue(true);
  });

  describe('linkPlaylist & unlinkPlaylist', () => {
    it('should link playlist, establish initial baselines, and return link record', async () => {
      vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
        id: 10,
        name: 'Local Playlist',
        entries: [
          { songId: 101, position: 0, song: { id: 101, isrc: 'ISRC1' } }
        ]
      } as any);

      vi.spyOn(db.query.spotifyPlaylistLinks, 'findFirst')
        .mockResolvedValueOnce(null) // for existing check
        .mockResolvedValueOnce({
          id: 1,
          playlistId: 10,
          spotifyPlaylistId: 'sp_pl_1',
          spotifyPlaylistName: 'Remote Playlist',
          spotifyUserId: 'spotify_user_1',
          lastSyncedSnapshotId: 'snap_remote_100',
          lastSyncedEntriesHash: 'hash_test_123',
          syncStrategy: 'UNION_MERGE',
          syncState: 'SYNCED',
          lastSyncedAt: new Date()
        } as any);

      vi.spyOn(db, 'insert').mockReturnValue({
        values: vi.fn().mockResolvedValue({})
      } as any);

      const link = await service.linkPlaylist(10, 'sp_pl_1', 'UNION_MERGE');

      expect(link.playlistId).toBe(10);
      expect(link.spotifyPlaylistId).toBe('sp_pl_1');
      expect(link.syncState).toBe('SYNCED');
      expect(mockApiClient.getCurrentUser).toHaveBeenCalledWith('valid_mock_token');
      expect(mockApiClient.getPlaylistDetails).toHaveBeenCalledWith('valid_mock_token', 'sp_pl_1');
    });

    it('should reject linkPlaylist if user lacks modification permissions', async () => {
      vi.spyOn(SpotifyTokenStore, 'hasRequiredScopes').mockResolvedValue(false);

      await expect(service.linkPlaylist(10, 'sp_pl_1')).rejects.toThrow(
        /Spotify token lacks required permission/
      );
    });

    it('should delete link record on unlinkPlaylist', async () => {
      const deleteSpy = vi.spyOn(db, 'delete').mockReturnValue({
        where: vi.fn().mockResolvedValue({})
      } as any);

      const result = await service.unlinkPlaylist(10);

      expect(result).toBe(true);
      expect(deleteSpy).toHaveBeenCalled();
    });
  });

  describe('detectSyncDrift', () => {
    it('should return drift status comparing remote snapshot and local entries hash', async () => {
      vi.spyOn(db.query.spotifyPlaylistLinks, 'findFirst').mockResolvedValue({
        id: 1,
        playlistId: 10,
        spotifyPlaylistId: 'sp_pl_1',
        spotifyUserId: 'spotify_user_1',
        lastSyncedSnapshotId: 'snap_remote_100',
        lastSyncedEntriesHash: 'hash_baseline_100',
        syncStrategy: 'UNION_MERGE',
        syncState: 'SYNCED'
      } as any);

      vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
        id: 10,
        entries: [{ songId: 101, position: 0, song: { id: 101 } }]
      } as any);

      const drift = await service.detectSyncDrift(10);

      expect(drift.playlistId).toBe(10);
      expect(drift.currentSnapshotId).toBe('snap_remote_100');
      expect(drift.syncState).toBe('SYNCED');
    });
  });

  describe('executeSync', () => {
    it('should execute remote mutations, local DB mutations, and update link baseline on success', async () => {
      vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
        id: 1,
        playlistId: 10,
        spotifyPlaylistId: 'sp_pl_1',
        spotifyUserId: 'spotify_user_1',
        lastSyncedSnapshotId: 'snap_remote_100',
        lastSyncedEntriesHash: 'hash_baseline_100',
        syncStrategy: 'UNION_MERGE',
        syncState: 'SYNCED'
      });

      vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
        playlistId: 10,
        spotifyPlaylistId: 'sp_pl_1',
        strategy: 'UNION_MERGE',
        localOperations: [{ action: 'ADD', songId: 102, occurrenceId: 't2#0', title: 'Track 2', artists: ['Artist 2'] }],
        remoteOperations: [{ action: 'ADD', spotifyUri: 'spotify:track:t1', occurrenceId: 't1#0', title: 'Track 1', artists: ['Artist 1'] }],
        unresolvedRemoteOccurrences: [],
        statistics: {
          inSyncOccurrences: 0,
          localAdditionsCount: 1,
          localRemovalsCount: 0,
          remoteAdditionsCount: 1,
          remoteRemovalsCount: 0,
          unresolvedRemoteCount: 0
        },
        plannedAt: new Date().toISOString()
      });

      vi.spyOn(db, 'update').mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({})
        })
      } as any);

      vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
        return await cb({
          delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
          insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
          query: {
            playlistEntries: {
              findMany: vi.fn().mockResolvedValue([])
            }
          }
        });
      });

      vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
        id: 10,
        entries: [{ songId: 101, position: 0, song: { id: 101 } }]
      } as any);

      const result = await service.executeSync(10, 'UNION_MERGE');

      expect(result.status).toBe('SUCCESS');
      expect(result.syncState).toBe('SYNCED');
      expect(result.finalSnapshotId).toBe('snap_remote_101');
      expect(mockApiClient.addPlaylistItems).toHaveBeenCalledWith(
        'valid_mock_token',
        'sp_pl_1',
        ['spotify:track:t1']
      );
    });

    it('should set syncState to PARTIAL_FAILURE with failureStage REMOTE if remote API throws', async () => {
      vi.spyOn(service, 'getLinkedPlaylist').mockResolvedValue({
        id: 1,
        playlistId: 10,
        spotifyPlaylistId: 'sp_pl_1',
        spotifyUserId: 'spotify_user_1',
        lastSyncedSnapshotId: 'snap_remote_100',
        lastSyncedEntriesHash: 'hash_baseline_100',
        syncStrategy: 'UNION_MERGE',
        syncState: 'SYNCED'
      });

      vi.spyOn(service, 'generateSyncPlan').mockResolvedValue({
        playlistId: 10,
        spotifyPlaylistId: 'sp_pl_1',
        strategy: 'UNION_MERGE',
        localOperations: [],
        remoteOperations: [{ action: 'ADD', spotifyUri: 'spotify:track:t1', occurrenceId: 't1#0', title: 'Track 1', artists: ['Artist 1'] }],
        unresolvedRemoteOccurrences: [],
        statistics: {
          inSyncOccurrences: 0,
          localAdditionsCount: 0,
          localRemovalsCount: 0,
          remoteAdditionsCount: 1,
          remoteRemovalsCount: 0,
          unresolvedRemoteCount: 0
        },
        plannedAt: new Date().toISOString()
      });

      vi.spyOn(mockApiClient, 'addPlaylistItems').mockRejectedValue(new Error('Spotify HTTP 429'));

      const updateSpy = vi.spyOn(db, 'update').mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({})
        })
      } as any);

      const result = await service.executeSync(10, 'UNION_MERGE');

      expect(result.status).toBe('PARTIAL_FAILURE');
      expect(result.failureStage).toBe('REMOTE');
      expect(result.error).toBe('Spotify HTTP 429');
    });
  });
});
