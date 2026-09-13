export const ISO_LANGUAGE_MAP: Record<string, string> = {
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

/**
 * Normalizes language strings:
 *
 * 1. Checks 2-letter or 3-letter ISO 639 codes (e.g. 'tel' -> 'Telugu', 'en' -> 'English')
 * 2. Case-insensitively matches against KNOWN_LANGUAGES (e.g. 'telugu' -> 'Telugu')
 * 3. Falls back to trimmed string with capitalized first letter (e.g. 'tulu' -> 'Tulu')
 */
export function normalizeLanguageName(rawLang?: string | null): string {
  if (!rawLang) return '';
  const trimmed = rawLang.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (ISO_LANGUAGE_MAP[lower]) {
    return ISO_LANGUAGE_MAP[lower];
  }
  const directMatch = KNOWN_LANGUAGES.find((lang) => lang.toLowerCase() === lower);
  if (directMatch) {
    return directMatch;
  }
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
