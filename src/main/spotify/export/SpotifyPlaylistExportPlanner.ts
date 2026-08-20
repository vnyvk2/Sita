import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import type {
  CatalogResolution,
  ExportDecision,
  SpotifyExportPlanEntry,
  SpotifyExportStatistics,
  SpotifyPlaylistExportPlan
} from '../api/types';

export interface ExportPlanGenerationParams {
  playlistId: number;
  playlistName: string;
  description?: string;
  revision: string;
  tracks: CanonicalTrackIdentity[];
  resolutions: Map<number, CatalogResolution>;
}

export class SpotifyPlaylistExportPlanner {
  /**
   * Pure deterministic planner that maps local playlist tracks and their catalog resolutions
   * into a SpotifyPlaylistExportPlan with exact ordering 1..N and duplicate preservation.
   * Free of network/database dependencies.
   */
  public static generatePlan(params: ExportPlanGenerationParams): SpotifyPlaylistExportPlan {
    const { playlistId, playlistName, description, revision, tracks, resolutions } = params;

    const entries: SpotifyExportPlanEntry[] = [];
    let exportableCount = 0;
    let unmatchedCount = 0;
    let variantConflictCount = 0;
    let searchFailedCount = 0;

    for (let i = 0; i < tracks.length; i++) {
      const position = i + 1;
      const track = tracks[i];
      const songId = Number(track.id || 0);

      // Lookup resolution by position index or fallback to songId
      const resolution: CatalogResolution = resolutions.get(position) ??
        resolutions.get(songId) ?? {
          songId,
          status: 'NOT_IN_CATALOG',
          diagnostics: ['UNRESOLVED']
        };

      let decision: ExportDecision = 'SKIP_NOT_IN_CATALOG';
      const notes: string[] = [];

      switch (resolution.status) {
        case 'MATCHED':
          decision = 'EXPORT';
          exportableCount++;
          if (resolution.matchResult) {
            notes.push(
              `Matched Spotify track (${resolution.matchResult.matchType}) with score ${resolution.matchResult.score}`
            );
          } else {
            notes.push('Matched Spotify track');
          }
          break;

        case 'VARIANT_CONFLICT':
          decision = 'SKIP_VARIANT_CONFLICT';
          variantConflictCount++;
          notes.push('Skipped due to recording variant mismatch (e.g. Live vs Studio)');
          break;

        case 'SEARCH_FAILED':
          decision = 'SKIP_SEARCH_FAILED';
          searchFailedCount++;
          notes.push('Spotify catalog search temporarily failed for this track');
          break;

        case 'NOT_IN_CATALOG':
        case 'NO_CONFIDENT_MATCH':
        default:
          decision = 'SKIP_NOT_IN_CATALOG';
          unmatchedCount++;
          notes.push('Track not found in Spotify global catalog');
          break;
      }

      entries.push({
        position,
        songId,
        title: track.title,
        artists: track.artists,
        durationSecs: track.durationSecs || 0,
        decision,
        resolution,
        notes
      });
    }

    const totalEntries = tracks.length;
    const statistics: SpotifyExportStatistics = {
      totalEntries,
      exportableEntries: exportableCount,
      unmatchedEntries: unmatchedCount,
      variantConflictEntries: variantConflictCount,
      searchFailedEntries: searchFailedCount,
      plannedExportPercentage: totalEntries > 0 ? Math.round((exportableCount / totalEntries) * 100) : 0
    };

    return {
      playlistId,
      playlistName,
      description: description || undefined,
      revision,
      entries,
      statistics,
      sourceFormat: 'nora',
      targetProvider: 'spotify'
    };
  }
}
