import type { MusicBrainzRecordingDto } from './dto/RecordingDto';

export interface MatchTarget {
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
  year?: number;
}

export interface MatchScoreResult {
  candidate: MusicBrainzRecordingDto;
  score: number; // 0.0 to 1.0
  reasons: string[];
}

export class MetadataMatcher {
  private readonly minScoreThreshold: number;

  constructor(minScoreThreshold = 0.4) {
    this.minScoreThreshold = minScoreThreshold;
  }

  public findBestMatch(
    target: MatchTarget,
    candidates: MusicBrainzRecordingDto[]
  ): MusicBrainzRecordingDto | null {
    if (candidates.length === 0) return null;

    const scored = candidates.map((cand) => this.scoreCandidate(target, cand));
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= this.minScoreThreshold) {
      return best.candidate;
    }

    return null;
  }

  public scoreCandidate(target: MatchTarget, candidate: MusicBrainzRecordingDto): MatchScoreResult {
    let score = 0;
    const maxScore = 100;
    const reasons: string[] = [];

    const normTargetTitle = this.normalize(target.title);
    const normCandTitle = this.normalize(candidate.title);

    // Title match (up to 45 points)
    if (normTargetTitle === normCandTitle) {
      score += 45;
      reasons.push('exact_title_match');
    } else if (normTargetTitle.includes(normCandTitle) || normCandTitle.includes(normTargetTitle)) {
      score += 30;
      reasons.push('partial_title_match');
    }

    // Artist match (up to 35 points)
    if (target.artist && candidate['artist-credit'] && candidate['artist-credit'].length > 0) {
      const normTargetArtist = this.normalize(target.artist);
      const candArtists = candidate['artist-credit']
        .map((ac) => this.normalize(ac.name ?? ac.artist?.name ?? ''))
        .filter(Boolean);

      if (candArtists.some((ca) => ca === normTargetArtist || normTargetArtist.includes(ca))) {
        score += 35;
        reasons.push('artist_match');
      }
    }

    // Duration match (up to 20 points)
    if (target.durationSeconds && candidate.length) {
      const candSecs = candidate.length / 1000;
      const diffSecs = Math.abs(target.durationSeconds - candSecs);

      if (diffSecs <= 3) {
        score += 20;
        reasons.push('exact_duration_match');
      } else if (diffSecs <= 10) {
        score += 10;
        reasons.push('close_duration_match');
      }
    }

    const normalizedScore = Math.min(1.0, score / maxScore);
    return {
      candidate,
      score: normalizedScore,
      reasons
    };
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
