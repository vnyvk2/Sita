import type { MetadataProviderId } from './provider';

export interface ArtworkMetadata {
  primaryPath?: string;
  optimizedPath?: string;
  onlineUrls?: string[];
  palette?: Record<string, string>;
}

export interface AutoTagSongInput {
  songId: number;
  path?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  isrc?: string;
  musicBrainzRecordingId?: string;
}

export type LocalSongInput = AutoTagSongInput;

export interface OfficialTrackInput {
  trackId?: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  duration?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
  providerRecordingId?: string;
  genres?: string[];
}

export interface RankingScoreBreakdown {
  baseScore: number;
  artistScore: number;
  titleScore: number;
  statusScore: number;
  primaryTypeScore: number;
  secondaryTypePenalty: number;
  trackCountBonus: number;
  editionBoost: number;
}

export type MatchQualityBandName = 'Definitive' | 'Probable' | 'Weak';

export interface AlbumMetadata {
  title: string;
  artist: string;
  year?: number;
  genre?: string;
  label?: string;
  releaseType?: string;
  artwork?: ArtworkMetadata;
  discCount?: number;
  trackCount?: number;
  releaseId?: string;
  releaseGroupId?: string;
  provider?: MetadataProviderId;
  /** Raw additive ranking score computed by MetadataSearchRankingEngine (heuristic range: ~-55 to 227). */
  rankingScore?: number;
  /** Per-component breakdown of rankingScore, when the search runtime provides it. */
  rankingBreakdown?: RankingScoreBreakdown;
  /** Intrinsic quality band derived from the ranked score (Definitive / Probable / Weak). */
  qualityBand?: MatchQualityBandName;
}

export interface ResolvedAlbumRelease {
  album: AlbumMetadata;
  tracks: OfficialTrackInput[];
  provider: MetadataProviderId;
  providerReleaseId: string;
  releaseGroupId?: string;
}

export interface CanonicalReleaseContext {
  mbid?: string;
  releaseId?: string;
  releaseGroupId?: string;
  title: string;
  artist?: string;
  year?: number;
  trackCount?: number;
  trackTitles?: string[];
  externalIds?: Record<string, string>;
}
