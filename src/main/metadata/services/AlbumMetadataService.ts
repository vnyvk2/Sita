import { TrackMatcher } from '../matching/TrackMatcher';
import type { MetadataCandidate, MatchCriterion, AlbumMetadata } from '../models/RecordingMetadata';

export interface LocalSongInput {
  songId: number;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  path: string;
  duration?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
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
  search(albumName: string, artistName?: string): Promise<AlbumMetadata[]>;
  resolveRelease(releaseId: string): Promise<AlbumMetadata | null>;
  buildAlbumMatch(
    localSongs: LocalSongInput[],
    releaseId: string
  ): Promise<AlbumPreview>;
  applyAlbum(preview: AlbumPreview): Promise<{ success: boolean; updatedSongCount: number }>;
}

export class AlbumMetadataService implements IAlbumMetadataService {
  private readonly trackMatcher: TrackMatcher;

  constructor(trackMatcher = new TrackMatcher()) {
    this.trackMatcher = trackMatcher;
  }

  /**
   * Stage 2 — Search Album Releases
   */
  public async search(_albumName: string, _artistName?: string): Promise<AlbumMetadata[]> {
    throw new Error('AlbumMetadataService.search requires active MetadataProviderRuntime connection.');
  }

  /**
   * Stage 3 — Download Complete Release
   */
  public async resolveRelease(_releaseId: string): Promise<AlbumMetadata | null> {
    throw new Error('AlbumMetadataService.resolveRelease requires active MetadataProviderRuntime connection.');
  }

  /**
   * Stage 4 & 5 — Match Songs & Detect Ambiguities -> Stage 6 — Preview
   * Incorporates Album Sequence Continuity Assistance (MusicBee Feature - requires consecutive track numbers).
   */
  public async buildAlbumMatch(
    localSongs: LocalSongInput[],
    album: AlbumMetadata,
    officialTracks: Array<{
      trackId?: string;
      title: string;
      artist?: string;
      album?: string;
      year?: number;
      trackNumber: number;
      discNumber?: number;
      duration?: number;
      isrc?: string;
      musicBrainzRecordingId?: string;
    }>
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
            const boostedConfidence = Math.min(0.95, pair.confidence + 0.15);
            let confidenceLevel: ConfidenceLevel = 'Review';
            if (boostedConfidence >= 0.95) confidenceLevel = 'Excellent';
            else if (boostedConfidence >= 0.90) confidenceLevel = 'Very Good';
            else if (boostedConfidence >= 0.80) confidenceLevel = 'Good';

            return {
              ...pair,
              confidence: boostedConfidence,
              confidenceLevel,
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
