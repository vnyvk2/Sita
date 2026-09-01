import { createHash } from 'node:crypto';

import type { DriftState, SpotifyPlaylistLinkDTO, SpotifySyncDriftStatus } from '../api/types';

export interface EntryHashInput {
  position: number;
  songId: number;
  isrc?: string | null;
}

export class SpotifyPlaylistSyncDriftDetector {
  /**
   * Deterministically computes a SHA-256 hash representing the exact ordered sequence of songs and
   * their authoritative identity (ISRC). Immune to cosmetic playlist row updates
   * (name/description/cover).
   */
  public static computeEntriesHash(entries: EntryHashInput[]): string {
    const canonicalPayload = entries.map((entry) => [
      entry.position,
      entry.songId,
      entry.isrc ? entry.isrc.trim().toUpperCase() : null
    ]);

    return createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
  }

  /**
   * Evaluates drift between local Nora playlist state and remote Spotify playlist snapshot.
   * Enforces a fail-closed state machine for PARTIAL_FAILURE:
   *
   * - Only FINALIZATION with a non-empty, trustworthy baseline snapshot and hash produces
   *   IN_SYNC_WITH_UNRESOLVED (or standard drift states if modified post-baseline).
   * - All other mutation/verification failure stages (or missing/unknown stages/baselines) fail
   *   closed to NEEDS_RECOVERY.
   */
  public static evaluateDrift(params: {
    playlistId: number;
    spotifyPlaylistId: string;
    link: SpotifyPlaylistLinkDTO;
    currentSnapshotId: string;
    currentEntriesHash: string;
    localEntriesCount: number;
    remoteItemsCount: number;
  }): SpotifySyncDriftStatus {
    const {
      playlistId,
      spotifyPlaylistId,
      link,
      currentSnapshotId,
      currentEntriesHash,
      localEntriesCount,
      remoteItemsCount
    } = params;

    // Invariant: Fail-closed evaluation for PARTIAL_FAILURE
    if (link.syncState === 'PARTIAL_FAILURE') {
      const hasTrustworthyBaseline =
        Boolean(link.lastSyncedSnapshotId && link.lastSyncedSnapshotId.trim()) &&
        Boolean(link.lastSyncedEntriesHash && link.lastSyncedEntriesHash.trim());

      // If failure stage is NOT finalization (e.g. REMOTE, LOCAL, REMOTE_VERIFICATION, LOCAL_VERIFICATION, or missing),
      // or if baseline fields are absent, fail closed to NEEDS_RECOVERY.
      if (link.failureStage !== 'FINALIZATION' || !hasTrustworthyBaseline) {
        return {
          playlistId,
          spotifyPlaylistId,
          driftState: 'NEEDS_RECOVERY',
          localEntriesHash: currentEntriesHash,
          lastSyncedEntriesHash: link.lastSyncedEntriesHash,
          currentSnapshotId,
          lastSyncedSnapshotId: link.lastSyncedSnapshotId,
          localEntriesCount,
          remoteItemsCount,
          syncState: link.syncState,
          lastError: link.lastError
        };
      }

      // FINALIZATION with valid recorded baseline: evaluate post-baseline drift
      const remoteChanged = currentSnapshotId !== link.lastSyncedSnapshotId;
      const localChanged = currentEntriesHash !== link.lastSyncedEntriesHash;

      let driftState: DriftState = 'IN_SYNC_WITH_UNRESOLVED';
      if (remoteChanged && localChanged) {
        driftState = 'CONFLICT_DIVERGED';
      } else if (localChanged) {
        driftState = 'LOCAL_AHEAD';
      } else if (remoteChanged) {
        driftState = 'REMOTE_AHEAD';
      }

      return {
        playlistId,
        spotifyPlaylistId,
        driftState,
        localEntriesHash: currentEntriesHash,
        lastSyncedEntriesHash: link.lastSyncedEntriesHash,
        currentSnapshotId,
        lastSyncedSnapshotId: link.lastSyncedSnapshotId,
        localEntriesCount,
        remoteItemsCount,
        syncState: link.syncState,
        lastError: link.lastError
      };
    }

    // Standard drift evaluation against baseline
    const baselineSnapshot = link.lastSyncedSnapshotId;
    const baselineHash = link.lastSyncedEntriesHash;

    const remoteChanged = Boolean(baselineSnapshot && currentSnapshotId !== baselineSnapshot);
    const localChanged = Boolean(baselineHash && currentEntriesHash !== baselineHash);

    let driftState: DriftState = 'IN_SYNC';

    if (remoteChanged && localChanged) {
      driftState = 'CONFLICT_DIVERGED';
    } else if (localChanged) {
      driftState = 'LOCAL_AHEAD';
    } else if (remoteChanged) {
      driftState = 'REMOTE_AHEAD';
    } else {
      driftState = 'IN_SYNC';
    }

    return {
      playlistId,
      spotifyPlaylistId,
      driftState,
      localEntriesHash: currentEntriesHash,
      lastSyncedEntriesHash: baselineHash,
      currentSnapshotId,
      lastSyncedSnapshotId: baselineSnapshot,
      localEntriesCount,
      remoteItemsCount,
      syncState: link.syncState,
      lastError: link.lastError
    };
  }
}
