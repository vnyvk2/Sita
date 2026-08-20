import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import { TrackIdentityMatcher } from '../../metadata/identity/TrackIdentityMatcher';
import { toCanonicalFromSpotifyTrack } from '../../metadata/identity/adapters/SpotifyToCanonicalIdentity';
import { MetadataNormalizer } from '../../metadata/matching/MetadataNormalizer';
import type { ImportDecision } from '../../playlistImport/models/ImportDecision';
import type { ImportStatistics } from '../../playlistImport/models/ImportStatistics';
import type { LibraryMatch } from '../../playlistImport/models/LibraryMatch';
import type { LibraryResolvedPlaylistEntry } from '../../playlistImport/models/LibraryResolvedPlaylistEntry';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { PlaylistImportPlanEntry } from '../../playlistImport/models/PlaylistImportPlanEntry';
import type { ResolvedTrackReference } from '../../playlistImport/models/ResolvedTrackReference';
import type { SpotifyPlaylistItemDTO, SpotifyTrackInput } from '../api/types';

export interface RemotePlaylistMetadata {
  id?: string;
  name: string;
  description?: string | null;
  imageUrl?: string;
}

export class SpotifyPlaylistImportPlanner {
  /**
   * Pure, deterministic planner that evaluates Spotify playlist items against local canonical songs
   * and produces a standard Nora PlaylistImportPlan with full item accounting, exact ordering, and duplicate preservation.
   */
  public static generatePlan(
    remoteMetadata: RemotePlaylistMetadata,
    items: SpotifyPlaylistItemDTO[],
    localSongs: CanonicalTrackIdentity[]
  ): PlaylistImportPlan {
    // 1. Pre-index local library songs for candidate bucket retrieval
    const isrcMap = new Map<string, CanonicalTrackIdentity[]>();
    const mbidMap = new Map<string, CanonicalTrackIdentity[]>();
    const titleArtistMap = new Map<string, CanonicalTrackIdentity[]>();
    const titleMap = new Map<string, CanonicalTrackIdentity[]>();

    for (const song of localSongs) {
      if (song.isrc) {
        const key = song.isrc.trim().toUpperCase();
        const existing = isrcMap.get(key) ?? [];
        existing.push(song);
        isrcMap.set(key, existing);
      }

      if (song.musicBrainzRecordingId) {
        const key = song.musicBrainzRecordingId.trim().toLowerCase();
        const existing = mbidMap.get(key) ?? [];
        existing.push(song);
        mbidMap.set(key, existing);
      }

      const primaryArtist = song.artists[0]
        ? MetadataNormalizer.normalizeArtist(song.artists[0])
        : '';

      // Index both raw metadata title and effective filename title (for useless title fallback)
      const titlesToIndex = new Set<string>();
      const effectiveTitle = MetadataNormalizer.getEffectiveTitle(song);
      if (effectiveTitle) titlesToIndex.add(effectiveTitle);

      const rawNormTitle = MetadataNormalizer.normalizeTitle(song.title);
      if (rawNormTitle) titlesToIndex.add(rawNormTitle);

      for (const normTitle of titlesToIndex) {
        if (primaryArtist) {
          const key = `${normTitle}::${primaryArtist}`;
          const existing = titleArtistMap.get(key) ?? [];
          existing.push(song);
          titleArtistMap.set(key, existing);
        }

        const existing = titleMap.get(normTitle) ?? [];
        existing.push(song);
        titleMap.set(normTitle, existing);
      }
    }

    const entries: PlaylistImportPlanEntry[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let missingCount = 0;
    let invalidCount = 0;
    let repairedCount = 0;

    // 2. Process every playlist item in exact sequence preserving position 1..N
    for (let i = 0; i < items.length; i++) {
      const position = i + 1;
      const playlistItem = items[i];
      const rawItem = playlistItem?.item;

      // Case A: Item is null, deleted, or regionally unavailable on Spotify
      if (!rawItem) {
        missingCount++;
        const libraryMatch: LibraryMatch = {
          status: 'MISSING',
          confidence: 0,
          diagnostics: ['UNAVAILABLE_ON_SPOTIFY']
        };

        const resolvedTrack: ResolvedTrackReference = {
          track: {
            originalLocation: '',
            title: 'Unavailable Track',
            duration: 0
          },
          resolution: {
            originalReference: '',
            resolutionStatus: 'UNRESOLVED',
            verificationStatus: 'MISSING'
          }
        };

        const source: LibraryResolvedPlaylistEntry = {
          position,
          trackReference: { resolvedTrack, libraryMatch },
          dateAdded: playlistItem?.added_at ? new Date(playlistItem.added_at) : undefined
        };

        entries.push({
          source,
          decision: 'SKIP_MISSING',
          notes: ['Item unavailable or removed on Spotify']
        });
        continue;
      }

      // Case B: Item is a local Spotify file (is_local: true)
      if (playlistItem.is_local || (rawItem as SpotifyTrackInput).is_local) {
        invalidCount++;
        const trackTitle = (rawItem as { name?: string }).name || 'Local File';
        const libraryMatch: LibraryMatch = {
          status: 'INVALID_URI',
          confidence: 0,
          diagnostics: ['SPOTIFY_LOCAL_FILE']
        };

        const resolvedTrack: ResolvedTrackReference = {
          track: {
            originalLocation: '',
            title: trackTitle,
            duration: (rawItem as { duration_ms?: number }).duration_ms
              ? Math.round((rawItem as { duration_ms?: number }).duration_ms! / 1000)
              : 0
          },
          resolution: {
            originalReference: '',
            resolutionStatus: 'UNRESOLVED',
            verificationStatus: 'MISSING'
          }
        };

        const source: LibraryResolvedPlaylistEntry = {
          position,
          trackReference: { resolvedTrack, libraryMatch },
          dateAdded: playlistItem.added_at ? new Date(playlistItem.added_at) : undefined
        };

        entries.push({
          source,
          decision: 'SKIP_INVALID',
          notes: ['Local Spotify track (not in Spotify global catalogue)']
        });
        continue;
      }

      // Case C: Item is an episode or unknown non-track media type
      const itemType = (rawItem as { type?: string }).type;
      if (itemType && itemType !== 'track') {
        invalidCount++;
        const itemName = (rawItem as { name?: string }).name || 'Unknown Media';
        const itemDuration = (rawItem as { duration_ms?: number }).duration_ms
          ? Math.round((rawItem as { duration_ms?: number }).duration_ms! / 1000)
          : 0;

        const libraryMatch: LibraryMatch = {
          status: 'INVALID_URI',
          confidence: 0,
          diagnostics: [itemType === 'episode' ? 'PODCAST_EPISODE' : `UNSUPPORTED_TYPE_${itemType.toUpperCase()}`]
        };

        const resolvedTrack: ResolvedTrackReference = {
          track: {
            originalLocation: '',
            title: itemName,
            duration: itemDuration
          },
          resolution: {
            originalReference: '',
            resolutionStatus: 'UNRESOLVED',
            verificationStatus: 'MISSING'
          }
        };

        const source: LibraryResolvedPlaylistEntry = {
          position,
          trackReference: { resolvedTrack, libraryMatch },
          dateAdded: playlistItem.added_at ? new Date(playlistItem.added_at) : undefined
        };

        const note =
          itemType === 'episode'
            ? 'Podcast episode not supported in music playlist'
            : `Unsupported Spotify media type: ${itemType}`;

        entries.push({
          source,
          decision: 'SKIP_INVALID',
          notes: [note]
        });
        continue;
      }

      // Case D: Standard Music Track
      const spotifyTrack = rawItem as SpotifyTrackInput;
      const canonicalSpotify = toCanonicalFromSpotifyTrack(spotifyTrack);

      // Candidate Pool Union: ISRC ∪ MBID ∪ Title+Artist ∪ Title
      const candidateSet = new Set<CanonicalTrackIdentity>();

      if (canonicalSpotify.isrc) {
        const isrcList = isrcMap.get(canonicalSpotify.isrc.trim().toUpperCase());
        if (isrcList) isrcList.forEach((c) => candidateSet.add(c));
      }

      if (canonicalSpotify.musicBrainzRecordingId) {
        const mbidList = mbidMap.get(canonicalSpotify.musicBrainzRecordingId.trim().toLowerCase());
        if (mbidList) mbidList.forEach((c) => candidateSet.add(c));
      }

      const primaryArtist = canonicalSpotify.artists[0]
        ? MetadataNormalizer.normalizeArtist(canonicalSpotify.artists[0])
        : '';

      const spotifyTitlesToQuery = new Set<string>();
      const effectiveSpotifyTitle = MetadataNormalizer.getEffectiveTitle(canonicalSpotify);
      if (effectiveSpotifyTitle) spotifyTitlesToQuery.add(effectiveSpotifyTitle);
      const rawNormSpotifyTitle = MetadataNormalizer.normalizeTitle(canonicalSpotify.title);
      if (rawNormSpotifyTitle) spotifyTitlesToQuery.add(rawNormSpotifyTitle);

      for (const normTitle of spotifyTitlesToQuery) {
        if (primaryArtist) {
          const taList = titleArtistMap.get(`${normTitle}::${primaryArtist}`);
          if (taList) taList.forEach((c) => candidateSet.add(c));
        }

        const tList = titleMap.get(normTitle);
        if (tList) tList.forEach((c) => candidateSet.add(c));
      }

      // Score all candidates in the union using pure TrackIdentityMatcher
      let bestCandidate: CanonicalTrackIdentity | null = null;
      let bestMatchResult: ReturnType<typeof TrackIdentityMatcher.scorePair> | null = null;
      let hadVariantConflict = false;

      for (const candidate of candidateSet) {
        const result = TrackIdentityMatcher.scorePair(canonicalSpotify, candidate);

        // Precise variant conflict check: candidate matched artist+title identity but had variant penalty >= 30
        const candNormTitle = MetadataNormalizer.getEffectiveTitle(candidate);
        const candArtist = candidate.artists[0] ? MetadataNormalizer.normalizeArtist(candidate.artists[0]) : '';
        const isTitleArtistCompatible =
          effectiveSpotifyTitle === candNormTitle &&
          (!primaryArtist || !candArtist || primaryArtist === candArtist);

        if (isTitleArtistCompatible && result.breakdown.variantPenalty >= 30) {
          hadVariantConflict = true;
        }

        if (result.isMatch) {
          if (!bestMatchResult || result.score > bestMatchResult.score) {
            bestCandidate = candidate;
            bestMatchResult = result;
          }
        }
      }

      const resolvedTrack: ResolvedTrackReference = {
        track: {
          originalLocation: canonicalSpotify.pathOrUri || '',
          title: canonicalSpotify.title,
          artist: canonicalSpotify.artists.join(', '),
          duration: canonicalSpotify.durationSecs || 0
        },
        resolution: {
          originalReference: canonicalSpotify.pathOrUri || '',
          resolutionStatus: bestCandidate ? 'RESOLVED' : 'UNRESOLVED',
          verificationStatus: bestCandidate ? 'FOUND' : 'MISSING',
          resolvedPath: bestCandidate?.pathOrUri
        }
      };

      if (bestCandidate && bestMatchResult && bestCandidate.id !== undefined) {
        matchedCount++;
        if (!bestMatchResult.isAuthoritative) {
          repairedCount++;
        }

        const songId = Number(bestCandidate.id);
        const libraryMatch: LibraryMatch = {
          matchedSongId: songId,
          status: 'MATCHED',
          matchType: bestMatchResult.matchType,
          confidence: bestMatchResult.confidence,
          diagnostics: [
            bestMatchResult.matchType,
            `score_${bestMatchResult.score}`,
            ...bestMatchResult.reasons
          ]
        };

        const source: LibraryResolvedPlaylistEntry = {
          position,
          trackReference: { resolvedTrack, libraryMatch },
          dateAdded: playlistItem.added_at ? new Date(playlistItem.added_at) : undefined
        };

        const decision: ImportDecision = 'IMPORT';
        entries.push({
          source,
          decision,
          notes: [`Matched local track (${bestMatchResult.matchType}) with score ${bestMatchResult.score}`]
        });
      } else {
        unmatchedCount++;
        const diagnostics: string[] = hadVariantConflict ? ['VARIANT_CONFLICT'] : ['NO_MATCH'];
        const note = hadVariantConflict
          ? 'Local variant version exists (e.g. Live/Acoustic), but conflicts with Spotify Studio version'
          : 'Not found in local library';

        const libraryMatch: LibraryMatch = {
          status: 'NOT_IN_LIBRARY',
          confidence: 0,
          diagnostics
        };

        const source: LibraryResolvedPlaylistEntry = {
          position,
          trackReference: { resolvedTrack, libraryMatch },
          dateAdded: playlistItem.added_at ? new Date(playlistItem.added_at) : undefined
        };

        const decision: ImportDecision = 'SKIP_NOT_IN_LIBRARY';
        entries.push({
          source,
          decision,
          notes: [note]
        });
      }
    }

    const statistics: ImportStatistics = {
      totalEntries: items.length,
      importedEntries: matchedCount,
      repairedEntries: repairedCount,
      skippedEntries: unmatchedCount + missingCount + invalidCount,
      missingEntries: missingCount,
      notInLibraryEntries: unmatchedCount,
      invalidEntries: invalidCount,
      warningCount: 0,
      plannedImportPercentage: items.length > 0 ? Math.round((matchedCount / items.length) * 100) : 0
    };

    return {
      playlistName: remoteMetadata.name,
      description: remoteMetadata.description || undefined,
      entries,
      statistics,
      warnings: [],
      sourceFormat: 'spotify',
      createdByImporter: 'spotify'
    };
  }
}
