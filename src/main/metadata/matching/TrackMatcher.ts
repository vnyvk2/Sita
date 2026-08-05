import type { MatchCriterion, MetadataCandidate, RecordingMetadata } from '../models/RecordingMetadata';
import type { TrackMatchPair, ScoreBreakdown } from '../services/AlbumMetadataService';
import { MetadataNormalizer, type RecordingVariant } from './MetadataNormalizer';

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

export interface OfficialTrackInput {
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
}

export interface ReleaseContext {
  albumTitle?: string;
  discCount?: number;
  trackCount?: number;
  releaseType?: string;
  year?: number;
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
   * Incorporates album scoring (+15), year bonus (+5), curved duration decay, ISRC=100pts priority,
   * duplicate local candidate warnings, and why explanations.
   */
  public matchTracks(
    localSongs: LocalSongInput[],
    releaseId: string,
    officialTracks: OfficialTrackInput[],
    releaseContext?: ReleaseContext
  ): TrackMatchPair[] {
    // Detect duplicate local titles
    const titleCounts = new Map<string, number>();
    for (const song of localSongs) {
      const norm = MetadataNormalizer.normalizeTitle(song.title);
      titleCounts.set(norm, (titleCounts.get(norm) ?? 0) + 1);
    }

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
      const isDuplicateTitle = (titleCounts.get(MetadataNormalizer.normalizeTitle(song.title)) ?? 0) > 1;

      for (const track of officialTracks) {
        const { score, breakdown, matchedBy, reasons } = this.scorePair(song, track, releaseContext);

        if (isDuplicateTitle) {
          reasons.push('duplicate_local_candidate');
        }

        allPairs.push({ localSong: song, track, score, breakdown, matchedBy, reasons });
      }
    }

    // Deterministic tie-breaking sort
    allPairs.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.breakdown.title !== a.breakdown.title) return b.breakdown.title - a.breakdown.title;
      if (b.breakdown.artist !== a.breakdown.artist) return b.breakdown.artist - a.breakdown.artist;
      if (b.breakdown.album !== a.breakdown.album) return b.breakdown.album - a.breakdown.album;
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

      // Construct human-readable "why" match explanation
      const whyParts: string[] = [];
      if (pair.breakdown.mbid > 0) whyParts.push('MBID/ISRC Match');
      if (pair.breakdown.title > 0) whyParts.push('Title');
      if (pair.breakdown.artist > 0) whyParts.push('Artist');
      if (pair.breakdown.album > 0) whyParts.push('Album');
      if (pair.breakdown.duration > 0) whyParts.push('Duration');
      if (pair.breakdown.year > 0) whyParts.push('Year');
      const why = whyParts.length > 0 ? whyParts.join(', ') : 'Matched Criteria';

      assignedPairs.push({
        localSong: pair.localSong,
        remoteTrack: candidate,
        confidence: normalizedScore,
        scoreBreakdown: pair.breakdown,
        why,
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
    track: OfficialTrackInput,
    releaseContext?: ReleaseContext
  ): { score: number; breakdown: ScoreBreakdown; matchedBy: MatchCriterion[]; reasons: string[] } {
    let titleScore = 0;
    let artistScore = 0;
    let albumScore = 0;
    let yearScore = 0;
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
        breakdown: { title: 0, artist: 0, album: 0, year: 0, duration: 0, mbid: 100, total: 100 },
        matchedBy: ['title', 'artist', 'duration'],
        reasons: ['mbid_exact_match']
      };
    }

    // Priority 2: ISRC exact match (100 points - official recording identifier)
    if (song.isrc && track.isrc && song.isrc.trim().toUpperCase() === track.isrc.trim().toUpperCase()) {
      return {
        score: 100,
        breakdown: { title: 0, artist: 0, album: 0, year: 0, duration: 0, mbid: 100, total: 100 },
        matchedBy: ['title', 'artist'],
        reasons: ['isrc_exact_match']
      };
    }

    // Check useless title fallback
    const effectiveSongTitle = MetadataNormalizer.isUselessTitle(song.title)
      ? MetadataNormalizer.normalizeFilename(song.path)
      : song.title;

    const normSongTitle = MetadataNormalizer.normalizeTitle(effectiveSongTitle);
    const normTrackTitle = MetadataNormalizer.normalizeTitle(track.title);

    // Symmetric Variant Penalty Calculation
    const songVariants = MetadataNormalizer.extractVariants(effectiveSongTitle);
    const trackVariants = MetadataNormalizer.extractVariants(track.title);

    let variantPenalty = 0;
    for (const sv of songVariants) {
      if (!trackVariants.has(sv)) {
        const penalty = TrackMatcher.VARIANT_PENALTY_TABLE[sv] ?? 25;
        variantPenalty += penalty;
        reasons.push(`variant_mismatch_${sv}`);
      }
    }
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

    // Album match (+15 points exact / +10 points partial)
    const effectiveAlbum = song.album ?? releaseContext?.albumTitle;
    const targetAlbum = track.album ?? releaseContext?.albumTitle;
    if (effectiveAlbum && targetAlbum) {
      const normSongAlbum = MetadataNormalizer.normalizeAlbum(effectiveAlbum);
      const normTargetAlbum = MetadataNormalizer.normalizeAlbum(targetAlbum);
      if (normSongAlbum === normTargetAlbum) {
        albumScore = 15;
        matchedBy.push('album');
        reasons.push('exact_album_match');
      } else if (normSongAlbum.includes(normTargetAlbum) || normTargetAlbum.includes(normSongAlbum)) {
        albumScore = 10;
        matchedBy.push('album');
        reasons.push('partial_album_match');
      }
    }

    // Year bonus (+5 points exact / +3 points ±1 year)
    const songYear = song.year ?? releaseContext?.year;
    const trackYear = track.year ?? releaseContext?.year;
    if (songYear && trackYear) {
      const yearDiff = Math.abs(songYear - trackYear);
      if (yearDiff === 0) {
        yearScore = 5;
        matchedBy.push('year');
        reasons.push('exact_year_match');
      } else if (yearDiff <= 1) {
        yearScore = 3;
        matchedBy.push('year');
        reasons.push('close_year_match');
      }
    }

    // Curved duration decay scoring (up to 30 points)
    if (song.duration && track.duration) {
      const diffSecs = Math.abs(song.duration - track.duration);
      if (diffSecs <= 0.5) {
        durationScore = 30;
        matchedBy.push('duration');
        reasons.push('exact_duration_match');
      } else if (diffSecs <= 1.0) {
        durationScore = 29;
        matchedBy.push('duration');
        reasons.push('close_duration_match');
      } else if (diffSecs <= 2.0) {
        durationScore = 27;
        matchedBy.push('duration');
        reasons.push('close_duration_match');
      } else if (diffSecs <= 5.0) {
        durationScore = 20;
        matchedBy.push('duration_close');
        reasons.push('close_duration_match');
      } else if (diffSecs <= 10.0) {
        durationScore = 10;
        matchedBy.push('duration_close');
        reasons.push('close_duration_match');
      } else if (diffSecs <= 20.0) {
        durationScore = 5;
        matchedBy.push('duration_close');
        reasons.push('close_duration_match');
      }
    }

    const unpenalizedScore = titleScore + artistScore + albumScore + yearScore + durationScore + mbidScore;
    const totalScore = Math.max(0, unpenalizedScore - variantPenalty);

    return {
      score: totalScore,
      breakdown: {
        title: titleScore,
        artist: artistScore,
        album: albumScore,
        year: yearScore,
        duration: durationScore,
        mbid: mbidScore,
        total: totalScore
      },
      matchedBy,
      reasons
    };
  }
}
