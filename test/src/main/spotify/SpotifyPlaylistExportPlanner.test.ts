import { describe, expect, it } from 'vitest';

import type { CanonicalTrackIdentity } from '../../../../src/main/metadata/identity/CanonicalTrackIdentity';
import type { CatalogResolution } from '../../../../src/main/spotify/api/types';
import { SpotifyPlaylistExportPlanner } from '../../../../src/main/spotify/export/SpotifyPlaylistExportPlanner';

describe('SpotifyPlaylistExportPlanner (Pure Deterministic Engine)', () => {
  it('should strictly preserve sequential source ordering 1..N and duplicate tracks [A, B, A]', () => {
    const tracks: CanonicalTrackIdentity[] = [
      { id: 10, title: 'Song A', artists: ['Artist 1'], durationSecs: 200 },
      { id: 20, title: 'Song B', artists: ['Artist 2'], durationSecs: 180 },
      { id: 10, title: 'Song A', artists: ['Artist 1'], durationSecs: 200 } // Duplicate
    ];

    const resolutions = new Map<number, CatalogResolution>([
      [
        1,
        {
          songId: 10,
          status: 'MATCHED',
          spotifyUri: 'spotify:track:sp_song_a',
          diagnostics: ['ISRC_EXACT']
        }
      ],
      [
        2,
        {
          songId: 20,
          status: 'MATCHED',
          spotifyUri: 'spotify:track:sp_song_b',
          diagnostics: ['METADATA_CONFIDENT']
        }
      ],
      [
        3,
        {
          songId: 10,
          status: 'MATCHED',
          spotifyUri: 'spotify:track:sp_song_a',
          diagnostics: ['ISRC_EXACT']
        }
      ]
    ]);

    const plan = SpotifyPlaylistExportPlanner.generatePlan({
      playlistId: 5,
      playlistName: 'My Awesome Nora Playlist',
      revision: '2026-08-20T10:00:00.000Z',
      tracks,
      resolutions
    });

    expect(plan.entries).toHaveLength(3);
    expect(plan.entries[0].position).toBe(1);
    expect(plan.entries[0].title).toBe('Song A');
    expect(plan.entries[0].decision).toBe('EXPORT');
    expect(plan.entries[0].resolution.spotifyUri).toBe('spotify:track:sp_song_a');

    expect(plan.entries[1].position).toBe(2);
    expect(plan.entries[1].title).toBe('Song B');
    expect(plan.entries[1].decision).toBe('EXPORT');
    expect(plan.entries[1].resolution.spotifyUri).toBe('spotify:track:sp_song_b');

    expect(plan.entries[2].position).toBe(3);
    expect(plan.entries[2].title).toBe('Song A');
    expect(plan.entries[2].decision).toBe('EXPORT');
    expect(plan.entries[2].resolution.spotifyUri).toBe('spotify:track:sp_song_a');

    expect(plan.statistics.totalEntries).toBe(3);
    expect(plan.statistics.exportableEntries).toBe(3);
    expect(plan.statistics.plannedExportPercentage).toBe(100);
  });

  it('should accurately categorize and report mixed resolutions: MATCHED, VARIANT_CONFLICT, SEARCH_FAILED, and NOT_IN_CATALOG', () => {
    const tracks: CanonicalTrackIdentity[] = [
      { id: 1, title: 'Track 1', artists: ['Artist A'], durationSecs: 210 },
      { id: 2, title: 'Track 2 Live', artists: ['Artist B'], durationSecs: 240 },
      { id: 3, title: 'Track 3 Network Error', artists: ['Artist C'], durationSecs: 190 },
      { id: 4, title: 'Track 4 Rare Local Track', artists: ['Artist D'], durationSecs: 300 }
    ];

    const resolutions = new Map<number, CatalogResolution>([
      [
        1,
        {
          songId: 1,
          status: 'MATCHED',
          spotifyUri: 'spotify:track:sp_track_1',
          diagnostics: ['METADATA_CONFIDENT']
        }
      ],
      [
        2,
        {
          songId: 2,
          status: 'VARIANT_CONFLICT',
          diagnostics: ['VARIANT_CONFLICT']
        }
      ],
      [
        3,
        {
          songId: 3,
          status: 'SEARCH_FAILED',
          diagnostics: ['SEARCH_ERROR', '429 Rate limited']
        }
      ],
      [
        4,
        {
          songId: 4,
          status: 'NOT_IN_CATALOG',
          diagnostics: ['NO_SEARCH_RESULTS']
        }
      ]
    ]);

    const plan = SpotifyPlaylistExportPlanner.generatePlan({
      playlistId: 42,
      playlistName: 'Mixed Test Playlist',
      revision: '2026-08-20T11:00:00.000Z',
      tracks,
      resolutions
    });

    expect(plan.entries[0].decision).toBe('EXPORT');
    expect(plan.entries[1].decision).toBe('SKIP_VARIANT_CONFLICT');
    expect(plan.entries[2].decision).toBe('SKIP_SEARCH_FAILED');
    expect(plan.entries[3].decision).toBe('SKIP_NOT_IN_CATALOG');

    expect(plan.statistics.totalEntries).toBe(4);
    expect(plan.statistics.exportableEntries).toBe(1);
    expect(plan.statistics.variantConflictEntries).toBe(1);
    expect(plan.statistics.searchFailedEntries).toBe(1);
    expect(plan.statistics.unmatchedEntries).toBe(1);
    expect(plan.statistics.plannedExportPercentage).toBe(25);
  });

  it('should handle empty tracks list safely', () => {
    const plan = SpotifyPlaylistExportPlanner.generatePlan({
      playlistId: 99,
      playlistName: 'Empty Playlist',
      revision: '2026-08-20T12:00:00.000Z',
      tracks: [],
      resolutions: new Map()
    });

    expect(plan.entries).toHaveLength(0);
    expect(plan.statistics.totalEntries).toBe(0);
    expect(plan.statistics.exportableEntries).toBe(0);
    expect(plan.statistics.plannedExportPercentage).toBe(0);
  });
});
