import { MetadataQueryNormalizer, type NormalizedQuery } from './MetadataQueryNormalizer';

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

export interface SearchRankingWeights {
  artistMatch: number;
  titleMatch: number;
  officialStatus: number;
  bootlegPenalty: number;
  primaryTypeAlbum: number;
  primaryTypeEP: number;
  compilationPenalty: number;
  livePenalty: number;
  trackCountMatch: number;
  editionBoost: number;
  remasterBoost: number;
}

export const DEFAULT_RANKING_WEIGHTS: SearchRankingWeights = {
  artistMatch: 30,
  titleMatch: 30,
  officialStatus: 20,
  bootlegPenalty: -25,
  primaryTypeAlbum: 15,
  primaryTypeEP: 10,
  compilationPenalty: -15,
  livePenalty: -15,
  trackCountMatch: 10,
  editionBoost: 12,
  remasterBoost: 10
};

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

export class MetadataSearchRankingEngine {
  public static rankCandidates(
    candidates: SearchCandidate[],
    query: NormalizedQuery,
    targetTrackCount?: number,
    weights: SearchRankingWeights = DEFAULT_RANKING_WEIGHTS
  ): ScoredSearchCandidate[] {
    if (!candidates || candidates.length === 0) return [];

    const scored = candidates.map((cand) => this.scoreCandidate(cand, query, targetTrackCount, weights));

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
    const artistSim = MetadataQueryNormalizer.compareStringSimilarity(cand.artist, query.cleanArtist ?? query.rawArtist);
    const artistScore = Math.round(artistSim * weights.artistMatch);

    // 3. Title Similarity Score (Jaro-Winkler against rawTitle and cleanTitle)
    const rawTitleSim = MetadataQueryNormalizer.compareStringSimilarity(cand.title, query.rawTitle);
    const cleanTitleSim = MetadataQueryNormalizer.compareStringSimilarity(cand.title, query.cleanTitle);
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

    const totalScore = baseScore + artistScore + titleScore + statusScore + primaryTypeScore + secondaryTypePenalty + trackCountBonus + editionBoost;

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
