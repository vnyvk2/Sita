import { normalizeForMatching } from '../matching/normalizeForMatching';

export interface NormalizedQuery {
  rawTitle: string;
  cleanTitle: string;
  rawArtist?: string;
  cleanArtist?: string;
  isDeluxeRequested: boolean;
  isRemasterRequested: boolean;
  isLiveRequested: boolean;
  isCompilationRequested: boolean;
}

export class MetadataQueryNormalizer {
  private static readonly NOISE_PATTERNS = [
    // Remaster tags
    /\s*[\(\[]\s*(?:remastered|remaster|re-mastered|20\d\d remaster|19\d\d remaster)\s*[\)\]]/gi,
    // Explicit/Clean indicators
    /\s*[\(\[]\s*(?:explicit|clean)\s*[\)\]]/gi,
    // Featured artists
    /\s*[\(\[]\s*feat\.\s+[^\)\]]+[\)\]]/gi,
    /\s*[\(\[]\s*ft\.\s+[^\)\]]+[\)\]]/gi,
    // Edition suffixes — deluxe, expanded, anniversary, special, bonus, platinum, super deluxe
    /\s*[\(\[]\s*(?:deluxe|deluxe\s+edition|super\s+deluxe|expanded\s+edition|special\s+edition|anniversary\s+edition|platinum\s+edition|bonus\s+track(?:s)?(?:\s+edition)?|collector'?s?\s+edition|limited\s+edition)\s*[\)\]]/gi,
    // Standalone " - Deluxe Edition" or " - Remastered" without brackets
    /\s+-\s+(?:deluxe|deluxe\s+edition|remastered|expanded\s+edition|special\s+edition|anniversary\s+edition)\s*$/gi
  ];

  public static normalize(title: string, artist?: string): NormalizedQuery {
    const rawTitle = title ?? '';
    const rawArtist = artist ?? '';

    const lowerTitle = rawTitle.toLowerCase();
    const isDeluxeRequested =
      lowerTitle.includes('deluxe') ||
      lowerTitle.includes('expanded') ||
      lowerTitle.includes('bonus') ||
      lowerTitle.includes('platinum');
    const isRemasterRequested = lowerTitle.includes('remaster');
    const isLiveRequested = lowerTitle.includes('live') || lowerTitle.includes('concert');
    const isCompilationRequested =
      lowerTitle.includes('greatest hits') ||
      lowerTitle.includes('best of') ||
      lowerTitle.includes('anthology');

    let cleanTitle = rawTitle;
    for (const pattern of this.NOISE_PATTERNS) {
      cleanTitle = cleanTitle.replace(pattern, '');
    }

    cleanTitle = cleanTitle.trim();
    if (!cleanTitle) cleanTitle = rawTitle.trim();

    let cleanArtist = rawArtist;
    cleanArtist = cleanArtist.replace(/\s*[\(\[]\s*feat\.\s+[^\)\]]+[\)\]]/gi, '');
    cleanArtist = cleanArtist.replace(/\s*[\(\[]\s*ft\.\s+[^\)\]]+[\)\]]/gi, '');
    cleanArtist = cleanArtist.trim();

    return {
      rawTitle,
      cleanTitle,
      rawArtist: rawArtist || undefined,
      cleanArtist: cleanArtist || undefined,
      isDeluxeRequested,
      isRemasterRequested,
      isLiveRequested,
      isCompilationRequested
    };
  }

  public static compareStringSimilarity(strA?: string, strB?: string): number {
    if (!strA || !strB) return 0;
    const cleanA = normalizeForMatching(strA);
    const cleanB = normalizeForMatching(strB);

    if (!cleanA || !cleanB) return 0;
    if (cleanA === cleanB) return 1.0;

    return this.jaroWinklerDistance(cleanA, cleanB);
  }

  public static jaroWinklerDistance(s1: string, s2: string): number {
    if (s1.length === 0 || s2.length === 0) return 0;
    if (s1 === s2) return 1.0;

    const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let m = 0;
    for (let i = 0; i < s1.length; i++) {
      const low = Math.max(0, i - range);
      const high = Math.min(i + range + 1, s2.length);

      for (let j = low; j < high; j++) {
        if (!s2Matches[j] && s1[i] === s2[j]) {
          s1Matches[i] = true;
          s2Matches[j] = true;
          m++;
          break;
        }
      }
    }

    if (m === 0) return 0;

    let k = 0;
    let numTranspositions = 0;
    for (let i = 0; i < s1.length; i++) {
      if (s1Matches[i]) {
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) numTranspositions++;
        k++;
      }
    }

    const weight = (m / s1.length + m / s2.length + (m - numTranspositions / 2) / m) / 3;
    let prefix = 0;
    const p = 0.1;

    for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return weight + prefix * p * (1 - weight);
  }
}
