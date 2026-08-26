import type { MetadataSearchOptions } from '../../../common/metadata/api';
import { TrackMatcher } from '../matching/TrackMatcher';
import type { MetadataCandidate, MatchCriterion, AlbumMetadata, ResolvedAlbumRelease, OfficialTrackInput, MetadataProviderId } from '../models/RecordingMetadata';
import type { MetadataProviderRuntime } from '../runtime/MetadataProviderRuntime';

export interface LocalSongInput {
  songId: number;
  title: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  year?: number;
  path: string;
  duration?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
  genre?: string;
  trackNumber?: number;
  discNumber?: number;
}

export interface ScoreBreakdown {
  title: number;
  artist: number;
  album?: number;
  year?: number;
  duration: number;
  mbid: number;
  total: number;
}

export type ConfidenceLevel = 'Excellent' | 'Very Good' | 'Good' | 'Review' | 'Poor';

/**
 * Pure helper function returning presentation-agnostic confidence level.
 */
export const getConfidenceLevel = (confidence: number): ConfidenceLevel => {
  if (confidence >= 0.95) return 'Excellent';
  if (confidence >= 0.90) return 'Very Good';
  if (confidence >= 0.80) return 'Good';
  if (confidence >= 0.70) return 'Review';
  return 'Poor';
};

export interface TrackMatchPair {
  localSong: LocalSongInput;
  remoteTrack: MetadataCandidate;
  confidence: number; // 0.0 to 1.0
  confidenceLevel?: ConfidenceLevel;
  scoreBreakdown?: ScoreBreakdown;
  why?: string;
  matchedBy: MatchCriterion[];
  reasons: string[];
}

export interface AlbumPreview {
  album: AlbumMetadata;
  trackList: TrackMatchPair[];
  warnings: string[];
  confidence: number;
  changesCount: number;
}

export interface IAlbumMetadataService {
  search(albumName: string, artistName?: string, options?: MetadataSearchOptions): Promise<AlbumMetadata[]>;
  resolveRelease(releaseId: string, providerId?: MetadataProviderId): Promise<ResolvedAlbumRelease | null>;
  buildAlbumMatch(
    localSongs: LocalSongInput[],
    album: AlbumMetadata,
    officialTracks: OfficialTrackInput[]
  ): Promise<AlbumPreview>;
  applyAlbum(preview: AlbumPreview): Promise<{ success: boolean; updatedSongCount: number }>;
}

export class AlbumMetadataService implements IAlbumMetadataService {
  private readonly trackMatcher: TrackMatcher;
  private readonly runtime?: MetadataProviderRuntime;

  constructor(runtime?: MetadataProviderRuntime, trackMatcher = new TrackMatcher()) {
    this.runtime = runtime;
    this.trackMatcher = trackMatcher;
  }

  /**
   * Stage 2 — Search Album Releases via MetadataProviderRuntime
   */
  public async search(albumName: string, artistName?: string, options?: MetadataSearchOptions): Promise<AlbumMetadata[]> {
    if (!this.runtime) {
      throw new Error('AlbumMetadataService.search requires active MetadataProviderRuntime instance.');
    }
    return this.runtime.searchAlbums(albumName, artistName, options);
  }

  public async searchAlbums(albumName: string, artistName?: string, options?: MetadataSearchOptions): Promise<AlbumMetadata[]> {
    return this.search(albumName, artistName, options);
  }

  /**
   * Stage 3 — Download Complete Release via MetadataProviderRuntime
   */
  public async resolveRelease(releaseId: string, providerId?: MetadataProviderId): Promise<ResolvedAlbumRelease | null> {
    if (!this.runtime) {
      throw new Error('AlbumMetadataService.resolveRelease requires active MetadataProviderRuntime instance.');
    }
    return this.runtime.resolveRelease(releaseId, providerId);
  }

  /**
   * Stage 4 & 5 — Match Songs & Detect Ambiguities -> Stage 6 — Preview
   * Incorporates Album Sequence Continuity Assistance (MusicBee Feature - requires consecutive track numbers).
   */
  public async buildAlbumMatch(
    localSongs: LocalSongInput[],
    album: AlbumMetadata,
    officialTracks: OfficialTrackInput[]
  ): Promise<AlbumPreview> {
    // Run 1-to-1 TrackMatcher assignment
    let trackList = this.trackMatcher.matchTracks(localSongs, album.releaseId ?? '', officialTracks, {
      albumTitle: album.title,
      discCount: album.discCount,
      trackCount: album.trackCount,
      releaseType: album.releaseType,
      year: album.year
    });

    // Album Sequence Continuity Assistance (MusicBee Feature - requires consecutive track numbers and track matching)
    const highConfidenceCount = trackList.filter((t) => t.confidence >= 0.90).length;
    const isHighAlbumAgreement = trackList.length > 0 && highConfidenceCount / trackList.length >= 0.65;

    if (isHighAlbumAgreement && trackList.length >= 3) {
      trackList = trackList.map((pair, idx) => {
        if (pair.confidence < 0.90 && idx > 0 && idx < trackList.length - 1) {
          const prevPair = trackList[idx - 1];
          const nextPair = trackList[idx + 1];
          const prevTrackNo = prevPair.remoteTrack.recording.trackNumber ?? 0;
          const currentTrackNo = pair.remoteTrack.recording.trackNumber ?? 0;
          const nextTrackNo = nextPair.remoteTrack.recording.trackNumber ?? 0;

          // Strict consecutive track number check: Track N-1, Track N, Track N+1
          if (
            prevPair.confidence >= 0.90 &&
            nextPair.confidence >= 0.90 &&
            prevTrackNo + 1 === currentTrackNo &&
            currentTrackNo + 1 === nextTrackNo
          ) {
            // Sequence continuity can increase confidence but must never override poor evidence or trigger auto-apply (capped at 0.89)
            const boostedConfidence = Math.min(0.89, pair.confidence + 0.15);
            return {
              ...pair,
              confidence: boostedConfidence,
              confidenceLevel: getConfidenceLevel(boostedConfidence),
              reasons: [...pair.reasons, 'album_sequence_continuity_boost']
            };
          }
        }
        return pair;
      });
    }

    const warnings: string[] = [];
    let totalConfidence = 0;

    for (const pair of trackList) {
      totalConfidence += pair.confidence;
      if (pair.reasons.includes('duplicate_local_candidate')) {
        warnings.push(`Duplicate local track title/artist detected for "${pair.localSong.title}". Manual verification recommended.`);
      }
      if (pair.confidence < 0.75) {
        warnings.push(`Low confidence match (${Math.round(pair.confidence * 100)}%) for local song "${pair.localSong.title}". Manual review required.`);
      } else if (pair.confidence < 0.90) {
        warnings.push(`Uncertain match (${Math.round(pair.confidence * 100)}%) for local song "${pair.localSong.title}". Confirmation recommended.`);
      }
    }

    const overallConfidence = trackList.length > 0 ? totalConfidence / trackList.length : 0;

    return {
      album,
      trackList,
      warnings,
      confidence: overallConfidence,
      changesCount: trackList.length
    };
  }

  /**
   * Stage 7 — Apply & Stage 8 — Verify
   * Strict Confidence Threshold: Auto-apply ONLY if confidence >= 0.90
   */
  public async applyAlbum(preview: AlbumPreview): Promise<{ success: boolean; updatedSongCount: number }> {
    if (!preview.trackList || preview.trackList.length === 0) {
      return { success: false, updatedSongCount: 0 };
    }

    let updatedCount = 0;
    for (const pair of preview.trackList) {
      if (pair.confidence >= 0.90) {
        updatedCount++;
      }
    }

    return {
      success: true,
      updatedSongCount: updatedCount
    };
  }
}
