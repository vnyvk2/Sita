import {
  DEFAULT_SEARCH_RANKING_WEIGHTS,
  type SearchRankingWeights
} from '../../../common/metadata/preferences';
import { MetadataQueryNormalizer, type NormalizedQuery } from './MetadataQueryNormalizer';

export type { SearchRankingWeights };

export interface SearchCandidate {
  id: string;
  title: string;
  artist?: string;
  year?: number;
  status?: string;
  primaryType?: string;
  secondaryTypes?: string[];
  trackCount?: number;
  baseScore: number;
  rawItem?: unknown;
}

export const DEFAULT_RANKING_WEIGHTS: SearchRankingWeights = DEFAULT_SEARCH_RANKING_WEIGHTS;

export interface ScoredSearchCandidate {
  candidate: SearchCandidate;
  totalScore: number;
  breakdown: {
    baseScore: number;
    artistScore: number;
    titleScore: number;
    statusScore: number;
    primaryTypeScore: number;
    secondaryTypePenalty: number;
    trackCountBonus: number;
    editionBoost: number;
  };
}

export enum MatchQualityBand {
  Definitive = 'Definitive',
  Probable = 'Probable',
  Weak = 'Weak'
}

/**
 * Classifies candidate into intrinsic MatchQualityBands:
 *
 * - Definitive (Score >= 160): Exact title and artist, with track match confirmation or official
 *   studio release, without track count mismatch penalty.
 * - Probable (120 <= Score < 160): Strong title or artist match above quality floor.
 * - Weak (Score < 120): Ambiguous or low-similarity matches.
 */
export function classifyQualityBand(scored: ScoredSearchCandidate): MatchQualityBand {
  const hasExactArtist = scored.breakdown.artistScore >= 27;
  const hasExactTitle = scored.breakdown.titleScore >= 27;
  const hasTrackMatch = scored.breakdown.trackCountBonus > 0;
  const hasTrackMismatchPenalty = scored.breakdown.trackCountBonus < 0;
  const isOfficialOrAlbum =
    scored.breakdown.statusScore > 0 || scored.breakdown.primaryTypeScore > 0;

  // Definitive: High similarity on title + artist without severe track mismatch, with track confirmation or official studio status
  if (
    hasExactArtist &&
    hasExactTitle &&
    !hasTrackMismatchPenalty &&
    (hasTrackMatch || isOfficialOrAlbum) &&
    scored.totalScore >= 160
  ) {
    return MatchQualityBand.Definitive;
  }

  // Probable: Strong title/artist score without falling below threshold
  if (scored.totalScore >= 120 && (hasExactArtist || hasExactTitle)) {
    return MatchQualityBand.Probable;
  }

  return MatchQualityBand.Weak;
}

export class MetadataSearchRankingEngine {
  public static rankCandidates(
    candidates: SearchCandidate[],
    query: NormalizedQuery,
    targetTrackCount?: number,
    weights: SearchRankingWeights = DEFAULT_RANKING_WEIGHTS
  ): ScoredSearchCandidate[] {
    if (!candidates || candidates.length === 0) return [];

    const scored = candidates.map((cand) =>
      this.scoreCandidate(cand, query, targetTrackCount, weights)
    );

    // Sort descending by totalScore
    return scored.sort((a, b) => b.totalScore - a.totalScore);
  }

  public static scoreCandidate(
    cand: SearchCandidate,
    query: NormalizedQuery,
    targetTrackCount?: number,
    weights: SearchRankingWeights = DEFAULT_RANKING_WEIGHTS
  ): ScoredSearchCandidate {
    // 1. Base Score from Provider Lucene / Search API (0 - 100)
    const baseScore = typeof cand.baseScore === 'number' ? cand.baseScore : 50;

    // 2. Artist Similarity Score (Jaro-Winkler)
    const artistSim = MetadataQueryNormalizer.compareStringSimilarity(
      cand.artist,
      query.cleanArtist ?? query.rawArtist
    );
    const artistScore = Math.round(artistSim * weights.artistMatch);

    // 3. Title Similarity Score (Jaro-Winkler against rawTitle and cleanTitle)
    const rawTitleSim = MetadataQueryNormalizer.compareStringSimilarity(cand.title, query.rawTitle);
    const cleanTitleSim = MetadataQueryNormalizer.compareStringSimilarity(
      cand.title,
      query.cleanTitle
    );
    const bestTitleSim = Math.max(rawTitleSim, cleanTitleSim);
    const titleScore = Math.round(bestTitleSim * weights.titleMatch);

    // 4. Release Status Score (+20 Official, -25 Bootleg/Pseudo-Release)
    let statusScore = 0;
    const status = cand.status?.toLowerCase();
    if (status === 'official') {
      statusScore = weights.officialStatus;
    } else if (status === 'bootleg' || status === 'pseudo-release') {
      statusScore = weights.bootlegPenalty;
    }

    // 5. Primary Type Score (+15 for Album, +10 for EP)
    let primaryTypeScore = 0;
    const primaryType = cand.primaryType?.toLowerCase();
    if (primaryType === 'album') {
      primaryTypeScore = weights.primaryTypeAlbum;
    } else if (primaryType === 'ep') {
      primaryTypeScore = weights.primaryTypeEP;
    }

    // 6. Secondary Type Penalties (Compilation, Live, Remix)
    let secondaryTypePenalty = 0;
    const secondaryTypes = cand.secondaryTypes?.map((t) => t.toLowerCase()) ?? [];

    if (secondaryTypes.includes('compilation') && !query.isCompilationRequested) {
      secondaryTypePenalty += weights.compilationPenalty;
    }
    if (secondaryTypes.includes('live') && !query.isLiveRequested) {
      secondaryTypePenalty += weights.livePenalty;
    }

    // 7. Track Count Match Bonus
    let trackCountBonus = 0;
    if (targetTrackCount && cand.trackCount && cand.trackCount === targetTrackCount) {
      trackCountBonus = weights.trackCountMatch;
    }

    // 8. Edition-Aware Scoring
    // When the user explicitly searched for an edition (deluxe, remastered, etc.),
    // boost candidates whose titles match that edition intent.
    let editionBoost = 0;
    const candTitleLower = cand.title?.toLowerCase() ?? '';

    if (query.isDeluxeRequested) {
      const hasDeluxeKeyword =
        candTitleLower.includes('deluxe') ||
        candTitleLower.includes('expanded') ||
        candTitleLower.includes('bonus') ||
        candTitleLower.includes('platinum') ||
        candTitleLower.includes('anniversary') ||
        candTitleLower.includes('special edition');
      if (hasDeluxeKeyword) {
        editionBoost += weights.editionBoost;
      }
    }

    if (query.isRemasterRequested) {
      if (candTitleLower.includes('remaster') || candTitleLower.includes('re-master')) {
        editionBoost += weights.remasterBoost;
      }
    }

    const totalScore =
      baseScore +
      artistScore +
      titleScore +
      statusScore +
      primaryTypeScore +
      secondaryTypePenalty +
      trackCountBonus +
      editionBoost;

    return {
      candidate: cand,
      totalScore,
      breakdown: {
        baseScore,
        artistScore,
        titleScore,
        statusScore,
        primaryTypeScore,
        secondaryTypePenalty,
        trackCountBonus,
        editionBoost
      }
    };
  }
}
