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
    spotifyUriMap?: Map<number, string>
  ): PlaylistOccurrence[] {
    const occurrences: PlaylistOccurrence[] = [];
    const countMap = new Map<string, number>();

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const position = i + 1;
      const identityKey = this.getIdentityKey(track);
      const occurrenceIndex = countMap.get(identityKey) ?? 0;
      countMap.set(identityKey, occurrenceIndex + 1);

      const occurrenceId = `${identityKey}#${occurrenceIndex}`;
      const spotifyUri = spotifyUriMap?.get(position) || track.pathOrUri;
      const localSongId = typeof track.id === 'number' ? track.id : undefined;

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
   * Pure deterministic reconciliation planner that computes differential local and remote operations
   * based on the selected sync strategy.
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
    const remoteOccurrences = this.toOccurrences(remoteTracks);

    // Build occurrence lookup maps
    const localOccurrenceMap = new Map<string, PlaylistOccurrence>();
    for (const occ of localOccurrences) {
      localOccurrenceMap.set(occ.occurrenceId, occ);
    }

    const remoteOccurrenceMap = new Map<string, PlaylistOccurrence>();
    for (const occ of remoteOccurrences) {
      remoteOccurrenceMap.set(occ.occurrenceId, occ);
    }

    const localOperations: SpotifySyncLocalOperation[] = [];
    const remoteOperations: SpotifySyncRemoteOperation[] = [];
    const unresolvedRemoteOccurrences: PlaylistOccurrence[] = [];

    let inSyncCount = 0;

    // Evaluate matching and diffs
    if (strategy === 'LOCAL_WINS') {
      // Local Nora state is authoritative: Remote Spotify playlist is mutated to match local exactly
      for (const rOcc of remoteOccurrences) {
        if (!localOccurrenceMap.has(rOcc.occurrenceId)) {
          if (rOcc.spotifyUri) {
            remoteOperations.push({
              action: 'REMOVE',
              spotifyUri: rOcc.spotifyUri,
              position: rOcc.position - 1, // 0-indexed for Spotify API
              occurrenceId: rOcc.occurrenceId,
              title: rOcc.canonicalTrack.title,
              artists: rOcc.canonicalTrack.artists
            });
          }
        } else {
          inSyncCount++;
        }
      }

      for (const lOcc of localOccurrences) {
        if (!remoteOccurrenceMap.has(lOcc.occurrenceId)) {
          if (lOcc.spotifyUri) {
            remoteOperations.push({
              action: 'ADD',
              spotifyUri: lOcc.spotifyUri,
              occurrenceId: lOcc.occurrenceId,
              title: lOcc.canonicalTrack.title,
              artists: lOcc.canonicalTrack.artists
            });
          }
        }
      }
    } else if (strategy === 'REMOTE_WINS') {
      // Remote Spotify playlist is authoritative: Local Nora entries mutated to match resolved remote items
      for (const lOcc of localOccurrences) {
        if (!remoteOccurrenceMap.has(lOcc.occurrenceId)) {
          if (lOcc.localSongId !== undefined) {
            localOperations.push({
              action: 'REMOVE',
              songId: lOcc.localSongId,
              position: lOcc.position,
              occurrenceId: lOcc.occurrenceId,
              title: lOcc.canonicalTrack.title,
              artists: lOcc.canonicalTrack.artists
            });
          }
        } else {
          inSyncCount++;
        }
      }

      for (const rOcc of remoteOccurrences) {
        if (!localOccurrenceMap.has(rOcc.occurrenceId)) {
          const resolvedSongId = remoteToLocalSongMap?.get(rOcc.position) ?? rOcc.localSongId;
          if (resolvedSongId !== undefined) {
            localOperations.push({
              action: 'ADD',
              songId: resolvedSongId,
              occurrenceId: rOcc.occurrenceId,
              title: rOcc.canonicalTrack.title,
              artists: rOcc.canonicalTrack.artists
            });
          } else {
            unresolvedRemoteOccurrences.push(rOcc);
          }
        }
      }
    } else {
      // UNION_MERGE: Add missing occurrences to both sides while preserving local ordering for shared tracks
      for (const lOcc of localOccurrences) {
        if (remoteOccurrenceMap.has(lOcc.occurrenceId)) {
          inSyncCount++;
        } else {
          // Local only: add to remote
          if (lOcc.spotifyUri) {
            remoteOperations.push({
              action: 'ADD',
              spotifyUri: lOcc.spotifyUri,
              occurrenceId: lOcc.occurrenceId,
              title: lOcc.canonicalTrack.title,
              artists: lOcc.canonicalTrack.artists
            });
          }
        }
      }

      for (const rOcc of remoteOccurrences) {
        if (!localOccurrenceMap.has(rOcc.occurrenceId)) {
          // Remote only: add to local if resolved
          const resolvedSongId = remoteToLocalSongMap?.get(rOcc.position) ?? rOcc.localSongId;
          if (resolvedSongId !== undefined) {
            localOperations.push({
              action: 'ADD',
              songId: resolvedSongId,
              occurrenceId: rOcc.occurrenceId,
              title: rOcc.canonicalTrack.title,
              artists: rOcc.canonicalTrack.artists
            });
          } else {
            unresolvedRemoteOccurrences.push(rOcc);
          }
        }
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
      baseSnapshotId,
      baseEntriesHash,
      localOperations,
      remoteOperations,
      unresolvedRemoteOccurrences,
      statistics,
      plannedAt: new Date().toISOString()
    };
  }
}
