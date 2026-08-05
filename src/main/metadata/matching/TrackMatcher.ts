import type { MatchCriterion, MetadataCandidate, RecordingMetadata } from '../models/RecordingMetadata';
import type { TrackMatchPair } from '../services/AlbumMetadataService';

export interface LocalSongInput {
  songId: number;
  title: string;
  artist?: string;
  album?: string;
  path: string;
  duration?: number;
  musicBrainzRecordingId?: string;
}

export class TrackMatcher {
  /**
   * Matches an array of local songs against official release tracks.
   * Uses title fuzzy matching, artist matching, duration tolerance, and MBID matching.
   * Filename numbers contribute 0 points to matching score.
   */
  public matchTracks(
    localSongs: LocalSongInput[],
    releaseId: string,
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
  ): TrackMatchPair[] {
    return localSongs.map((song) => {
      let bestCandidateTrack = officialTracks[0];
      let maxScore = -1;
      let bestMatchedBy: MatchCriterion[] = [];
      let bestReasons: string[] = [];

      for (const track of officialTracks) {
        const { score, matchedBy, reasons } = this.scorePair(song, track);
        if (score > maxScore) {
          maxScore = score;
          bestCandidateTrack = track;
          bestMatchedBy = matchedBy;
          bestReasons = reasons;
        }
      }

      const normalizedScore = Math.min(1.0, Math.max(0.0, maxScore / 100));

      const recording: RecordingMetadata = {
        title: bestCandidateTrack?.title ?? song.title,
        artist: bestCandidateTrack?.artist ?? song.artist,
        trackNumber: bestCandidateTrack?.trackNumber,
        discNumber: bestCandidateTrack?.discNumber,
        duration: bestCandidateTrack?.duration
      };

      const candidate: MetadataCandidate = {
        recording,
        provider: {
          provider: 'musicbrainz',
          providerRecordingId: bestCandidateTrack?.musicBrainzRecordingId ?? bestCandidateTrack?.trackId,
          providerReleaseId: releaseId,
          isrc: bestCandidateTrack?.isrc,
          confidence: normalizedScore,
          matchedBy: bestMatchedBy,
          reasons: bestReasons
        }
      };

      return {
        localSong: song,
        remoteTrack: candidate,
        confidence: normalizedScore,
        matchedBy: bestMatchedBy,
        reasons: bestReasons
      };
    });
  }

  public scorePair(
    song: LocalSongInput,
    track: {
      trackId?: string;
      title: string;
      artist?: string;
      duration?: number;
      musicBrainzRecordingId?: string;
    }
  ): { score: number; matchedBy: MatchCriterion[]; reasons: string[] } {
    let score = 0;
    const matchedBy: MatchCriterion[] = [];
    const reasons: string[] = [];

    // MBID exact match (100 points - perfect)
    if (
      song.musicBrainzRecordingId &&
      track.musicBrainzRecordingId &&
      song.musicBrainzRecordingId === track.musicBrainzRecordingId
    ) {
      return {
        score: 100,
        matchedBy: ['title', 'artist', 'duration'],
        reasons: ['mbid_exact_match']
      };
    }

    const normSongTitle = this.normalize(song.title);
    const normTrackTitle = this.normalize(track.title);

    // Title match (up to 50 points)
    if (normSongTitle === normTrackTitle) {
      score += 50;
      matchedBy.push('title');
      reasons.push('exact_title_match');
    } else if (normSongTitle.includes(normTrackTitle) || normTrackTitle.includes(normSongTitle)) {
      score += 35;
      matchedBy.push('title_partial');
      reasons.push('partial_title_match');
    }

    // Artist match (up to 20 points)
    if (song.artist && track.artist) {
      const normSongArtist = this.normalize(song.artist);
      const normTrackArtist = this.normalize(track.artist);
      if (normSongArtist === normTrackArtist || normSongArtist.includes(normTrackArtist)) {
        score += 20;
        matchedBy.push('artist');
        reasons.push('artist_match');
      }
    }

    // Duration match (up to 30 points)
    if (song.duration && track.duration) {
      const diffSecs = Math.abs(song.duration - track.duration);
      if (diffSecs <= 2) {
        score += 30;
        matchedBy.push('duration');
        reasons.push('exact_duration_match');
      } else if (diffSecs <= 10) {
        score += 15;
        matchedBy.push('duration_close');
        reasons.push('close_duration_match');
      }
    }

    return { score, matchedBy, reasons };
  }

  private normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
