import { toCanonicalFromSpotifyTrack } from '../../metadata/identity/adapters/SpotifyToCanonicalIdentity';
import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import {
  HARD_VARIANT_CONFLICT_PENALTY,
  TrackIdentityMatcher
} from '../../metadata/identity/TrackIdentityMatcher';
import { MetadataNormalizer } from '../../metadata/matching/MetadataNormalizer';
import type { ImportStatistics } from '../../playlistImport/models/ImportStatistics';
import type { LibraryMatch } from '../../playlistImport/models/LibraryMatch';
import type { LibraryResolvedPlaylistEntry } from '../../playlistImport/models/LibraryResolvedPlaylistEntry';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { PlaylistImportPlanEntry } from '../../playlistImport/models/PlaylistImportPlanEntry';
import type { ResolvedTrackReference } from '../../playlistImport/models/ResolvedTrackReference';
import { type SpotifyPlaylistItemDTO, unwrapSpotifyTrack } from '../api/types';

export interface RemotePlaylistMetadata {
  id?: string;
  name: string;
  description?: string | null;
  imageUrl?: string;
}

export class SpotifyPlaylistImportPlanner {
  /**
   * Pure, deterministic planner that evaluates Spotify playlist items against local canonical songs
   * and produces a standard Nora PlaylistImportPlan with full item accounting, exact ordering, and
   * duplicate preservation.
   */
  public static generatePlan(
    remoteMetadata: RemotePlaylistMetadata,
    items: SpotifyPlaylistItemDTO[],
    localSongs: CanonicalTrackIdentity[]
  ): PlaylistImportPlan {
    // 1. Pre-index local library songs across 4 candidate buckets (ISRC ∪ MBID ∪ Title+Artist ∪ Title)
    const isrcMap = new Map<string, CanonicalTrackIdentity[]>();
    const mbidMap = new Map<string, CanonicalTrackIdentity[]>();
    const titleArtistMap = new Map<string, CanonicalTrackIdentity[]>();
    const titleMap = new Map<string, CanonicalTrackIdentity[]>();

    for (const song of localSongs) {
      if (song.isrc && song.isrc.trim()) {
        const key = song.isrc.trim().toUpperCase();
        const existing = isrcMap.get(key) ?? [];
        existing.push(song);
        isrcMap.set(key, existing);
      }

      if (song.musicBrainzRecordingId && song.musicBrainzRecordingId.trim()) {
        const key = song.musicBrainzRecordingId.trim().toLowerCase();
        const existing = mbidMap.get(key) ?? [];
        existing.push(song);
        mbidMap.set(key, existing);
      }

      const titlesToIndex = new Set<string>();
      const effectiveTitle = MetadataNormalizer.getEffectiveTitle(song);
      if (effectiveTitle) titlesToIndex.add(effectiveTitle);
      const rawNormTitle = MetadataNormalizer.normalizeTitle(song.title);
      if (rawNormTitle) titlesToIndex.add(rawNormTitle);

      const primaryArtist = song.artists[0]
        ? MetadataNormalizer.normalizeArtist(song.artists[0])
        : '';

      for (const normTitle of titlesToIndex) {
        if (primaryArtist) {
          const taKey = `${normTitle}::${primaryArtist}`;
          const existing = titleArtistMap.get(taKey) ?? [];
          existing.push(song);
          titleArtistMap.set(taKey, existing);
        }

        const existing = titleMap.get(normTitle) ?? [];
        existing.push(song);
        titleMap.set(normTitle, existing);
      }
    }

    const entries: PlaylistImportPlanEntry[] = [];
    let importedCount = 0;
    let notInLibraryCount = 0;
    let missingCount = 0;
    let invalidCount = 0;
    let repairedCount = 0;

    // 2. Process every playlist item in exact sequence preserving position 1..N
    for (let i = 0; i < items.length; i++) {
      const position = i + 1;
      const playlistItem = items[i];
      const rawItem = playlistItem?.item;

      // Case B: Item is marked as a local Spotify file (is_local: true)
      if (playlistItem?.is_local || (rawItem as any)?.is_local) {
        invalidCount++;
        const trackTitle = (rawItem as { name?: string })?.name || 'Local File';
        const libraryMatch: LibraryMatch = {
          status: 'INVALID_URI',
          confidence: 0,
          diagnostics: ['SPOTIFY_LOCAL_FILE']
        };

        const resolvedTrack: ResolvedTrackReference = {
          track: {
            originalLocation: '',
            title: trackTitle,
            duration: (rawItem as { duration_ms?: number })?.duration_ms
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
          dateAdded: playlistItem?.added_at ? new Date(playlistItem.added_at) : undefined
        };

        entries.push({
          source,
          decision: 'SKIP_INVALID',
          notes: ['Local Spotify track (not in Spotify global catalogue)']
        });
        continue;
      }

      const spotifyTrack = unwrapSpotifyTrack(playlistItem);

      // Case A: Item is null, deleted, or missing from Spotify payload
      if (!spotifyTrack) {
        // Check if item is a podcast episode or non-track media
        const itemType = (rawItem as { type?: string })?.type;
        if (itemType && itemType !== 'track') {
          invalidCount++;
          const itemName = (rawItem as { name?: string })?.name || 'Unknown Media';
          const itemDuration = (rawItem as { duration_ms?: number })?.duration_ms
            ? Math.round((rawItem as { duration_ms?: number }).duration_ms! / 1000)
            : 0;

          const libraryMatch: LibraryMatch = {
            status: 'INVALID_URI',
            confidence: 0,
            diagnostics: [
              itemType === 'episode'
                ? 'PODCAST_EPISODE'
                : `UNSUPPORTED_TYPE_${itemType.toUpperCase()}`
            ]
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
            dateAdded: playlistItem?.added_at ? new Date(playlistItem.added_at) : undefined
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

      // Case C: Explicit non-track media type inside track object
      if (spotifyTrack.type && spotifyTrack.type !== 'track') {
        invalidCount++;
        const itemName = spotifyTrack.name || 'Unknown Media';
        const itemDuration = spotifyTrack.duration_ms
          ? Math.round(spotifyTrack.duration_ms / 1000)
          : 0;

        const libraryMatch: LibraryMatch = {
          status: 'INVALID_URI',
          confidence: 0,
          diagnostics: [
            spotifyTrack.type === 'episode'
              ? 'PODCAST_EPISODE'
              : `UNSUPPORTED_TYPE_${spotifyTrack.type.toUpperCase()}`
          ]
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
          dateAdded: playlistItem?.added_at ? new Date(playlistItem.added_at) : undefined
        };

        const note =
          spotifyTrack.type === 'episode'
            ? 'Podcast episode not supported in music playlist'
            : `Unsupported Spotify media type: ${spotifyTrack.type}`;

        entries.push({
          source,
          decision: 'SKIP_INVALID',
          notes: [note]
        });
        continue;
      }

      // Case D: Standard Music Track
      const canonicalSpotify = toCanonicalFromSpotifyTrack(spotifyTrack);

      // Candidate Pool Union: ISRC ∪ MBID ∪ Title+Artist ∪ Title
      const candidateSet = new Set<CanonicalTrackIdentity>();

      if (canonicalSpotify.isrc && canonicalSpotify.isrc.trim()) {
        const isrcList = isrcMap.get(canonicalSpotify.isrc.trim().toUpperCase());
        if (isrcList) isrcList.forEach((c) => candidateSet.add(c));
      }

      if (
        canonicalSpotify.musicBrainzRecordingId &&
        canonicalSpotify.musicBrainzRecordingId.trim()
      ) {
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
      let bestMatchResult: ReturnType<typeof TrackIdentityMatcher.scorePair> | null = null;
      let bestCandidate: CanonicalTrackIdentity | null = null;
      let hadVariantConflict = false;

      for (const candidate of candidateSet) {
        const matchResult = TrackIdentityMatcher.scorePair(candidate, canonicalSpotify);
        if (matchResult.isMatch) {
          if (!bestMatchResult || matchResult.score > bestMatchResult.score) {
            bestMatchResult = matchResult;
            bestCandidate = candidate;
          }
        }

        // Check if candidate matched artist+title identity but suffered hard variant conflict penalty >= 30
        const candNormTitle = MetadataNormalizer.getEffectiveTitle(candidate);
        const candArtist = candidate.artists[0]
          ? MetadataNormalizer.normalizeArtist(candidate.artists[0])
          : '';
        const isTitleArtistCompatible =
          effectiveSpotifyTitle === candNormTitle &&
          (!primaryArtist || !candArtist || primaryArtist === candArtist);

        if (
          isTitleArtistCompatible &&
          matchResult.breakdown.variantPenalty >= HARD_VARIANT_CONFLICT_PENALTY
        ) {
          hadVariantConflict = true;
        }
      }

      if (bestMatchResult && bestCandidate) {
        const isExactMatch = bestMatchResult.isAuthoritative || bestMatchResult.score >= 0.95;
        if (!isExactMatch) {
          repairedCount++;
        }
        importedCount++;

        const libraryMatch: LibraryMatch = {
          status: 'MATCHED',
          confidence: bestMatchResult.confidence,
          matchedSongId: typeof bestCandidate.id === 'number' ? bestCandidate.id : undefined,
          matchType: bestMatchResult.matchType,
          diagnostics: bestMatchResult.reasons
        };

        const resolvedTrack: ResolvedTrackReference = {
          track: {
            originalLocation: bestCandidate.pathOrUri || '',
            title: bestCandidate.title,
            artist: bestCandidate.artists.join(', '),
            album: bestCandidate.album,
            duration: bestCandidate.durationSecs ?? 0
          },
          resolution: {
            originalReference:
              canonicalSpotify.pathOrUri || `spotify:track:${spotifyTrack.id || ''}`,
            resolvedPath: bestCandidate.pathOrUri,
            resolutionStatus: 'RESOLVED',
            verificationStatus: 'FOUND'
          }
        };

        const source: LibraryResolvedPlaylistEntry = {
          position,
          trackReference: { resolvedTrack, libraryMatch },
          dateAdded: playlistItem?.added_at ? new Date(playlistItem.added_at) : undefined
        };

        entries.push({
          source,
          decision: 'IMPORT',
          notes: [
            isExactMatch
              ? `Matched via ${bestMatchResult.matchType}`
              : `Repaired match (${Math.round(bestMatchResult.score * 100)}% confidence)`
          ]
        });
      } else {
        notInLibraryCount++;
        const libraryMatch: LibraryMatch = {
          status: 'NOT_IN_LIBRARY',
          confidence: 0,
          diagnostics: hadVariantConflict ? ['VARIANT_CONFLICT'] : ['NO_ACCEPTABLE_CANDIDATE_FOUND']
        };

        const resolvedTrack: ResolvedTrackReference = {
          track: {
            originalLocation: '',
            title: canonicalSpotify.title,
            artist: canonicalSpotify.artists.join(', '),
            album: canonicalSpotify.album,
            duration: canonicalSpotify.durationSecs ?? 0
          },
          resolution: {
            originalReference:
              canonicalSpotify.pathOrUri || `spotify:track:${spotifyTrack.id || ''}`,
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
          decision: 'SKIP_NOT_IN_LIBRARY',
          notes: [
            hadVariantConflict
              ? 'Variant conflict detected: only Live/Acoustic version exists locally'
              : 'Track not found in local library'
          ]
        });
      }
    }

    const statistics: ImportStatistics = {
      totalEntries: items.length,
      importedEntries: importedCount,
      repairedEntries: repairedCount,
      skippedEntries: notInLibraryCount + missingCount + invalidCount,
      missingEntries: missingCount,
      notInLibraryEntries: notInLibraryCount,
      invalidEntries: invalidCount,
      warningCount: repairedCount + invalidCount + missingCount,
      plannedImportPercentage:
        items.length > 0 ? Math.round((importedCount / items.length) * 100) : 0
    };

    return {
      playlistName: remoteMetadata.name,
      description: remoteMetadata.description || undefined,
      sourceFormat: 'spotify',
      entries,
      statistics,
      warnings: [],
      createdByImporter: 'SpotifyPlaylistImportPlanner'
    };
  }
}
