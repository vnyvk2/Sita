import type { MatchCriterion, MetadataCandidate, RecordingMetadata } from '../models/RecordingMetadata';
import type { TrackMatchPair, ScoreBreakdown } from '../services/AlbumMetadataService';

export interface LocalSongInput {
  songId: number;
  title: string;
  artist?: string;
  album?: string;
  path: string;
  duration?: number;
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
  /**
   * Matches an array of local songs against official release tracks.
   * Enforces strict ONE-TO-ONE candidate assignment with MIN_MATCH_SCORE threshold (50 pts).
   * Incorporates deterministic tie-breaking and prefix stripping for filenames.
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
      // Minimum assignment threshold check
      if (pair.score < MIN_MATCH_SCORE) {
        continue;
      }

      const trackKey = pair.track.trackId ?? pair.track.trackNumber;
      if (claimedSongIds.has(pair.localSong.songId) || claimedTrackIds.has(trackKey)) {
        continue; // Skip already claimed local song or official track
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
          isrc: pair.track.isrc,
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

    // MBID exact match (100 points - perfect)
    if (
      song.musicBrainzRecordingId &&
      track.musicBrainzRecordingId &&
      song.musicBrainzRecordingId === track.musicBrainzRecordingId
    ) {
      mbidScore = 100;
      return {
        score: 100,
        breakdown: { title: 0, artist: 0, duration: 0, mbid: 100, total: 100 },
        matchedBy: ['title', 'artist', 'duration'],
        reasons: ['mbid_exact_match']
      };
    }

    const normSongTitle = this.normalize(song.title);
    const normTrackTitle = this.normalize(track.title);

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
      const normSongArtist = this.normalize(song.artist);
      const normTrackArtist = this.normalize(track.artist);
      if (normSongArtist === normTrackArtist || normSongArtist.includes(normTrackArtist)) {
        artistScore = 20;
        matchedBy.push('artist');
        reasons.push('artist_match');
      }
    }

    // Duration match (up to 30 points)
    if (song.duration && track.duration) {
      const diffSecs = Math.abs(song.duration - track.duration);
      if (diffSecs <= 2) {
        durationScore = 30;
        matchedBy.push('duration');
        reasons.push('exact_duration_match');
      } else if (diffSecs <= 10) {
        durationScore = 15;
        matchedBy.push('duration_close');
        reasons.push('close_duration_match');
      }
    }

    const totalScore = titleScore + artistScore + durationScore + mbidScore;

    return {
      score: totalScore,
      breakdown: { title: titleScore, artist: artistScore, duration: durationScore, mbid: mbidScore, total: totalScore },
      matchedBy,
      reasons
    };
  }

  public normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\.(mp3|flac|m4a|wav|aac|ogg|wma)$/i, '')
      .replace(/^(cd\d+[-_.\s]*)?(\d{1,3}[-_.\s]+|track\s*\d+[-_.\s]*)+/i, '') // Strip CD1-01-, 01 -, 01_, 01., Track 01 -
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
