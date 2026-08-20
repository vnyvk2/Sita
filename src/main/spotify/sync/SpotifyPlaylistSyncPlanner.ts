import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import { MetadataNormalizer } from '../../metadata/matching/MetadataNormalizer';
import type {
  PlaylistOccurrence,
  SpotifyPlaylistSyncPlan,
  SpotifySyncLocalOperation,
  SpotifySyncRemoteOperation,
  SpotifySyncStatistics,
  SyncStrategy
} from '../api/types';

export class SpotifyPlaylistSyncPlanner {
  /**
   * Derives a stable canonical identity key for a track.
   * Priority: ISRC -> MusicBrainz ID -> Normalized Title + Artist.
   */
  public static getIdentityKey(track: CanonicalTrackIdentity): string {
    if (track.isrc && track.isrc.trim()) {
      return `isrc:${track.isrc.trim().toUpperCase()}`;
    }
    if (track.musicBrainzRecordingId && track.musicBrainzRecordingId.trim()) {
      return `mbid:${track.musicBrainzRecordingId.trim().toLowerCase()}`;
    }
    const cleanTitle = MetadataNormalizer.normalizeTitle(track.title || '');
    const cleanArtist = track.artists[0] ? MetadataNormalizer.normalizeArtist(track.artists[0]) : '';
    return `meta:${cleanTitle}::${cleanArtist}`;
  }

  /**
   * Converts an ordered sequence of tracks into distinct position-aware PlaylistOccurrences.
   * Allows duplicate tracks [A, B, A] to be represented as distinct occurrences (A#0, B#0, A#1).
   */
  public static toOccurrences(
    tracks: CanonicalTrackIdentity[],
    spotifyUriMap?: Map<number, string>,
    localSongMap?: Map<number, number>
  ): PlaylistOccurrence[] {
    const occurrences: PlaylistOccurrence[] = [];
    const countMap = new Map<string, number>();

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const position = i; // 0-indexed position
      const identityKey = this.getIdentityKey(track);
      const occurrenceIndex = countMap.get(identityKey) ?? 0;
      countMap.set(identityKey, occurrenceIndex + 1);

      const occurrenceId = `${identityKey}#${occurrenceIndex}`;
      const spotifyUri = spotifyUriMap?.get(i + 1) || track.pathOrUri;
      const localSongId = localSongMap?.get(i + 1) ?? (typeof track.id === 'number' ? track.id : undefined);

      occurrences.push({
        occurrenceId,
        identityKey,
        occurrenceIndex,
        position,
        canonicalTrack: track,
        spotifyUri,
        localSongId
      });
    }

    return occurrences;
  }

  /**
   * Pure deterministic reconciliation planner that computes authoritative target sequences
   * (localTarget and remoteTarget) along with operations and diagnostics based on the strategy.
   */
  public static planSync(params: {
    playlistId: number;
    spotifyPlaylistId: string;
    strategy: SyncStrategy;
    localTracks: CanonicalTrackIdentity[];
    remoteTracks: CanonicalTrackIdentity[];
    localToSpotifyUriMap?: Map<number, string>;
    remoteToLocalSongMap?: Map<number, number>;
    baseSnapshotId?: string;
    baseEntriesHash?: string;
  }): SpotifyPlaylistSyncPlan {
    const {
      playlistId,
      spotifyPlaylistId,
      strategy,
      localTracks,
      remoteTracks,
      localToSpotifyUriMap,
      remoteToLocalSongMap,
      baseSnapshotId,
      baseEntriesHash
    } = params;

    const localOccurrences = this.toOccurrences(localTracks, localToSpotifyUriMap);
    const remoteOccurrences = this.toOccurrences(remoteTracks, undefined, remoteToLocalSongMap);

    // Build occurrence lookup maps
    const localOccurrenceMap = new Map<string, PlaylistOccurrence>();
    for (const occ of localOccurrences) {
      localOccurrenceMap.set(occ.occurrenceId, occ);
    }

    const remoteOccurrenceMap = new Map<string, PlaylistOccurrence>();
    for (const occ of remoteOccurrences) {
      remoteOccurrenceMap.set(occ.occurrenceId, occ);
    }

    let localTarget: PlaylistOccurrence[] = [];
    let remoteTarget: PlaylistOccurrence[] = [];
    const unresolvedRemoteOccurrences: PlaylistOccurrence[] = [];
    let inSyncCount = 0;

    if (strategy === 'LOCAL_WINS') {
      // Local Nora state is authoritative
      localTarget = localOccurrences.map((occ, idx) => ({ ...occ, position: idx }));
      remoteTarget = localOccurrences
        .filter((occ) => Boolean(occ.spotifyUri))
        .map((occ, idx) => ({
          ...occ,
          position: idx
        }));

      for (const rOcc of remoteOccurrences) {
        if (localOccurrenceMap.has(rOcc.occurrenceId)) {
          inSyncCount++;
        }
      }
    } else if (strategy === 'REMOTE_WINS') {
      // Remote Spotify playlist is authoritative
      remoteTarget = remoteOccurrences.map((occ, idx) => ({ ...occ, position: idx }));

      const resolvedLocal: PlaylistOccurrence[] = [];
      for (let i = 0; i < remoteOccurrences.length; i++) {
        const rOcc = remoteOccurrences[i];
        if (rOcc.localSongId !== undefined) {
          resolvedLocal.push({
            ...rOcc,
            position: resolvedLocal.length
          });
          if (localOccurrenceMap.has(rOcc.occurrenceId)) {
            inSyncCount++;
          }
        } else {
          unresolvedRemoteOccurrences.push(rOcc);
        }
      }
      localTarget = resolvedLocal;
    } else {
      // UNION_MERGE: Deterministic splice merge
      // 1. Start with local occurrences as the ordered base
      const mergedList: PlaylistOccurrence[] = [...localOccurrences];
      const insertedOccurrenceIds = new Set<string>(localOccurrences.map((o) => o.occurrenceId));

      for (const lOcc of localOccurrences) {
        if (remoteOccurrenceMap.has(lOcc.occurrenceId)) {
          inSyncCount++;
        }
      }

      // 2. Splicing remote-only occurrences into mergedList following relative remote ordering
      for (let rIdx = 0; rIdx < remoteOccurrences.length; rIdx++) {
        const rOcc = remoteOccurrences[rIdx];
        if (insertedOccurrenceIds.has(rOcc.occurrenceId)) {
          continue;
        }

        if (rOcc.localSongId === undefined) {
          unresolvedRemoteOccurrences.push(rOcc);
        }

        // Find the immediately preceding occurrence in remoteOccurrences that is already in mergedList
        let insertIndex = -1;
        for (let prevIdx = rIdx - 1; prevIdx >= 0; prevIdx--) {
          const prevOcc = remoteOccurrences[prevIdx];
          const foundIdx = mergedList.findIndex((m) => m.occurrenceId === prevOcc.occurrenceId);
          if (foundIdx !== -1) {
            insertIndex = foundIdx + 1;
            break;
          }
        }

        if (insertIndex !== -1) {
          mergedList.splice(insertIndex, 0, rOcc);
        } else {
          // If no predecessor was shared/inserted, look for successor
          let succIndex = -1;
          for (let nextIdx = rIdx + 1; nextIdx < remoteOccurrences.length; nextIdx++) {
            const nextOcc = remoteOccurrences[nextIdx];
            const foundIdx = mergedList.findIndex((m) => m.occurrenceId === nextOcc.occurrenceId);
            if (foundIdx !== -1) {
              succIndex = foundIdx;
              break;
            }
          }

          if (succIndex !== -1) {
            mergedList.splice(succIndex, 0, rOcc);
          } else {
            mergedList.push(rOcc);
          }
        }

        insertedOccurrenceIds.add(rOcc.occurrenceId);
      }

      // 3. Build localTarget (only resolved tracks) and remoteTarget (only tracks with spotifyUri)
      localTarget = mergedList
        .filter((occ) => occ.localSongId !== undefined)
        .map((occ, idx) => ({ ...occ, position: idx }));

      remoteTarget = mergedList
        .filter((occ) => Boolean(occ.spotifyUri))
        .map((occ, idx) => ({ ...occ, position: idx }));
    }

    // Compute differential operations for diagnostic reporting
    const localOperations: SpotifySyncLocalOperation[] = [];
    const remoteOperations: SpotifySyncRemoteOperation[] = [];

    // Local diffs
    const finalLocalMap = new Map<string, PlaylistOccurrence>();
    for (const occ of localTarget) {
      finalLocalMap.set(occ.occurrenceId, occ);
    }
    for (const lOcc of localOccurrences) {
      if (!finalLocalMap.has(lOcc.occurrenceId) && lOcc.localSongId !== undefined) {
        localOperations.push({
          action: 'REMOVE',
          songId: lOcc.localSongId,
          position: lOcc.position,
          occurrenceId: lOcc.occurrenceId,
          title: lOcc.canonicalTrack.title,
          artists: lOcc.canonicalTrack.artists
        });
      }
    }
    for (const targetOcc of localTarget) {
      if (!localOccurrenceMap.has(targetOcc.occurrenceId) && targetOcc.localSongId !== undefined) {
        localOperations.push({
          action: 'ADD',
          songId: targetOcc.localSongId,
          position: targetOcc.position,
          occurrenceId: targetOcc.occurrenceId,
          title: targetOcc.canonicalTrack.title,
          artists: targetOcc.canonicalTrack.artists
        });
      }
    }

    // Remote diffs
    const finalRemoteMap = new Map<string, PlaylistOccurrence>();
    for (const occ of remoteTarget) {
      finalRemoteMap.set(occ.occurrenceId, occ);
    }
    for (const rOcc of remoteOccurrences) {
      if (!finalRemoteMap.has(rOcc.occurrenceId) && rOcc.spotifyUri) {
        remoteOperations.push({
          action: 'REMOVE',
          spotifyUri: rOcc.spotifyUri,
          position: rOcc.position,
          occurrenceId: rOcc.occurrenceId,
          title: rOcc.canonicalTrack.title,
          artists: rOcc.canonicalTrack.artists
        });
      }
    }
    for (const targetOcc of remoteTarget) {
      if (!remoteOccurrenceMap.has(targetOcc.occurrenceId) && targetOcc.spotifyUri) {
        remoteOperations.push({
          action: 'ADD',
          spotifyUri: targetOcc.spotifyUri,
          position: targetOcc.position,
          occurrenceId: targetOcc.occurrenceId,
          title: targetOcc.canonicalTrack.title,
          artists: targetOcc.canonicalTrack.artists
        });
      }
    }

    const statistics: SpotifySyncStatistics = {
      inSyncOccurrences: inSyncCount,
      localAdditionsCount: localOperations.filter((o) => o.action === 'ADD').length,
      localRemovalsCount: localOperations.filter((o) => o.action === 'REMOVE').length,
      remoteAdditionsCount: remoteOperations.filter((o) => o.action === 'ADD').length,
      remoteRemovalsCount: remoteOperations.filter((o) => o.action === 'REMOVE').length,
      unresolvedRemoteCount: unresolvedRemoteOccurrences.length
    };

    return {
      playlistId,
      spotifyPlaylistId,
      strategy,
      base: {
        localEntriesHash: baseEntriesHash,
        remoteSnapshotId: baseSnapshotId
      },
      baseSnapshotId,
      baseEntriesHash,
      localTarget,
      remoteTarget,
      localOperations,
      remoteOperations,
      unresolvedRemoteOccurrences,
      statistics,
      plannedAt: new Date().toISOString()
    };
  }
}
