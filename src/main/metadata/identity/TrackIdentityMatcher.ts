import { MetadataNormalizer, type RecordingVariant } from '../matching/MetadataNormalizer';
import type { CanonicalTrackIdentity } from './CanonicalTrackIdentity';

export interface ScoreBreakdown {
  title: number;
  artist: number;
  album: number;
  year: number;
  duration: number;
  isrcOrMbid: number;
  variantPenalty: number;
  total: number;
}

export type IdentityMatchType = 'ISRC' | 'MBID' | 'HIGH_CONFIDENCE_METADATA' | 'FUZZY' | 'NONE';

export interface IdentityMatchResult {
  score: number;
  confidence: number;
  matchType: IdentityMatchType;
  isMatch: boolean;
  isAuthoritative: boolean;
  breakdown: ScoreBreakdown;
  reasons: string[];
  why: string;
}

export const MIN_IDENTITY_MATCH_SCORE = 50;

export const DURATION_THRESHOLDS = [
  { maxDiff: 0.5, score: 30 },
  { maxDiff: 1.0, score: 29 },
  { maxDiff: 2.0, score: 27 },
  { maxDiff: 5.0, score: 20 },
  { maxDiff: 10.0, score: 10 },
  { maxDiff: 20.0, score: 5 }
];

export const VARIANT_PENALTY_TABLE: Record<RecordingVariant, number> = {
  live: 35,
  acoustic: 30,
  remix: 40,
  demo: 35,
  instrumental: 45,
  mono: 10,
  stereo: 10,
  'radio edit': 20,
  'extended mix': 25,
  unplugged: 30,
  session: 25,
  orchestral: 30,
  'piano version': 30
};

export class TrackIdentityMatcher {
  /**
   * Scores a pair of CanonicalTrackIdentities and determines if they represent the same recording.
   * Pure, deterministic, and free of database/caller dependencies.
   *
   * Matching Taxonomy:
   * 1. Authoritative Tier (MBID / ISRC):
   *    - Industry-standard, cryptographic/registry recording identifiers.
   *    - Yield 100% confidence and `isAuthoritative: true`.
   *    - Policy Invariant: Authoritative identifiers intentionally override textual/cosmetic title differences.
   *
   * 2. Heuristic Tier:
   *    - Weighted heuristic evaluation: Title (35pts), Artist (25pts), Album (10pts), Year (5pts), Duration (30pts).
   *    - Hard Variant Conflict Invariant: Major variant mismatches (Live, Acoustic, Remix, Demo, Instrumental)
   *      strictly enforce `isMatch = false` and `matchType = 'NONE'`.
   *    - Scores >= 90 with matching title/artist and zero variant penalty yield `HIGH_CONFIDENCE_METADATA` (`isAuthoritative: false`).
   */
  public static scorePair(
    source: CanonicalTrackIdentity,
    target: CanonicalTrackIdentity
  ): IdentityMatchResult {
    const reasons: string[] = [];

    // 1. Authoritative Tier: MBID Exact Match
    if (
      source.musicBrainzRecordingId &&
      target.musicBrainzRecordingId &&
      source.musicBrainzRecordingId.trim().toLowerCase() ===
        target.musicBrainzRecordingId.trim().toLowerCase()
    ) {
      return {
        score: 100,
        confidence: 1.0,
        matchType: 'MBID',
        isMatch: true,
        isAuthoritative: true,
        breakdown: {
          title: 0,
          artist: 0,
          album: 0,
          year: 0,
          duration: 0,
          isrcOrMbid: 100,
          variantPenalty: 0,
          total: 100
        },
        reasons: ['mbid_exact_match'],
        why: 'Authoritative MBID Match'
      };
    }

    // 2. Authoritative Tier: ISRC Exact Match
    if (
      source.isrc &&
      target.isrc &&
      source.isrc.trim().toUpperCase() === target.isrc.trim().toUpperCase()
    ) {
      return {
        score: 100,
        confidence: 1.0,
        matchType: 'ISRC',
        isMatch: true,
        isAuthoritative: true,
        breakdown: {
          title: 0,
          artist: 0,
          album: 0,
          year: 0,
          duration: 0,
          isrcOrMbid: 100,
          variantPenalty: 0,
          total: 100
        },
        reasons: ['isrc_exact_match'],
        why: 'Authoritative ISRC Match'
      };
    }

    // Resolve effective titles (with useless placeholder fallback)
    const sourceTitle =
      MetadataNormalizer.isUselessTitle(source.title) && source.pathOrUri
        ? MetadataNormalizer.normalizeFilename(source.pathOrUri)
        : source.title;

    const targetTitle =
      MetadataNormalizer.isUselessTitle(target.title) && target.pathOrUri
        ? MetadataNormalizer.normalizeFilename(target.pathOrUri)
        : target.title;

    const normSourceTitle = MetadataNormalizer.normalizeTitle(sourceTitle);
    const normTargetTitle = MetadataNormalizer.normalizeTitle(targetTitle);

    // Title Scoring (Max 35 pts)
    let titleScore = 0;
    if (normSourceTitle && normTargetTitle) {
      if (normSourceTitle === normTargetTitle) {
        titleScore = 35;
        reasons.push('exact_title_match');
      } else if (
        normSourceTitle.includes(normTargetTitle) ||
        normTargetTitle.includes(normSourceTitle)
      ) {
        titleScore = 25;
        reasons.push('partial_title_match');
      } else {
        const sim = this.calculateSimilarity(normSourceTitle, normTargetTitle);
        if (sim >= 0.8) {
          titleScore = Math.round(sim * 30);
          reasons.push('fuzzy_title_match');
        }
      }
    }

    // Artist Scoring (Max 25 pts)
    const sourceArtists = source.artists
      .map((a) => MetadataNormalizer.normalizeArtist(a))
      .filter(Boolean);
    const targetArtists = target.artists
      .map((a) => MetadataNormalizer.normalizeArtist(a))
      .filter(Boolean);

    let artistScore = 0;
    if (sourceArtists.length > 0 && targetArtists.length > 0) {
      const primarySource = sourceArtists[0];
      const primaryTarget = targetArtists[0];

      if (primarySource === primaryTarget) {
        artistScore = 25;
        reasons.push('exact_artist_match');
      } else if (
        sourceArtists.some((sa) =>
          targetArtists.some((ta) => sa === ta || sa.includes(ta) || ta.includes(sa))
        )
      ) {
        artistScore = 20;
        reasons.push('shared_artist_match');
      } else {
        const sim = this.calculateSimilarity(primarySource, primaryTarget);
        if (sim >= 0.7) {
          artistScore = Math.round(sim * 20);
          reasons.push('fuzzy_artist_match');
        }
      }
    }

    // Album Scoring (Max 10 pts)
    let albumScore = 0;
    if (source.album && target.album) {
      const normSourceAlbum = MetadataNormalizer.normalizeAlbum(source.album);
      const normTargetAlbum = MetadataNormalizer.normalizeAlbum(target.album);

      if (normSourceAlbum && normTargetAlbum) {
        if (normSourceAlbum === normTargetAlbum) {
          albumScore = 10;
          reasons.push('exact_album_match');
        } else if (
          normSourceAlbum.includes(normTargetAlbum) ||
          normTargetAlbum.includes(normSourceAlbum)
        ) {
          albumScore = 7;
          reasons.push('partial_album_match');
        }
      }
    }

    // Year Scoring (Max 5 pts)
    let yearScore = 0;
    if (source.releaseYear && target.releaseYear) {
      const diff = Math.abs(source.releaseYear - target.releaseYear);
      if (diff === 0) {
        yearScore = 5;
        reasons.push('exact_year_match');
      } else if (diff <= 1) {
        yearScore = 3;
      }
    }

    // Duration Scoring (Max 30 pts)
    let durationScore = 0;
    let durationDiff: number | undefined;
    if (source.durationSecs !== undefined && target.durationSecs !== undefined) {
      durationDiff = Math.abs(source.durationSecs - target.durationSecs);
      for (const t of DURATION_THRESHOLDS) {
        if (durationDiff <= t.maxDiff) {
          durationScore = t.score;
          reasons.push(`duration_match_within_${t.maxDiff}s`);
          break;
        }
      }
    }

    // Variant Penalty Calculation
    let variantPenalty = 0;
    const sourceVariants = MetadataNormalizer.extractVariants(sourceTitle);
    const targetVariants = MetadataNormalizer.extractVariants(targetTitle);

    for (const variant of Object.keys(VARIANT_PENALTY_TABLE) as RecordingVariant[]) {
      const hasSource = sourceVariants.has(variant);
      const hasTarget = targetVariants.has(variant);
      if (hasSource !== hasTarget) {
        const penalty = VARIANT_PENALTY_TABLE[variant] ?? 25;
        variantPenalty += penalty;
        reasons.push(`variant_mismatch_${variant}`);
      }
    }
    variantPenalty = Math.min(variantPenalty, 60);

    const rawTotal =
      titleScore + artistScore + albumScore + yearScore + durationScore - variantPenalty;
    const finalScore = Math.max(0, Math.min(100, rawTotal));
    const confidence = Math.min(1.0, Math.max(0.0, finalScore / 100));

    const hasHardVariantConflict = variantPenalty >= 30;

    const isMatch = !hasHardVariantConflict && finalScore >= MIN_IDENTITY_MATCH_SCORE;
    const matchType: IdentityMatchType =
      !hasHardVariantConflict && finalScore >= 90 && titleScore >= 30 && artistScore >= 20
        ? 'HIGH_CONFIDENCE_METADATA'
        : isMatch
          ? 'FUZZY'
          : 'NONE';

    const whyParts: string[] = [];
    if (titleScore > 0) whyParts.push('Title');
    if (artistScore > 0) whyParts.push('Artist');
    if (albumScore > 0) whyParts.push('Album');
    if (durationScore > 0) whyParts.push('Duration');
    if (variantPenalty > 0) whyParts.push('Variant Penalty');

    const why = whyParts.length > 0 ? whyParts.join(' + ') : 'No Match';

    return {
      score: finalScore,
      confidence,
      matchType,
      isMatch,
      isAuthoritative: false,
      breakdown: {
        title: titleScore,
        artist: artistScore,
        album: albumScore,
        year: yearScore,
        duration: durationScore,
        isrcOrMbid: 0,
        variantPenalty,
        total: finalScore
      },
      reasons,
      why
    };
  }

  /**
   * Jaro-Winkler / Bigram similarity metric
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;

    const pairs1 = this.getBigrams(s1);
    const pairs2 = this.getBigrams(s2);

    if (pairs1.size === 0 || pairs2.size === 0) return 0.0;

    let intersection = 0;
    for (const [gram, count] of pairs1.entries()) {
      if (pairs2.has(gram)) {
        intersection += Math.min(count, pairs2.get(gram)!);
      }
    }

    const total =
      Array.from(pairs1.values()).reduce((a, b) => a + b, 0) +
      Array.from(pairs2.values()).reduce((a, b) => a + b, 0);

    return (2.0 * intersection) / total;
  }

  private static getBigrams(str: string): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const gram = str.substring(i, i + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  }
}
