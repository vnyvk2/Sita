import type { Tag } from 'node-taglib-sharp';

const ISO_LANGUAGE_MAP: Record<string, string> = {
  tel: 'Telugu',
  te: 'Telugu',
  hin: 'Hindi',
  hi: 'Hindi',
  tam: 'Tamil',
  ta: 'Tamil',
  kan: 'Kannada',
  kn: 'Kannada',
  mal: 'Malayalam',
  ml: 'Malayalam',
  eng: 'English',
  en: 'English',
  pan: 'Punjabi',
  pa: 'Punjabi',
  ben: 'Bengali',
  bn: 'Bengali',
  mar: 'Marathi',
  mr: 'Marathi',
  guj: 'Gujarati',
  gu: 'Gujarati',
  jpn: 'Japanese',
  ja: 'Japanese',
  kor: 'Korean',
  ko: 'Korean',
  zho: 'Chinese',
  chi: 'Chinese',
  zh: 'Chinese',
  spa: 'Spanish',
  es: 'Spanish',
  fra: 'French',
  fre: 'French',
  fr: 'French',
  deu: 'German',
  ger: 'German',
  de: 'German',
  ita: 'Italian',
  it: 'Italian',
  rus: 'Russian',
  ru: 'Russian',
  ara: 'Arabic',
  ar: 'Arabic'
};

export const KNOWN_LANGUAGES: string[] = [
  'Telugu',
  'Hindi',
  'Tamil',
  'Kannada',
  'Malayalam',
  'English',
  'Punjabi',
  'Bengali',
  'Marathi',
  'Gujarati',
  'Japanese',
  'Korean',
  'Chinese',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Russian',
  'Arabic'
];

export function normalizeLanguageName(rawLang: string): string {
  const trimmed = rawLang.trim();
  const lower = trimmed.toLowerCase();
  if (ISO_LANGUAGE_MAP[lower]) {
    return ISO_LANGUAGE_MAP[lower];
  }
  const directMatch = KNOWN_LANGUAGES.find((lang) => lang.toLowerCase() === lower);
  if (directMatch) {
    return directMatch;
  }
  // If unknown code, return capitalized first letter string
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function extractLanguageFromTag(tag?: Tag | null): string | undefined {
  if (!tag) return undefined;
  const tagRecord = tag as unknown as Record<string, unknown>;
  const rawLanguages = Array.isArray(tagRecord.languages) ? tagRecord.languages[0] : undefined;
  const raw =
    (typeof rawLanguages === 'string' ? rawLanguages : undefined) ||
    (typeof tagRecord.language === 'string' ? tagRecord.language : undefined) ||
    (typeof tagRecord.lyricsLanguage === 'string' ? tagRecord.lyricsLanguage : undefined);

  if (raw && typeof raw === 'string' && raw.trim() !== '') {
    return normalizeLanguageName(raw);
  }
  return undefined;
}

export function extractLanguageFromPath(filePath: string): string | undefined {
  if (!filePath) return undefined;
  const segments = filePath.split(/[/\\]/);

  for (const segment of segments) {
    const cleanSegment = segment.trim().toLowerCase();
    for (const lang of KNOWN_LANGUAGES) {
      const langLower = lang.toLowerCase();
      // Exact match or folder name like "Telugu Songs", "Telugu_Hits", "Telugu-Music"
      const regex = new RegExp(`(^|[_\\-\\s])${langLower}([_\\-\\s]|$)`, 'i');
      if (regex.test(cleanSegment)) {
        return lang;
      }
    }
  }
  return undefined;
}

export function detectLanguageFromScript(
  title: string,
  artists: string[] = []
): string | undefined {
  const sample = `${title} ${artists.join(' ')}`;
  if (/[\u0C00-\u0C7F]/.test(sample)) return 'Telugu';
  if (/[\u0B80-\u0BFF]/.test(sample)) return 'Tamil';
  if (/[\u0900-\u097F]/.test(sample)) return 'Hindi'; // Devanagari script
  if (/[\u0C80-\u0CFF]/.test(sample)) return 'Kannada';
  if (/[\u0D00-\u0D7F]/.test(sample)) return 'Malayalam';
  if (/[\u0980-\u09FF]/.test(sample)) return 'Bengali';
  if (/[\u0A80-\u0AFF]/.test(sample)) return 'Gujarati';
  if (/[\u0A00-\u0A7F]/.test(sample)) return 'Punjabi'; // Gurmukhi script
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(sample)) return 'Korean'; // Hangul
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'Japanese'; // Hiragana & Katakana
  if (/[\u0600-\u06FF]/.test(sample)) return 'Arabic';
  if (/[\u0400-\u04FF]/.test(sample)) return 'Russian'; // Cyrillic
  return undefined;
}

/**
 * Executes the language detection pipeline with strict priority:
 * 1. Embedded audio file tags (ID3 TLAN, Vorbis LANGUAGE)
 * 2. Folder path check (/Telugu/, \Hindi\, etc.)
 * 3. Unicode script range check (Telugu, Tamil, Hindi, Korean, Japanese, etc.)
 * 4. Fallback: undefined (Unspecified)
 */
export function detectSongLanguage(
  tag?: Tag | null,
  filePath?: string,
  title?: string,
  artists: string[] = []
): string | undefined {
  // 1. Embedded Tag Check
  const tagLang = extractLanguageFromTag(tag);
  if (tagLang) return tagLang;

  // 2. Folder Path Check
  if (filePath) {
    const pathLang = extractLanguageFromPath(filePath);
    if (pathLang) return pathLang;
  }

  // 3. Unicode Script Range Check
  if (title) {
    const scriptLang = detectLanguageFromScript(title, artists);
    if (scriptLang) return scriptLang;
  }

  return undefined;
}
