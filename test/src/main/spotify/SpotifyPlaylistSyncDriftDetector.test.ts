import { describe, expect, it } from 'vitest';

import type { SpotifyPlaylistLinkDTO } from '../../../../src/main/spotify/api/types';
import { SpotifyPlaylistSyncDriftDetector } from '../../../../src/main/spotify/sync/SpotifyPlaylistSyncDriftDetector';

describe('SpotifyPlaylistSyncDriftDetector', () => {
  const createMockLink = (overrides?: Partial<SpotifyPlaylistLinkDTO>): SpotifyPlaylistLinkDTO => ({
    id: 1,
    playlistId: 42,
    spotifyPlaylistId: 'sp_pl_123',
    spotifyPlaylistName: 'Test Playlist',
    spotifyUserId: 'user_xyz',
    lastSyncedSnapshotId: 'snap_base_100',
    lastSyncedEntriesHash: 'hash_base_100',
    syncStrategy: 'UNION_MERGE',
    syncState: 'SYNCED',
    ...overrides
  });

  describe('computeEntriesHash', () => {
    it('should compute deterministic hash for ordered sequence of tracks', () => {
      const entries1 = [
        { position: 1, songId: 101, isrc: 'USRC17607839' },
        { position: 2, songId: 102, isrc: 'GBAYE0601498' }
      ];
      const entries2 = [
        { position: 1, songId: 101, isrc: 'USRC17607839' },
        { position: 2, songId: 102, isrc: 'GBAYE0601498' }
      ];

      const hash1 = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(entries1);
      const hash2 = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(entries2);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for reordered sequences or duplicates', () => {
      const seqA = [
        { position: 1, songId: 101, isrc: 'ISRC_A' },
        { position: 2, songId: 102, isrc: 'ISRC_B' },
        { position: 3, songId: 101, isrc: 'ISRC_A' }
      ];
      const seqB = [
        { position: 1, songId: 102, isrc: 'ISRC_B' },
        { position: 2, songId: 101, isrc: 'ISRC_A' },
        { position: 3, songId: 101, isrc: 'ISRC_A' }
      ];

      const hashA = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(seqA);
      const hashB = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(seqB);

      expect(hashA).not.toBe(hashB);
    });

    it('should normalize isrc casing and handle null isrc safely', () => {
      const entries1 = [{ position: 1, songId: 101, isrc: 'usrc17607839' }];
      const entries2 = [{ position: 1, songId: 101, isrc: 'USRC17607839' }];
      const entries3 = [{ position: 1, songId: 101, isrc: null }];

      expect(SpotifyPlaylistSyncDriftDetector.computeEntriesHash(entries1)).toBe(
        SpotifyPlaylistSyncDriftDetector.computeEntriesHash(entries2)
      );
      expect(SpotifyPlaylistSyncDriftDetector.computeEntriesHash(entries1)).not.toBe(
        SpotifyPlaylistSyncDriftDetector.computeEntriesHash(entries3)
      );
    });
  });

  describe('evaluateDrift (Standard Lifecycle States)', () => {
    it('should classify as IN_SYNC when neither remote snapshot nor local hash changed', () => {
      const link = createMockLink();
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('IN_SYNC');
    });

    it('should classify as LOCAL_AHEAD when only local entries hash changed', () => {
      const link = createMockLink();
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_new_200',
        localEntriesCount: 6,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('LOCAL_AHEAD');
    });

    it('should classify as REMOTE_AHEAD when only remote snapshot ID changed', () => {
      const link = createMockLink();
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_new_200',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 7
      });

      expect(status.driftState).toBe('REMOTE_AHEAD');
    });

    it('should classify as CONFLICT_DIVERGED when both remote snapshot and local entries changed', () => {
      const link = createMockLink();
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_new_200',
        currentEntriesHash: 'hash_new_200',
        localEntriesCount: 6,
        remoteItemsCount: 7
      });

      expect(status.driftState).toBe('CONFLICT_DIVERGED');
    });
  });

  describe('evaluateDrift (PARTIAL_FAILURE Exhaustive Matrix & Fail-Closed Invariants)', () => {
    it('1. FINALIZATION with trustworthy baseline and unchanged state -> IN_SYNC_WITH_UNRESOLVED', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'FINALIZATION',
        lastSyncedSnapshotId: 'snap_base_100',
        lastSyncedEntriesHash: 'hash_base_100',
        lastError: 'Sync incomplete: 2 remote tracks could not be resolved'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 7
      });

      expect(status.driftState).toBe('IN_SYNC_WITH_UNRESOLVED');
      expect(status.lastError).toContain('2 remote tracks');
    });

    it('2. FINALIZATION with trustworthy baseline and local changed -> LOCAL_AHEAD', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'FINALIZATION',
        lastSyncedSnapshotId: 'snap_base_100',
        lastSyncedEntriesHash: 'hash_base_100'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_mutated_local',
        localEntriesCount: 6,
        remoteItemsCount: 7
      });

      expect(status.driftState).toBe('LOCAL_AHEAD');
    });

    it('3. FINALIZATION with trustworthy baseline and remote changed -> REMOTE_AHEAD', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'FINALIZATION',
        lastSyncedSnapshotId: 'snap_base_100',
        lastSyncedEntriesHash: 'hash_base_100'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_mutated_remote',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 8
      });

      expect(status.driftState).toBe('REMOTE_AHEAD');
    });

    it('4. FINALIZATION with trustworthy baseline and both changed -> CONFLICT_DIVERGED', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'FINALIZATION',
        lastSyncedSnapshotId: 'snap_base_100',
        lastSyncedEntriesHash: 'hash_base_100'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_mutated_remote',
        currentEntriesHash: 'hash_mutated_local',
        localEntriesCount: 6,
        remoteItemsCount: 8
      });

      expect(status.driftState).toBe('CONFLICT_DIVERGED');
    });

    it('5. FINALIZATION with missing snapshotId -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'FINALIZATION',
        lastSyncedSnapshotId: undefined,
        lastSyncedEntriesHash: 'hash_base_100'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_curr_100',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });

    it('6. FINALIZATION with missing entriesHash -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'FINALIZATION',
        lastSyncedSnapshotId: 'snap_base_100',
        lastSyncedEntriesHash: undefined
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_curr_100',
        localEntriesCount: 5,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });

    it('7. REMOTE failure stage -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'REMOTE',
        lastError: 'Spotify HTTP 429'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_new_200',
        currentEntriesHash: 'hash_new_200',
        localEntriesCount: 6,
        remoteItemsCount: 7
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });

    it('8. REMOTE_VERIFICATION failure stage -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'REMOTE_VERIFICATION',
        lastError: 'Snapshot mismatch post-write'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_new_200',
        currentEntriesHash: 'hash_new_200',
        localEntriesCount: 6,
        remoteItemsCount: 7
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });

    it('9. LOCAL failure stage -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'LOCAL',
        lastError: 'Transaction aborted'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });

    it('10. LOCAL_VERIFICATION failure stage -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'LOCAL_VERIFICATION',
        lastError: 'Entry count mismatch'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });

    it('11. Missing/null failureStage in PARTIAL_FAILURE -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: undefined,
        lastError: 'Unknown failure'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });

    it('12. Unknown/corrupted runtime failureStage (e.g. SOMETHING_UNKNOWN) -> fails closed to NEEDS_RECOVERY', () => {
      const link = createMockLink({
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'SOMETHING_UNKNOWN' as any,
        lastError: 'Corrupted failure stage'
      });
      const status = SpotifyPlaylistSyncDriftDetector.evaluateDrift({
        playlistId: 42,
        spotifyPlaylistId: 'sp_pl_123',
        link,
        currentSnapshotId: 'snap_base_100',
        currentEntriesHash: 'hash_base_100',
        localEntriesCount: 5,
        remoteItemsCount: 5
      });

      expect(status.driftState).toBe('NEEDS_RECOVERY');
    });
  });
});
