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

  private static readonly FILENAME_AUDIO_TAGS_REGEX =
    /\[(320kbps|flac|lossless|24bit|v0|v2|128kbps|256kbps|aac|wav|mp3)\]|\((remastered\s*\d*|re-mastered\s*\d*|deluxe\s*edition)\)/gi;

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
   * Normalizes track title by stripping cosmetic noise (Official Video, Lyrics, etc.)
   * and stripping recording variants (Live, Acoustic, Remix, etc.) for pure title comparison.
   */
  public static normalizeTitle(title: string): string {
    if (!title) return '';

    let cleaned = title
      .replace(/[’']/g, '') // Smart quotes/apostrophes: don't -> dont, it's -> its
      .replace(this.COSMETIC_NOISE_REGEX, '')
      .replace(/\b(pt\.?|part)\b/gi, 'part')
      .replace(/\b(vol\.?|volume)\b/gi, 'volume')
      .replace(/\b(no\.?|number)\b/gi, 'number');

    for (const variant of this.RECORDING_VARIANTS) {
      const regex = new RegExp(`\\b${variant.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    return this.cleanWhitespace(cleaned);
  }

  /**
   * Dedicated filename normalizer stripping filename-specific track prefixes and quality tags.
   */
  public static normalizeFilename(filename: string): string {
    if (!filename) return '';

    let cleaned = filename
      .replace(/\.(mp3|flac|m4a|wav|aac|ogg|wma)$/i, '')
      .replace(/^(cd\d+[-_.\s]*)?(\d{1,3}[-_.\s]+|track[_\s]*\d+[-_.\s]*)+/i, '')
      .replace(this.FILENAME_AUDIO_TAGS_REGEX, '');

    return this.normalizeTitle(cleaned);
  }

  /**
   * Detects recording variants (Live, Acoustic, Demo, Remix, etc.) present in a string using word boundaries.
   */
  public static extractVariants(str: string): Set<RecordingVariant> {
    const variants = new Set<RecordingVariant>();
    if (!str) return variants;

    const lower = str.toLowerCase();
    for (const variant of this.RECORDING_VARIANTS) {
      const regex = new RegExp(`\\b${variant.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (regex.test(lower)) {
        variants.add(variant);
      }
    }
    return variants;
  }

  /**
   * Normalizes artist name, standardizing featuring/collaboration joiners and acronym punctuation.
   */
  public static normalizeArtist(artist: string): string {
    if (!artist) return '';

    let cleaned = artist
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(feat\.?|ft\.?|featuring|with|vs\.?|and|\+|x|×|,)\b/gi, ' ')
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
