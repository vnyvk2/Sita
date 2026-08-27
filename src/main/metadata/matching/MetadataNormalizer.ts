import { normalizeForMatching } from './normalizeForMatching';

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
    /\b(official\s+)?(music\s+)?(audio|video|lyric\s+video|lyrics?|visualizer|hd|hq)\b|\b(\d{4}\s+)?re-?master(ed)?(\s*version)?\b|\b(deluxe\s+edition)\b/gi;

  private static readonly PARENTHETICAL_VARIANT_REGEX =
    /\s*[\(\[](live|acoustic|demo|instrumental|remix|radio edit|extended mix|unplugged|session|orchestral|piano version)(\s+(at|in|from|on)\s+[^)\]]+|\s+\d{4})?[\)\]]/gi;

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
   * Evaluates if a track title is missing or a useless placeholder (e.g. "Track 01", "Unknown", "Audio Track").
   */
  public static isUselessTitle(title?: string): boolean {
    if (!title || !title.trim()) return true;
    const lower = title.trim().toLowerCase();
    const uselessRegex = /^(track\s*\d*|audio\s*track|unknown(\s*title)?|untitled|song\s*\d*)$/i;
    return uselessRegex.test(lower);
  }

  /**
   * Normalizes track title by stripping cosmetic noise (Official Video, Lyrics, etc.)
   * and parenthetical variant markers while preserving meaningful tokens.
   */
  public static normalizeTitle(title: string): string {
    if (!title) return '';

    let cleaned = title
      .replace(/[’']/g, '') // Smart quotes/apostrophes: don't -> dont, it's -> its
      .replace(this.COSMETIC_NOISE_REGEX, '')
      .replace(this.PARENTHETICAL_VARIANT_REGEX, '')
      .replace(/\b(pt\.?|part)\b/gi, 'part')
      .replace(/\b(vol\.?|volume)\b/gi, 'volume')
      .replace(/\b(no\.?|number)\b/gi, 'number');

    for (const variant of this.RECORDING_VARIANTS) {
      const regex = new RegExp(`\\b${variant.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    return normalizeForMatching(cleaned);
  }

  /**
   * Dedicated filename normalizer stripping filename-specific track prefixes and quality tags.
   */
  public static normalizeFilename(filename: string): string {
    if (!filename) return '';

    // Strip directory paths (both forward and backward slashes)
    const baseName = filename.replace(/^.*[/\\]/, '');

    const cleaned = baseName
      .replace(/\.(mp3|flac|m4a|wav|aac|ogg|wma)$/i, '')
      .replace(/^(cd\d+[-_.\s]*)?(\d{1,3}[-_.\s]+|track[_\s]*\d+[-_.\s]*)+/i, '')
      .replace(this.FILENAME_AUDIO_TAGS_REGEX, '');

    return this.normalizeTitle(cleaned);
  }

  /**
   * Resolves the effective normalized track title, falling back to normalized filename if the title is useless.
   */
  public static getEffectiveTitle(identity: { title?: string; pathOrUri?: string }): string {
    if (this.isUselessTitle(identity?.title) && identity?.pathOrUri) {
      return this.normalizeFilename(identity.pathOrUri);
    }
    return identity?.title ? this.normalizeTitle(identity.title) : '';
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

    const cleaned = artist
      .replace(/\b(feat\.?|ft\.?|featuring|with|vs\.?|and|\+|x|×|,)\b/gi, ' ')
      .replace(/\./g, ''); // Strips acronym dots: A.R. Rahman -> ar rahman

    return normalizeForMatching(cleaned);
  }

  /**
   * Normalizes album title.
   */
  public static normalizeAlbum(album: string): string {
    if (!album) return '';

    const cleaned = album.replace(this.COSMETIC_NOISE_REGEX, '');

    return normalizeForMatching(cleaned);
  }
}
