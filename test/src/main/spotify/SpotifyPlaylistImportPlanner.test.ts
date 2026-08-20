import { describe, expect, it } from 'vitest';
import type { CanonicalTrackIdentity } from '@main/metadata/identity/CanonicalTrackIdentity';
import type { SpotifyPlaylistItemDTO } from '@main/spotify/api/types';
import { SpotifyPlaylistImportPlanner } from '@main/spotify/import/SpotifyPlaylistImportPlanner';

describe('SpotifyPlaylistImportPlanner (Pure Deterministic Engine)', () => {
  const localSongLibrary: CanonicalTrackIdentity[] = [
    {
      id: 101,
      title: 'Comfortably Numb',
      artists: ['Pink Floyd'],
      album: 'The Wall',
      durationSecs: 382,
      isrc: 'GBAYE7900115',
      musicBrainzRecordingId: 'mbid-comfortably-numb',
      pathOrUri: '/music/pink_floyd/comfortably_numb.flac'
    },
    {
      id: 102,
      title: 'Hotel California',
      artists: ['Eagles'],
      album: 'Hotel California',
      durationSecs: 391,
      isrc: 'USPR37600001',
      pathOrUri: '/music/eagles/hotel_california.mp3'
    },
    {
      id: 103,
      title: 'Hotel California (Live)',
      artists: ['Eagles'],
      album: 'Hell Freezes Over',
      durationSecs: 432,
      recordingVariant: 'LIVE',
      pathOrUri: '/music/eagles/hotel_california_live.mp3'
    },
    {
      id: 104,
      title: 'Stairway to Heaven',
      artists: ['Led Zeppelin'],
      album: 'Led Zeppelin IV',
      durationSecs: 482,
      pathOrUri: '/music/led_zeppelin/stairway_to_heaven.flac'
    }
  ];

  it('should match authoritative ISRC track with 100% confidence', () => {
    const items: SpotifyPlaylistItemDTO[] = [
      {
        added_at: '2026-01-01T00:00:00Z',
        item: {
          id: 'sp_101',
          name: 'Comfortably Numb - 2011 Remastered Version',
          artists: [{ name: 'Pink Floyd' }],
          album: { name: 'The Wall (Remastered)' },
          duration_ms: 382000,
          external_ids: { isrc: 'GBAYE7900115' },
          type: 'track'
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { id: 'pl_1', name: 'Classic Rock Favorites' },
      items,
      localSongLibrary
    );

    expect(plan.playlistName).toBe('Classic Rock Favorites');
    expect(plan.entries.length).toBe(1);
    expect(plan.entries[0].decision).toBe('IMPORT');
    expect(plan.entries[0].source.trackReference.libraryMatch.matchedSongId).toBe(101);
    expect(plan.entries[0].source.trackReference.libraryMatch.confidence).toBe(1);
    expect(plan.statistics.importedEntries).toBe(1);
  });

  it('should match high confidence metadata when ISRC is absent (Title + Artist + Duration within 2s)', () => {
    const items: SpotifyPlaylistItemDTO[] = [
      {
        added_at: '2026-01-01T00:00:00Z',
        item: {
          id: 'sp_104',
          name: 'Stairway to Heaven',
          artists: [{ name: 'Led Zeppelin' }],
          album: { name: 'Led Zeppelin IV' },
          duration_ms: 482500,
          type: 'track'
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Rock' },
      items,
      localSongLibrary
    );

    expect(plan.entries[0].decision).toBe('IMPORT');
    expect(plan.entries[0].source.trackReference.libraryMatch.matchedSongId).toBe(104);
    expect(plan.statistics.importedEntries).toBe(1);
  });

  it('should evaluate Candidate Pool Union (ISRC ∪ MBID ∪ Title+Artist ∪ Title) and pick valid match even if title bucket contains variant conflict candidate', () => {
    const customLibrary: CanonicalTrackIdentity[] = [
      {
        id: 201,
        title: 'Sweet Child O Mine (Live in Tokyo)',
        artists: ['Guns N Roses Live Band'],
        recordingVariant: 'LIVE',
        durationSecs: 410,
        pathOrUri: '/music/gnr/live_tokyo.mp3'
      },
      {
        id: 202,
        title: 'Sweet Child O Mine',
        artists: ['Guns N Roses'],
        album: 'Appetite for Destruction',
        recordingVariant: 'STUDIO',
        durationSecs: 356,
        pathOrUri: '/music/gnr/sweet_child.mp3'
      }
    ];

    const items: SpotifyPlaylistItemDTO[] = [
      {
        item: {
          id: 'sp_202',
          name: 'Sweet Child O Mine',
          artists: [{ name: 'Guns N Roses' }],
          duration_ms: 356000,
          recordingVariant: 'STUDIO',
          type: 'track'
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'GNR' },
      items,
      customLibrary
    );

    expect(plan.entries[0].decision).toBe('IMPORT');
    expect(plan.entries[0].source.trackReference.libraryMatch.matchedSongId).toBe(202);
  });

  it('should report VARIANT_CONFLICT diagnostic when local Live/Acoustic version exists for Spotify Studio track', () => {
    const liveOnlyLibrary: CanonicalTrackIdentity[] = [
      {
        id: 103,
        title: 'Hotel California (Live)',
        artists: ['Eagles'],
        recordingVariant: 'LIVE',
        durationSecs: 432,
        pathOrUri: '/music/eagles/live.mp3'
      }
    ];

    const items: SpotifyPlaylistItemDTO[] = [
      {
        item: {
          id: 'sp_studio_hotel',
          name: 'Hotel California',
          artists: [{ name: 'Eagles' }],
          duration_ms: 391000,
          recordingVariant: 'STUDIO',
          type: 'track'
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Eagles' },
      items,
      liveOnlyLibrary
    );

    expect(plan.entries[0].decision).toBe('SKIP_NOT_IN_LIBRARY');
    expect(plan.entries[0].source.trackReference.libraryMatch.status).toBe('NOT_IN_LIBRARY');
    expect(plan.entries[0].source.trackReference.libraryMatch.diagnostics).toContain('VARIANT_CONFLICT');
    expect(plan.statistics.importedEntries).toBe(0);
    expect(plan.statistics.notInLibraryEntries).toBe(1);
  });

  it('should classify local Spotify tracks (is_local: true) as SKIP_INVALID with SPOTIFY_LOCAL_FILE', () => {
    const items: SpotifyPlaylistItemDTO[] = [
      {
        is_local: true,
        item: {
          id: 'sp_local_1',
          name: 'My Custom Bootleg Recording',
          duration_ms: 180000,
          type: 'track',
          is_local: true
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Local Tracks Test' },
      items,
      localSongLibrary
    );

    expect(plan.entries[0].decision).toBe('SKIP_INVALID');
    expect(plan.entries[0].source.trackReference.libraryMatch.status).toBe('INVALID_URI');
    expect(plan.entries[0].source.trackReference.libraryMatch.diagnostics).toContain('SPOTIFY_LOCAL_FILE');
    expect(plan.statistics.invalidEntries).toBe(1);
  });

  it('should strictly preserve sequential source ordering 1..N and duplicate tracks [A, B, A]', () => {
    const items: SpotifyPlaylistItemDTO[] = [
      {
        item: {
          id: 'sp_1',
          name: 'Comfortably Numb',
          artists: [{ name: 'Pink Floyd' }],
          duration_ms: 382000,
          type: 'track'
        }
      },
      {
        item: {
          id: 'sp_2',
          name: 'Hotel California',
          artists: [{ name: 'Eagles' }],
          duration_ms: 391000,
          type: 'track'
        }
      },
      {
        item: {
          id: 'sp_3',
          name: 'Comfortably Numb',
          artists: [{ name: 'Pink Floyd' }],
          duration_ms: 382000,
          type: 'track'
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Multiplicity Test' },
      items,
      localSongLibrary
    );

    expect(plan.entries.length).toBe(3);
    expect(plan.entries[0].source.position).toBe(1);
    expect(plan.entries[0].source.trackReference.libraryMatch.matchedSongId).toBe(101);

    expect(plan.entries[1].source.position).toBe(2);
    expect(plan.entries[1].source.trackReference.libraryMatch.matchedSongId).toBe(102);

    expect(plan.entries[2].source.position).toBe(3);
    expect(plan.entries[2].source.trackReference.libraryMatch.matchedSongId).toBe(101);

    expect(plan.statistics.totalEntries).toBe(3);
    expect(plan.statistics.importedEntries).toBe(3);
  });

  it('should classify podcast episodes as SKIP_INVALID with INVALID_URI status', () => {
    const items: SpotifyPlaylistItemDTO[] = [
      {
        item: {
          id: 'ep_99',
          name: 'The Joe Rogan Experience #2000',
          duration_ms: 7200000,
          type: 'episode'
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Podcasts' },
      items,
      localSongLibrary
    );

    expect(plan.entries[0].decision).toBe('SKIP_INVALID');
    expect(plan.entries[0].source.trackReference.libraryMatch.status).toBe('INVALID_URI');
    expect(plan.statistics.invalidEntries).toBe(1);
  });

  it('should classify null / unavailable items as SKIP_MISSING with MISSING status', () => {
    const items: SpotifyPlaylistItemDTO[] = [
      {
        added_at: '2026-01-01',
        item: null
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Unavailable Item Test' },
      items,
      localSongLibrary
    );

    expect(plan.entries[0].decision).toBe('SKIP_MISSING');
    expect(plan.entries[0].source.trackReference.libraryMatch.status).toBe('MISSING');
    expect(plan.statistics.missingEntries).toBe(1);
  });
});
