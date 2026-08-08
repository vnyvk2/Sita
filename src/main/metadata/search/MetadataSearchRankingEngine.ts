import type { MusicBrainzReleaseDto } from '../providers/musicbrainz/dto';
import { MetadataQueryNormalizer, type NormalizedQuery } from './MetadataQueryNormalizer';

export interface ScoredReleaseCandidate {
  release: MusicBrainzReleaseDto;
  totalScore: number;
  breakdown: {
    baseScore: number;
    artistScore: number;
    titleScore: number;
    statusScore: number;
    primaryTypeScore: number;
    secondaryTypePenalty: number;
  };
}

export class MetadataSearchRankingEngine {
  public static rankCandidates(
    candidates: MusicBrainzReleaseDto[],
    query: NormalizedQuery,
    targetTrackCount?: number
  ): ScoredReleaseCandidate[] {
    if (!candidates || candidates.length === 0) return [];

    const scored = candidates.map((rel) => this.scoreCandidate(rel, query, targetTrackCount));

    // Sort descending by totalScore
    return scored.sort((a, b) => b.totalScore - a.totalScore);
  }

  public static scoreCandidate(
    rel: MusicBrainzReleaseDto,
    query: NormalizedQuery,
    targetTrackCount?: number
  ): ScoredReleaseCandidate {
    // 1. Base Score from MusicBrainz Lucene (0 - 100)
    const baseScore = typeof rel.score === 'number' ? rel.score : Number(rel.score ?? 50);

    // 2. Artist Similarity Score
    const candidateArtist = rel['artist-credit']?.[0]?.name ?? rel['artist-credit']?.[0]?.artist?.name ?? '';
    const artistSim = MetadataQueryNormalizer.compareStringSimilarity(candidateArtist, query.cleanArtist ?? query.rawArtist);
    const artistScore = Math.round(artistSim * 30);

    // 3. Title Similarity Score
    const candidateTitle = rel.title ?? '';
    const titleSim = MetadataQueryNormalizer.compareStringSimilarity(candidateTitle, query.cleanTitle);
    const titleScore = Math.round(titleSim * 30);

    // 4. Release Status Score (+20 Official, -25 Bootleg/Pseudo-Release)
    let statusScore = 0;
    const status = rel.status?.toLowerCase();
    if (status === 'official') {
      statusScore = 20;
    } else if (status === 'bootleg' || status === 'pseudo-release') {
      statusScore = -25;
    }

    // 5. Primary Type Score (+15 for Album, +10 for EP)
    let primaryTypeScore = 0;
    const primaryType = rel['release-group']?.['primary-type']?.toLowerCase();
    if (primaryType === 'album') {
      primaryTypeScore = 15;
    } else if (primaryType === 'ep') {
      primaryTypeScore = 10;
    } else if (primaryType === 'single') {
      primaryTypeScore = 5;
    }

    // 6. Secondary Type Penalties (Compilation, Live, Remix)
    let secondaryTypePenalty = 0;
    const secondaryTypes = rel['release-group']?.['secondary-types']?.map((t) => t.toLowerCase()) ?? [];

    if (secondaryTypes.includes('compilation') && !query.isCompilationRequested) {
      secondaryTypePenalty -= 15;
    }
    if (secondaryTypes.includes('live') && !query.isLiveRequested) {
      secondaryTypePenalty -= 15;
    }
    if (secondaryTypes.includes('remix') && !query.isRemasterRequested) {
      secondaryTypePenalty -= 10;
    }

    // Track count bonus
    let trackCountBonus = 0;
    if (targetTrackCount && rel.media?.[0]?.['track-count'] === targetTrackCount) {
      trackCountBonus = 10;
    }

    const totalScore = baseScore + artistScore + titleScore + statusScore + primaryTypeScore + secondaryTypePenalty + trackCountBonus;

    return {
      release: rel,
      totalScore,
      breakdown: {
        baseScore,
        artistScore,
        titleScore,
        statusScore,
        primaryTypeScore,
        secondaryTypePenalty
      }
    };
  }
}
