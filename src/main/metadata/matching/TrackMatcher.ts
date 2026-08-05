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

export class TrackMatcher {
  /**
   * Matches an array of local songs against official release tracks.
   * Enforces strict ONE-TO-ONE candidate assignment (no two local songs can claim the same official track).
   * Uses title fuzzy matching, artist matching, duration tolerance, and MBID matching.
   * Filename numbers contribute 0 points to matching score.
   */
  public matchTracks(
    localSongs: LocalSongInput[],
    releaseId: string,
    officialTracks: OfficialTrackInput[]
  ): TrackMatchPair[] {
    interface PairScore {
      localSong: LocalSongInput;
      track: OfficialTrackInput;
      score: number;
      matchedBy: MatchCriterion[];
      reasons: string[];
    }

    const allPairs: PairScore[] = [];

    for (const song of localSongs) {
      for (const track of officialTracks) {
        const { score, matchedBy, reasons } = this.scorePair(song, track);
        allPairs.push({ localSong: song, track, score, matchedBy, reasons });
      }
    }

    // Sort all candidate pairs in descending order of matching score
    allPairs.sort((a, b) => b.score - a.score);

    const claimedSongIds = new Set<number>();
    const claimedTrackIds = new Set<string | number>();
    const assignedPairs: TrackMatchPair[] = [];

    for (const pair of allPairs) {
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
        matchedBy: pair.matchedBy,
        reasons: pair.reasons
      });
    }

    return assignedPairs;
  }

  public scorePair(
    song: LocalSongInput,
    track: OfficialTrackInput
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
