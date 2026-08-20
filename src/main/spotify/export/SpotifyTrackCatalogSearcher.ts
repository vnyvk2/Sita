import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import { TrackIdentityMatcher } from '../../metadata/identity/TrackIdentityMatcher';
import { toCanonicalFromSpotifyTrack } from '../../metadata/identity/adapters/SpotifyToCanonicalIdentity';
import { MetadataNormalizer } from '../../metadata/matching/MetadataNormalizer';
import type { SpotifyApiClient } from '../api/SpotifyApiClient';
import type { CatalogResolution, SpotifyTrackInput } from '../api/types';

export class SpotifyTrackCatalogSearcher {
  private readonly apiClient: SpotifyApiClient;

  constructor(apiClient: SpotifyApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Resolves a local CanonicalTrackIdentity to a Spotify catalog track using 3-tier query strategy
   * and evaluating candidates with the pure TrackIdentityMatcher.
   */
  public async resolveTrack(
    accessToken: string,
    track: CanonicalTrackIdentity,
    entryId?: number
  ): Promise<CatalogResolution> {
    const songId = Number(track.id || 0);

    const primaryArtist = track.artists[0]
      ? MetadataNormalizer.normalizeArtist(track.artists[0])
      : '';
    const effectiveTitle = MetadataNormalizer.getEffectiveTitle(track);

    let candidates: SpotifyTrackInput[] = [];
    let searchFailed = false;
    let searchErrorMessage = '';

    // Tier 1: Search by exact ISRC if available
    if (track.isrc) {
      try {
        const isrcResults = await this.apiClient.searchTracks(
          accessToken,
          `isrc:${track.isrc.trim()}`,
          10
        );
        if (isrcResults.length > 0) {
          candidates = isrcResults;
        }
      } catch (err) {
        searchFailed = true;
        searchErrorMessage = (err as Error).message;
      }
    }

    // Tier 2: Field-specific search: track:... artist:...
    if (candidates.length === 0 && !searchFailed && effectiveTitle) {
      try {
        const fieldQuery = primaryArtist
          ? `track:${effectiveTitle} artist:${primaryArtist}`
          : `track:${effectiveTitle}`;

        const fieldResults = await this.apiClient.searchTracks(accessToken, fieldQuery, 10);
        if (fieldResults.length > 0) {
          candidates = fieldResults;
        }
      } catch (err) {
        searchFailed = true;
        searchErrorMessage = (err as Error).message;
      }
    }

    // Tier 3: Broad query fallback
    if (candidates.length === 0 && !searchFailed && effectiveTitle) {
      try {
        const broadQuery = primaryArtist ? `${effectiveTitle} ${primaryArtist}` : effectiveTitle;
        const broadResults = await this.apiClient.searchTracks(accessToken, broadQuery, 10);
        if (broadResults.length > 0) {
          candidates = broadResults;
        }
      } catch (err) {
        searchFailed = true;
        searchErrorMessage = (err as Error).message;
      }
    }

    if (searchFailed) {
      return {
        entryId,
        songId,
        status: 'SEARCH_FAILED',
        diagnostics: ['SEARCH_ERROR', searchErrorMessage]
      };
    }

    if (candidates.length === 0) {
      return {
        entryId,
        songId,
        status: 'NOT_IN_CATALOG',
        diagnostics: ['NO_SEARCH_RESULTS']
      };
    }

    // Score and evaluate all candidates using pure TrackIdentityMatcher
    let bestCandidate: SpotifyTrackInput | null = null;
    let bestMatchResult: ReturnType<typeof TrackIdentityMatcher.scorePair> | null = null;
    let bestHadVariantDisagreement = false;
    let hadVariantConflict = false;

    const sourceVariants = MetadataNormalizer.extractVariants(
      `${track.title} ${track.pathOrUri || ''} ${track.recordingVariant || ''}`
    );

    for (const candidate of candidates) {
      const canonicalCandidate = toCanonicalFromSpotifyTrack(candidate);
      const result = TrackIdentityMatcher.scorePair(track, canonicalCandidate);

      const targetVariants = MetadataNormalizer.extractVariants(
        `${canonicalCandidate.title} ${canonicalCandidate.recordingVariant || ''}`
      );

      let hasVariantDisagreement = false;
      for (const v of sourceVariants) {
        if (!targetVariants.has(v)) hasVariantDisagreement = true;
      }
      for (const v of targetVariants) {
        if (!sourceVariants.has(v)) hasVariantDisagreement = true;
      }

      // Check for variant conflict on non-authoritative candidate
      if (!result.isAuthoritative && result.breakdown.variantPenalty >= 30) {
        hadVariantConflict = true;
      }

      if (result.isMatch) {
        if (!bestMatchResult || result.score > bestMatchResult.score) {
          bestCandidate = candidate;
          bestMatchResult = result;
          bestHadVariantDisagreement = hasVariantDisagreement;
        }
      }
    }

    if (bestCandidate && bestMatchResult) {
      const uri =
        bestCandidate.uri ?? (bestCandidate.id ? `spotify:track:${bestCandidate.id}` : undefined);
      const diagnostics = [
        bestMatchResult.matchType,
        `score_${bestMatchResult.score}`,
        ...bestMatchResult.reasons
      ];

      if (bestMatchResult.isAuthoritative && bestHadVariantDisagreement) {
        diagnostics.push('AUTHORITATIVE_ID_VARIANT_DISAGREEMENT');
      }

      return {
        entryId,
        songId,
        status: 'MATCHED',
        spotifyUri: uri,
        spotifyTrackName: bestCandidate.name,
        spotifyArtistName: bestCandidate.artists?.map((a) => a.name).join(', '),
        matchResult: bestMatchResult,
        diagnostics
      };
    }

    if (hadVariantConflict) {
      return {
        entryId,
        songId,
        status: 'VARIANT_CONFLICT',
        diagnostics: ['VARIANT_CONFLICT', 'Candidate rejected due to recording variant mismatch']
      };
    }

    return {
      entryId,
      songId,
      status: 'NO_CONFIDENT_MATCH',
      diagnostics: ['NO_CONFIDENT_MATCH', 'Candidates found but score fell below match threshold']
    };
  }
}
