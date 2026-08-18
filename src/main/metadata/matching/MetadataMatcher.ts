import type {
  RecordingMetadata,
  ProviderMetadata,
  MetadataCandidate,
  MatchCriterion
} from '@main/metadata/models/RecordingMetadata';
import { normalizeForMatching } from './normalizeForMatching';

export interface MatchTarget {
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
  year?: number;
}

export interface CandidateItem {
  id: string;
  title: string;
  artists?: string[];
  durationSeconds?: number;
  [key: string]: unknown;
}

export interface MatchScoreResult<T extends CandidateItem = CandidateItem> {
  candidate: T;
  score: number; // 0.0 to 1.0
  matchedBy: MatchCriterion[];
  reasons: string[];
}

export class MetadataMatcher {
  private readonly minScoreThreshold: number;

  constructor(minScoreThreshold = 0.4) {
    this.minScoreThreshold = minScoreThreshold;
  }

  public findBestMatch<T extends CandidateItem>(
    target: MatchTarget,
    candidates: T[]
  ): MatchScoreResult<T> | null {
    if (candidates.length === 0) return null;

    const scored = candidates.map((cand) => this.scoreCandidate(target, cand));
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= this.minScoreThreshold) {
      return best;
    }

    return null;
  }

  public scoreCandidate<T extends CandidateItem>(
    target: MatchTarget,
    candidate: T
  ): MatchScoreResult<T> {
    let score = 0;
    const maxScore = 100;
    const matchedBy: MatchCriterion[] = [];
    const reasons: string[] = [];

    const normTargetTitle = this.normalize(target.title);
    const normCandTitle = this.normalize(candidate.title);

    // Title match (up to 45 points) - Empty normalized string guard
    if (normTargetTitle && normCandTitle) {
      if (normTargetTitle === normCandTitle) {
        score += 45;
        matchedBy.push('title');
        reasons.push('exact_title_match');
      } else if (normTargetTitle.includes(normCandTitle) || normCandTitle.includes(normTargetTitle)) {
        score += 30;
        matchedBy.push('title_partial');
        reasons.push('partial_title_match');
      }
    }

    // Artist match (up to 35 points) - Empty normalized string guard & Bidirectional
    if (target.artist && candidate.artists && candidate.artists.length > 0) {
      const normTargetArtist = this.normalize(target.artist);
      const candArtists = candidate.artists.map((a) => this.normalize(a)).filter(Boolean);

      if (
        normTargetArtist &&
        candArtists.some(
          (ca) => ca === normTargetArtist || normTargetArtist.includes(ca) || ca.includes(normTargetArtist)
        )
      ) {
        score += 35;
        matchedBy.push('artist');
        reasons.push('artist_match');
      }
    }

    // Duration match (up to 20 points)
    if (target.durationSeconds && candidate.durationSeconds) {
      const diffSecs = Math.abs(target.durationSeconds - candidate.durationSeconds);

      if (diffSecs <= 3) {
        score += 20;
        matchedBy.push('duration');
        reasons.push('exact_duration_match');
      } else if (diffSecs <= 10) {
        score += 10;
        matchedBy.push('duration_close');
        reasons.push('close_duration_match');
      }
    }

    const normalizedScore = Math.min(1.0, score / maxScore);
    return {
      candidate,
      score: normalizedScore,
      matchedBy,
      reasons
    };
  }

  public createMetadataCandidate(
    recording: RecordingMetadata,
    provider: ProviderMetadata
  ): MetadataCandidate {
    return { recording, provider };
  }

  private normalize(str?: string): string {
    return normalizeForMatching(str);
  }
}
