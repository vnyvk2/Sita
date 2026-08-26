import type { MetadataProviderId } from '../../../common/metadata/provider';
import type { AlbumMetadata, MatchQualityBandName } from '../../../common/metadata/release';
import {
  type ScoredSearchCandidate,
  MatchQualityBand,
  classifyQualityBand
} from './MetadataSearchRankingEngine';

const MATCH_QUALITY_BAND_NAME: Record<MatchQualityBand, MatchQualityBandName> = {
  [MatchQualityBand.Definitive]: 'Definitive',
  [MatchQualityBand.Probable]: 'Probable',
  [MatchQualityBand.Weak]: 'Weak'
};

export interface RankedDiscoveryCandidate {
  album: AlbumMetadata;
  scored: ScoredSearchCandidate;
  qualityBand: MatchQualityBand;
  sourcePriorityRank: number;
  explainability: {
    isExactTrackCount: boolean;
    isExactTitleArtist: boolean;
    isOfficial: boolean;
    isPreferredSource: boolean;
    sourcePriorityRank: number;
  };
}

export class DiscoveryCandidateSorter {
  public static sortCandidates(
    candidates: { album: AlbumMetadata; scored: ScoredSearchCandidate }[],
    providerPriority: MetadataProviderId[] = ['musicbrainz']
  ): RankedDiscoveryCandidate[] {
    const priorityMap = new Map<string, number>();
    providerPriority.forEach((p, idx) => {
      priorityMap.set(p.toLowerCase(), idx);
    });

    const ranked: RankedDiscoveryCandidate[] = candidates.map(({ album, scored }) => {
      const qualityBand = classifyQualityBand(scored);
      const providerId = (album.provider ?? 'musicbrainz').toLowerCase();
      const sourcePriorityRank = priorityMap.has(providerId)
        ? priorityMap.get(providerId)!
        : 999;

      const isExactTrackCount = scored.breakdown.trackCountBonus > 0;
      const isExactTitleArtist = scored.breakdown.artistScore >= 27 && scored.breakdown.titleScore >= 27;
      const isOfficial = scored.breakdown.statusScore > 0;
      const isPreferredSource = sourcePriorityRank === 0;

      return {
        album: {
          ...album,
          rankingScore: Math.round(scored.totalScore),
          rankingBreakdown: { ...scored.breakdown },
          qualityBand: MATCH_QUALITY_BAND_NAME[qualityBand]
        },
        scored,
        qualityBand,
        sourcePriorityRank,
        explainability: {
          isExactTrackCount,
          isExactTitleArtist,
          isOfficial,
          isPreferredSource,
          sourcePriorityRank
        }
      };
    });

    const bandWeights = {
      [MatchQualityBand.Definitive]: 3,
      [MatchQualityBand.Probable]: 2,
      [MatchQualityBand.Weak]: 1
    };

    return ranked.sort((a, b) => {
      // 1. Primary: Quality Band (Definitive > Probable > Weak)
      const bandDiff = bandWeights[b.qualityBand] - bandWeights[a.qualityBand];
      if (bandDiff !== 0) return bandDiff;

      // 2. Secondary: User Source Priority within same band
      const prioDiff = a.sourcePriorityRank - b.sourcePriorityRank;
      if (prioDiff !== 0) return prioDiff;

      // 3. Tertiary: Intrinsic Raw Ranking Score
      const scoreDiff = b.scored.totalScore - a.scored.totalScore;
      if (scoreDiff !== 0) return scoreDiff;

      // 4. Deterministic tie-breaker
      const idA = a.album.releaseId || a.album.title;
      const idB = b.album.releaseId || b.album.title;
      return idA.localeCompare(idB);
    });
  }
}
