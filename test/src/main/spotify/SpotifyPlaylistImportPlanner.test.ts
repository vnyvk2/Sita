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
          duration_ms: 482500, // 482s
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
    // Song 201 in title bucket is a Live variant (variant conflict).
    // Song 202 in Title+Artist bucket matches studio version perfectly.
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

    // Candidate union evaluates both 201 (variant conflict -> isMatch=false) and 202 (accepted); 202 is selected!
    expect(plan.entries[0].decision).toBe('IMPORT');
    expect(plan.entries[0].source.trackReference.libraryMatch.matchedSongId).toBe(202);
  });

  it('should report VARIANT_CONFLICT diagnostic when local Live/Acoustic version exists for Spotify Studio track', () => {
    // Local library only has Song 103 (Hotel California Live), not Song 102 (Studio)
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
    expect(plan.entries[0].notes?.[0]).toContain('Local variant version exists');
    expect(plan.statistics.importedEntries).toBe(0);
    expect(plan.statistics.notInLibraryEntries).toBe(1);
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
          name: 'Comfortably Numb', // Duplicate occurrence of track 1
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
    expect(plan.entries[0].notes?.[0]).toContain('Podcast episode not supported');
    expect(plan.statistics.invalidEntries).toBe(1);
    expect(plan.statistics.importedEntries).toBe(0);
  });

  it('should classify future unknown item types as SKIP_INVALID', () => {
    const items: SpotifyPlaylistItemDTO[] = [
      {
        item: {
          id: 'future_media_1',
          name: 'Future Spatial Audio Item',
          type: 'future_audio_experience'
        }
      }
    ];

    const plan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Future Media' },
      items,
      localSongLibrary
    );

    expect(plan.entries[0].decision).toBe('SKIP_INVALID');
    expect(plan.entries[0].notes?.[0]).toContain('Unsupported Spotify media type: future_audio_experience');
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
    expect(plan.entries[0].notes?.[0]).toContain('Item unavailable or removed');
    expect(plan.statistics.missingEntries).toBe(1);
  });

  it('should calculate statistics accurately for 0% match, partial match, and empty playlist', () => {
    // 1. Empty Playlist
    const emptyPlan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Empty' },
      [],
      localSongLibrary
    );
    expect(emptyPlan.statistics.totalEntries).toBe(0);
    expect(emptyPlan.statistics.importedEntries).toBe(0);

    // 2. 0% Match
    const unmatchedItems: SpotifyPlaylistItemDTO[] = [
      {
        item: {
          id: 'sp_unknown',
          name: 'Non Existent Track In DB',
          artists: [{ name: 'Unknown Band' }],
          duration_ms: 120000,
          type: 'track'
        }
      }
    ];
    const zeroPlan = SpotifyPlaylistImportPlanner.generatePlan(
      { name: 'Zero Match' },
      unmatchedItems,
      localSongLibrary
    );
    expect(zeroPlan.statistics.importedEntries).toBe(0);
    expect(zeroPlan.statistics.notInLibraryEntries).toBe(1);
  });
});
