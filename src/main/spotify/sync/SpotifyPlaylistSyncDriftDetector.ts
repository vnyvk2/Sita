import { createHash } from 'node:crypto';

import type {
  DriftState,
  SpotifyPlaylistLinkDTO,
  SpotifySyncDriftStatus
} from '../api/types';

export interface EntryHashInput {
  position: number;
  songId: number;
  isrc?: string | null;
}

export class SpotifyPlaylistSyncDriftDetector {
  /**
   * Deterministically computes a SHA-256 hash representing the exact ordered sequence of songs
   * and their authoritative identity (ISRC). Immune to cosmetic playlist row updates (name/description/cover).
   */
  public static computeEntriesHash(entries: EntryHashInput[]): string {
    const canonicalPayload = entries.map((entry) => [
      entry.position,
      entry.songId,
      entry.isrc ? entry.isrc.trim().toUpperCase() : null
    ]);

    return createHash('sha256')
      .update(JSON.stringify(canonicalPayload))
      .digest('hex');
  }

  /**
   * Evaluates drift between local Nora playlist state and remote Spotify playlist snapshot.
   * Special-cases PARTIAL_FAILURE into NEEDS_RECOVERY to prevent false conflict classification.
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

    // Invariant: Unfinished partial failures require state reconciliation, not normal drift
    if (link.syncState === 'PARTIAL_FAILURE') {
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
