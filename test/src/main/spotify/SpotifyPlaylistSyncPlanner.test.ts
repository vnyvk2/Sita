import { describe, expect, it } from 'vitest';

import type { CanonicalTrackIdentity } from '../../../../src/main/metadata/identity/CanonicalTrackIdentity';
import { SpotifyPlaylistSyncPlanner } from '../../../../src/main/spotify/sync/SpotifyPlaylistSyncPlanner';

describe('SpotifyPlaylistSyncPlanner', () => {
  const trackA: CanonicalTrackIdentity = {
    id: 1,
    title: 'Track A',
    artists: ['Artist 1'],
    isrc: 'ISRC_A',
    pathOrUri: 'spotify:track:A'
  };

  const trackB: CanonicalTrackIdentity = {
    id: 2,
    title: 'Track B',
    artists: ['Artist 2'],
    isrc: 'ISRC_B',
    pathOrUri: 'spotify:track:B'
  };

  const trackC: CanonicalTrackIdentity = {
    id: 3,
    title: 'Track C',
    artists: ['Artist 3'],
    isrc: 'ISRC_C',
    pathOrUri: 'spotify:track:C'
  };

  const trackD: CanonicalTrackIdentity = {
    id: 4,
    title: 'Track D',
    artists: ['Artist 4'],
    isrc: 'ISRC_D',
    pathOrUri: 'spotify:track:D'
  };

  const trackE: CanonicalTrackIdentity = {
    title: 'Track E (Remote Only)',
    artists: ['Artist 5'],
    isrc: 'ISRC_E',
    pathOrUri: 'spotify:track:E'
  };

  describe('Duplicate Multiplicity & Occurrence Alignment', () => {
    it('should distinguish multiple occurrences of the same track [A, B, A] as distinct occurrences', () => {
      const tracks = [trackA, trackB, trackA];
      const occurrences = SpotifyPlaylistSyncPlanner.toOccurrences(tracks);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].occurrenceId).toBe('isrc:ISRC_A#0');
      expect(occurrences[1].occurrenceId).toBe('isrc:ISRC_B#0');
      expect(occurrences[2].occurrenceId).toBe('isrc:ISRC_A#1');
      expect(occurrences[2].position).toBe(2);
    });

    it('should detect when remote is missing a second duplicate occurrence of a track', () => {
      // Local: [A, B, A], Remote: [A, B]
      const localTracks = [trackA, trackB, trackA];
      const remoteTracks = [trackA, trackB];

      const plan = SpotifyPlaylistSyncPlanner.planSync({
        playlistId: 10,
        spotifyPlaylistId: 'sp_10',
        strategy: 'UNION_MERGE',
        localTracks,
        remoteTracks
      });

      expect(plan.statistics.inSyncOccurrences).toBe(2);
      expect(plan.remoteTarget).toHaveLength(3);
      expect(plan.remoteTarget.map((o) => o.occurrenceId)).toEqual([
        'isrc:ISRC_A#0',
        'isrc:ISRC_B#0',
        'isrc:ISRC_A#1'
      ]);
    });
  });

  describe('UNION_MERGE Strategy (Deterministic Ordering)', () => {
    it('should preserve local order for shared tracks and insert remote additions in remote relative order', () => {
      // Base/Local: [A, B, C, D]
      // Remote: [A, C, E]
      // Result: Local target contains [A, B, C, D, E] (resolved E inserted after C); Remote target contains [A, B, C, D, E]
      const localTracks = [trackA, trackB, trackC, trackD];
      const remoteTracks = [trackA, trackC, trackE];

      const remoteToLocalMap = new Map<number, number>([[3, 5]]); // Track E resolved to local songId 5

      const plan = SpotifyPlaylistSyncPlanner.planSync({
        playlistId: 10,
        spotifyPlaylistId: 'sp_10',
        strategy: 'UNION_MERGE',
        localTracks,
        remoteTracks,
        remoteToLocalSongMap: remoteToLocalMap
      });

      expect(plan.statistics.inSyncOccurrences).toBe(2); // A#0, C#0
      expect(plan.localTarget).toHaveLength(5);
      expect(plan.remoteTarget).toHaveLength(5);
      expect(plan.localTarget.map((o) => o.occurrenceId)).toEqual([
        'isrc:ISRC_A#0',
        'isrc:ISRC_B#0',
        'isrc:ISRC_C#0',
        'isrc:ISRC_E#0',
        'isrc:ISRC_D#0'
      ]);
    });

    it('should isolate unresolved remote tracks without generating invalid local DB insertions', () => {
      const localTracks = [trackA];
      const remoteTracks = [trackA, trackE];

      // Track E is NOT mapped in remoteToLocalSongMap
      const plan = SpotifyPlaylistSyncPlanner.planSync({
        playlistId: 10,
        spotifyPlaylistId: 'sp_10',
        strategy: 'UNION_MERGE',
        localTracks,
        remoteTracks
      });

      expect(plan.localTarget).toHaveLength(1); // Only track A
      expect(plan.unresolvedRemoteOccurrences).toHaveLength(1);
      expect(plan.unresolvedRemoteOccurrences[0].occurrenceId).toBe('isrc:ISRC_E#0');
      expect(plan.statistics.unresolvedRemoteCount).toBe(1);
    });
  });

  describe('LOCAL_WINS Strategy', () => {
    it('should overwrite remote Spotify playlist to match Nora local state exactly', () => {
      // Local: [A, B], Remote: [A, C]
      const localTracks = [trackA, trackB];
      const remoteTracks = [trackA, trackC];

      const plan = SpotifyPlaylistSyncPlanner.planSync({
        playlistId: 10,
        spotifyPlaylistId: 'sp_10',
        strategy: 'LOCAL_WINS',
        localTracks,
        remoteTracks
      });

      expect(plan.localTarget).toHaveLength(2);
      expect(plan.remoteTarget).toHaveLength(2);
      expect(plan.remoteTarget.map((o) => o.occurrenceId)).toEqual([
        'isrc:ISRC_A#0',
        'isrc:ISRC_B#0'
      ]);
    });
  });

  describe('REMOTE_WINS Strategy', () => {
    it('should mutate local Nora playlist to match remote Spotify tracks', () => {
      // Local: [A, B], Remote: [A, C]
      const localTracks = [trackA, trackB];
      const remoteTracks = [trackA, trackC];
      const remoteToLocalMap = new Map<number, number>([[2, 3]]); // Track C -> songId 3

      const plan = SpotifyPlaylistSyncPlanner.planSync({
        playlistId: 10,
        spotifyPlaylistId: 'sp_10',
        strategy: 'REMOTE_WINS',
        localTracks,
        remoteTracks,
        remoteToLocalSongMap: remoteToLocalMap
      });

      expect(plan.remoteTarget).toHaveLength(2);
      expect(plan.localTarget).toHaveLength(2);
      expect(plan.localTarget.map((o) => o.occurrenceId)).toEqual([
        'isrc:ISRC_A#0',
        'isrc:ISRC_C#0'
      ]);
    });
  });
});
