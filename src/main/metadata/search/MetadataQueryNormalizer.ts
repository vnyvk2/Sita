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
    /\s*[\(\[]\s*(?:deluxe|bonus|expanded|special|super deluxe|anniversary)\s+(?:edition|version|release)?\s*[\)\]]/gi,
    /\s*[\(\[]\s*(?:remastered|remaster|re-mastered|20\d\d remaster|19\d\d remaster)\s*[\)\]]/gi,
    /\s*[\(\[]\s*(?:explicit|clean)\s*[\)\]]/gi,
    /\s*[\(\[]\s*feat\.\s+[^\)\]]+[\)\]]/gi,
    /\s*[\(\[]\s*ft\.\s+[^\)\]]+[\)\]]/gi
  ];

  public static normalize(title: string, artist?: string): NormalizedQuery {
    const rawTitle = title ?? '';
    const rawArtist = artist ?? '';

    const lowerTitle = rawTitle.toLowerCase();
    const isDeluxeRequested = lowerTitle.includes('deluxe') || lowerTitle.includes('expanded') || lowerTitle.includes('bonus');
    const isRemasterRequested = lowerTitle.includes('remaster');
    const isLiveRequested = lowerTitle.includes('live') || lowerTitle.includes('concert');
    const isCompilationRequested = lowerTitle.includes('greatest hits') || lowerTitle.includes('best of') || lowerTitle.includes('anthology');

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
    const a = strA.toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = strB.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.85;

    // Dice coefficient for bigrams
    const bigramsA = this.getBigrams(a);
    const bigramsB = this.getBigrams(b);
    if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

    let intersection = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) intersection++;
    }

    return (2.0 * intersection) / (bigramsA.size + bigramsB.size);
  }

  private static getBigrams(str: string): Set<string> {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  }
}
