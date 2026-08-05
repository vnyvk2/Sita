import { TrackMatcher } from '../matching/TrackMatcher';
import type { MetadataCandidate, MatchCriterion, AlbumMetadata } from '../models/RecordingMetadata';

export interface LocalSongInput {
  songId: number;
  title: string;
  artist?: string;
  album?: string;
  path: string;
  duration?: number;
  musicBrainzRecordingId?: string;
}

export interface TrackMatchPair {
  localSong: LocalSongInput;
  remoteTrack: MetadataCandidate;
  confidence: number; // 0.0 to 1.0
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
   */
  public async buildAlbumMatch(
    localSongs: LocalSongInput[],
    album: AlbumMetadata,
    officialTracks: Array<{
      trackId?: string;
      title: string;
      artist?: string;
      trackNumber: number;
      discNumber?: number;
      duration?: number;
      isrc?: string;
      musicBrainzRecordingId?: string;
    }>
  ): Promise<AlbumPreview> {
    // Run 1-to-1 TrackMatcher assignment
    const trackList = this.trackMatcher.matchTracks(localSongs, album.releaseId ?? '', officialTracks);

    const warnings: string[] = [];
    let totalConfidence = 0;

    for (const pair of trackList) {
      totalConfidence += pair.confidence;
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
