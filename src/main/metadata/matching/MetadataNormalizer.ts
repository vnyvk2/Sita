export type RecordingVariant =
  | 'live'
  | 'acoustic'
  | 'demo'
  | 'instrumental'
  | 'remix'
  | 'radio edit'
  | 'extended mix'
  | 'unplugged'
  | 'mono'
  | 'stereo'
  | 'session'
  | 'orchestral'
  | 'piano version';

export class MetadataNormalizer {
  private static readonly COSMETIC_NOISE_REGEX =
    /\b(official\s+)?(music\s+)?(audio|video|lyric\s+video|lyrics?|visualizer|hd|hq)\b/gi;

  private static readonly RECORDING_VARIANTS: RecordingVariant[] = [
    'live',
    'acoustic',
    'demo',
    'instrumental',
    'remix',
    'radio edit',
    'extended mix',
    'unplugged',
    'mono',
    'stereo',
    'session',
    'orchestral',
    'piano version'
  ];

  /**
   * Normalizes track title by removing cosmetic noise (Official Video, Audio, etc.)
   * and removing recording variants (Live, Acoustic, Remix, etc.) for pure title string comparison.
   */
  public static normalizeTitle(title: string): string {
    if (!title) return '';

    let cleaned = title
      .replace(/\.(mp3|flac|m4a|wav|aac|ogg|wma)$/i, '')
      .replace(/^(cd\d+[-_.\s]*)?(\d{1,3}[-_.\s]+|track\s*\d+[-_.\s]*)+/i, '')
      .replace(this.COSMETIC_NOISE_REGEX, '');

    for (const variant of this.RECORDING_VARIANTS) {
      const regex = new RegExp(`\\b${variant}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    cleaned = cleaned
      .replace(/[\(\)\[\]\{\}]/g, ' ')
      .replace(/[\-_._:]/g, ' ');

    return this.cleanWhitespace(cleaned);
  }

  /**
   * Detects recording variants (Live, Acoustic, Demo, Remix, etc.) present in a string.
   */
  public static extractVariants(str: string): Set<RecordingVariant> {
    const variants = new Set<RecordingVariant>();
    if (!str) return variants;

    const lower = str.toLowerCase();
    for (const variant of this.RECORDING_VARIANTS) {
      if (lower.includes(variant)) {
        variants.add(variant);
      }
    }
    return variants;
  }

  /**
   * Normalizes artist name, standardizing featuring joins and acronym punctuation.
   */
  public static normalizeArtist(artist: string): string {
    if (!artist) return '';

    let cleaned = artist
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(feat\.?|ft\.?|featuring|with|&|x|×|,)\b/gi, ' ')
      .replace(/\./g, '') // Strips acronym dots: A.R. Rahman -> ar rahman
      .replace(/[^a-z0-9]/g, ' ');

    return this.cleanWhitespace(cleaned);
  }

  /**
   * Normalizes album title.
   */
  public static normalizeAlbum(album: string): string {
    if (!album) return '';

    let cleaned = album
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(this.COSMETIC_NOISE_REGEX, '')
      .replace(/[^a-z0-9]/g, ' ');

    return this.cleanWhitespace(cleaned);
  }

  /**
   * Normalizes filename by stripping audio extensions and track number prefixes.
   */
  public static normalizeFilename(filename: string): string {
    return this.normalizeTitle(filename);
  }

  private static cleanWhitespace(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
