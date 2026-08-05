import type { MatchCriterion, MetadataCandidate, RecordingMetadata } from '../models/RecordingMetadata';
import type { TrackMatchPair, ScoreBreakdown } from '../services/AlbumMetadataService';
import { MetadataNormalizer, type RecordingVariant } from './MetadataNormalizer';

export interface LocalSongInput {
  songId: number;
  title: string;
  artist?: string;
  album?: string;
  path: string;
  duration?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
}

export interface OfficialTrackInput {
  trackId?: string;
  title: string;
  artist?: string;
  trackNumber: number;
  discNumber?: number;
  duration?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
}

export interface ReleaseContext {
  albumTitle?: string;
  discCount?: number;
  trackCount?: number;
  releaseType?: string;
}

export const MIN_MATCH_SCORE = 50;

export class TrackMatcher {
  private static readonly VARIANT_PENALTY_TABLE: Record<RecordingVariant, number> = {
    live: 30,
    acoustic: 25,
    remix: 40,
    demo: 35,
    instrumental: 45,
    mono: 10,
    stereo: 10,
    'radio edit': 15,
    'extended mix': 20,
    unplugged: 25,
    session: 20,
    orchestral: 25,
    'piano version': 25
  };

  /**
   * Matches an array of local songs against official release tracks.
   * Enforces strict ONE-TO-ONE candidate assignment with MIN_MATCH_SCORE threshold (50 pts).
   * Incorporates symmetric variant mismatch penalties, gradual duration decay, ISRC priority (100 pts),
   * deterministic tie-breaking, and MetadataNormalizer.
   */
  public matchTracks(
    localSongs: LocalSongInput[],
    releaseId: string,
    officialTracks: OfficialTrackInput[],
    _releaseContext?: ReleaseContext
  ): TrackMatchPair[] {
    interface PairScore {
      localSong: LocalSongInput;
      track: OfficialTrackInput;
      score: number;
      breakdown: ScoreBreakdown;
      matchedBy: MatchCriterion[];
      reasons: string[];
    }

    const allPairs: PairScore[] = [];

    for (const song of localSongs) {
      for (const track of officialTracks) {
        const { score, breakdown, matchedBy, reasons } = this.scorePair(song, track);
        allPairs.push({ localSong: song, track, score, breakdown, matchedBy, reasons });
      }
    }

    // Deterministic tie-breaking sort
    allPairs.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.breakdown.title !== a.breakdown.title) return b.breakdown.title - a.breakdown.title;
      if (b.breakdown.artist !== a.breakdown.artist) return b.breakdown.artist - a.breakdown.artist;
      if (b.breakdown.duration !== a.breakdown.duration) return b.breakdown.duration - a.breakdown.duration;
      return a.track.trackNumber - b.track.trackNumber;
    });

    const claimedSongIds = new Set<number>();
    const claimedTrackIds = new Set<string | number>();
    const assignedPairs: TrackMatchPair[] = [];

    for (const pair of allPairs) {
      if (pair.score < MIN_MATCH_SCORE) {
        continue;
      }

      const trackKey = pair.track.trackId ?? pair.track.trackNumber;
      if (claimedSongIds.has(pair.localSong.songId) || claimedTrackIds.has(trackKey)) {
        continue;
      }

      claimedSongIds.add(pair.localSong.songId);
      claimedTrackIds.add(trackKey);

      const normalizedScore = Math.min(1.0, Math.max(0.0, pair.score / 100));

      const recording: RecordingMetadata = {
        title: pair.track.title,
        artist: pair.track.artist ?? pair.localSong.artist,
        trackNumber: pair.track.trackNumber,
        discNumber: pair.track.discNumber,
        duration: pair.track.duration
      };

      const candidate: MetadataCandidate = {
        recording,
        provider: {
          provider: 'musicbrainz',
          providerRecordingId: pair.track.musicBrainzRecordingId ?? pair.track.trackId,
          providerReleaseId: releaseId,
          isrc: pair.track.isrc ?? pair.localSong.isrc,
          confidence: normalizedScore,
          matchedBy: pair.matchedBy,
          reasons: pair.reasons
        }
      };

      assignedPairs.push({
        localSong: pair.localSong,
        remoteTrack: candidate,
        confidence: normalizedScore,
        scoreBreakdown: pair.breakdown,
        matchedBy: pair.matchedBy,
        reasons: pair.reasons
      });
    }

    // Sort assigned pairs sequentially by official track number for album sequence ordering
    assignedPairs.sort((a, b) => {
      const trackA = a.remoteTrack.recording.trackNumber ?? 0;
      const trackB = b.remoteTrack.recording.trackNumber ?? 0;
      return trackA - trackB;
    });

    return assignedPairs;
  }

  public scorePair(
    song: LocalSongInput,
    track: OfficialTrackInput
  ): { score: number; breakdown: ScoreBreakdown; matchedBy: MatchCriterion[]; reasons: string[] } {
    let titleScore = 0;
    let artistScore = 0;
    let durationScore = 0;
    let mbidScore = 0;
    const matchedBy: MatchCriterion[] = [];
    const reasons: string[] = [];

    // Priority 1: MBID exact match (100 points - perfect)
    if (
      song.musicBrainzRecordingId &&
      track.musicBrainzRecordingId &&
      song.musicBrainzRecordingId === track.musicBrainzRecordingId
    ) {
      return {
        score: 100,
        breakdown: { title: 0, artist: 0, duration: 0, mbid: 100, total: 100 },
        matchedBy: ['title', 'artist', 'duration'],
        reasons: ['mbid_exact_match']
      };
    }

    // Priority 2: ISRC exact match (100 points - official recording identifier)
    if (song.isrc && track.isrc && song.isrc.trim().toUpperCase() === track.isrc.trim().toUpperCase()) {
      return {
        score: 100,
        breakdown: { title: 0, artist: 0, duration: 0, mbid: 100, total: 100 },
        matchedBy: ['title', 'artist'],
        reasons: ['isrc_exact_match']
      };
    }

    const normSongTitle = song.title ? MetadataNormalizer.normalizeTitle(song.title) : MetadataNormalizer.normalizeFilename(song.path);
    const normTrackTitle = MetadataNormalizer.normalizeTitle(track.title);

    // Symmetric Variant Penalty Calculation
    const songVariants = MetadataNormalizer.extractVariants(song.title);
    const trackVariants = MetadataNormalizer.extractVariants(track.title);

    let variantPenalty = 0;

    // Check variants in song but not in track
    for (const sv of songVariants) {
      if (!trackVariants.has(sv)) {
        const penalty = TrackMatcher.VARIANT_PENALTY_TABLE[sv] ?? 25;
        variantPenalty += penalty;
        reasons.push(`variant_mismatch_${sv}`);
      }
    }

    // Check variants in track but not in song
    for (const tv of trackVariants) {
      if (!songVariants.has(tv)) {
        const penalty = TrackMatcher.VARIANT_PENALTY_TABLE[tv] ?? 25;
        variantPenalty += penalty;
        reasons.push(`variant_mismatch_${tv}`);
      }
    }

    // Title match (up to 50 points)
    if (normSongTitle === normTrackTitle) {
      titleScore = 50;
      matchedBy.push('title');
      reasons.push('exact_title_match');
    } else if (normSongTitle.includes(normTrackTitle) || normTrackTitle.includes(normSongTitle)) {
      titleScore = 35;
      matchedBy.push('title_partial');
      reasons.push('partial_title_match');
    }

    // Artist match (up to 20 points)
    if (song.artist && track.artist) {
      const normSongArtist = MetadataNormalizer.normalizeArtist(song.artist);
      const normTrackArtist = MetadataNormalizer.normalizeArtist(track.artist);
      if (normSongArtist === normTrackArtist || normSongArtist.includes(normTrackArtist)) {
        artistScore = 20;
        matchedBy.push('artist');
        reasons.push('artist_match');
      }
    }

    // Gradual duration decay scoring (up to 30 points)
    if (song.duration && track.duration) {
      const diffSecs = Math.abs(song.duration - track.duration);
      if (diffSecs <= 0.5) {
        durationScore = 30;
        matchedBy.push('duration');
        reasons.push('exact_duration_match');
      } else if (diffSecs <= 20) {
        durationScore = Math.max(0, Math.round(30 - diffSecs * 1.5));
        if (durationScore > 0) {
          matchedBy.push('duration_close');
          reasons.push('close_duration_match');
        }
      }
    }

    const unpenalizedScore = titleScore + artistScore + durationScore + mbidScore;
    const totalScore = Math.max(0, unpenalizedScore - variantPenalty);

    return {
      score: totalScore,
      breakdown: { title: titleScore, artist: artistScore, duration: durationScore, mbid: mbidScore, total: totalScore },
      matchedBy,
      reasons
    };
  }
}
