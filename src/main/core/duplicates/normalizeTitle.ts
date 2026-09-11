/**
 * Semantic title normalizer for the duplicate-songs detection engine (Phase 1).
 *
 * Pure functions only — no database, no IPC, no filesystem access.
 *
 * Asymmetric error cost principle:
 * a false positive (two distinct songs flagged as duplicates) is catastrophic,
 * a false negative (one missed duplicate pair) is harmless.
 * Every ambiguous decision below deliberately favours NOT stripping / NOT matching.
 */

export type TitleRelation =
  | 'CANDIDATE'
  | 'ALTERNATIVE_VERSION'
  | 'MANUAL_REVIEW'
  | 'DISTINCT';

export type TitleSource = 'tag' | 'filename';

export interface NormalizeOptions {
  /**
   * Origin of the title. Bare-number prefixes (Tier C) are stripped only for
   * filename-derived titles — a tag-derived title IS the real title.
   */
  titleSource?: TitleSource;
  /** Track number from the file's metadata tag; validates Tier C stripping. */
  trackNo?: number | null;
}

export interface PartToken {
  /** Canonical part family, e.g. 'part', 'volume', 'side', 'disc'. */
  readonly type: string;
  /** Canonical numeric index as a string, e.g. '1' (from '1', 'I' or 'A'). */
  readonly index: string;
}

export interface NormalizedTitle {
  readonly raw: string;
  /** Normalized base title: prefixes, parts, variants and noise removed. */
  readonly base: string;
  readonly part: PartToken | null;
  /** Sorted canonical variant tags, e.g. ['acoustic', 'remix']. */
  readonly variants: string[];
  /** Featuring artists extracted from the title (consumed by Phase 2 artist gating). */
  readonly featuring: string[];
  /**
   * Placeholder titles ("Track 01", "Unknown") never participate in
   * deduplication — many files legitimately share such names.
   */
  readonly isGeneric: boolean;
}

// ---------------------------------------------------------------------------
// 1. Generic title guard
// ---------------------------------------------------------------------------

/** Whole-title placeholders, checked before prefix stripping. */
const GENERIC_TITLE_RE =
  /^(?:track|song|audio|video|untitled|unknown|no\s*title|title)\s*\d*\s*$/i;

/**
 * Base-word guard: a title that normalizes down to one of these words (plus
 * optional digits) is a placeholder. Deliberate trade-off: Blur's "Song 2" is
 * sacrificed here — that is the safe (false-negative) direction.
 */
const GENERIC_BASE_WORDS = new Set([
  'track',
  'song',
  'audio',
  'video',
  'untitled',
  'unknown',
  'title',
  'notitle',
  'unknowntitle',
  'lyrics',
  'lyric',
  'official',
  'jukebox'
]);

// ---------------------------------------------------------------------------
// 2. Web / rip noise
// ---------------------------------------------------------------------------

const FILE_EXTENSION_RE = /\.(?:mp3|flac|wav|m4a|ogg|opus|aac|wma|aiff?|alac)$/i;
const SITE_PREFIX_RE = /^\S+\.(?:com|net|org|io|in)\s*[-–—:]\s*/i;
const KBPS_RE = /\b\d{3,4}\s*kbps\b/gi;

/** Noise matched against the FULL content of a bracket segment. */
const NOISE_SEGMENT_RE =
  /^(?:official\s+(?:music\s+)?(?:video|audio|lyric\s*video)|(?:music\s+)?(?:video|audio)|lyrics?|lyric\s*video|visualizer|jukebox|full\s+(?:video|audio|song)|video\s+song|audio\s+song|hd|4k|uhd|1080p|720p|hq|sq|\d{3,4}\s*kbps|mp3|flac|wav|aac|ogg|m4a|opus|wma|ost|original\s+soundtrack)$/i;

/** Trailing bare words that are rip noise ("Song Name Lyrics"). */
const TRAILING_NOISE_WORDS = new Set([
  'lyrics',
  'lyric',
  'official',
  'video',
  'audio',
  'hd',
  'hq',
  '4k',
  'uhd',
  'jukebox'
]);
const TRAILING_NOISE_PHRASES = new Set([
  'video song',
  'audio song',
  'official video',
  'official audio',
  'music video',
  'lyric video',
  'full video',
  'full song',
  'full audio'
]);

// ---------------------------------------------------------------------------
// 3. Prefix stripping (3 tiers)
// ---------------------------------------------------------------------------

/**
 * Tier A — hard delimiter: "1-Song", "01 - Song", "1. Song", "01_Song",
 * "Track 03 - Song". The lookahead demands a letter, so purely numeric
 * titles ("1-800-273-8255", "3.14") are never stripped. A space is NOT a
 * valid delimiter, so "21 Guns" / "7 Years" survive.
 */
const TIER_A_PREFIX_RE = /^(?:track\s*|no\.\s*)?\d{1,3}\s*[-._]\s*(?=\p{L})/iu;

/**
 * Tier B — zero-padded: "01 Song", "007 Song". Real titles essentially never
 * zero-pad; "0 to 100" survives because at least two digits are required.
 */
const TIER_B_PREFIX_RE = /^(?:track\s*|no\.\s*)?0\d{1,2}\s+(?=\p{L})/iu;

/**
 * Tier C — bare "N Title" ("7 Years", "21 Guns"). NEVER stripped from
 * tag-derived titles; stripped from filename-derived titles only when the
 * leading number equals the file's track number tag.
 */
const TIER_C_PREFIX_RE = /^(\d{1,3})\s+(?=\p{L})/iu;

// ---------------------------------------------------------------------------
// 4. Part / sequel guard
// ---------------------------------------------------------------------------

const PART_TYPES: Readonly<Record<string, string>> = {
  part: 'part',
  pt: 'part',
  vol: 'volume',
  volume: 'volume',
  act: 'act',
  chapter: 'chapter',
  ch: 'chapter',
  episode: 'episode',
  ep: 'episode',
  movement: 'movement',
  mvmt: 'movement',
  side: 'side',
  disc: 'disc',
  disk: 'disc',
  cd: 'disc'
};

/**
 * "okok part 1" vs "okok part 2" must NEVER collide. Alternation is ordered
 * longest-first ("chapter" before "ch"). Tokens are validated after matching:
 * "mix" (shape-valid roman M+IX = 1009) is rejected by the index cap, and
 * spelled-out numbers ("Part One") simply fail to match — their words stay in
 * the base, so the pair resolves to a safe DISTINCT.
 */
const PART_RE =
  /\b(chapter|episode|movement|volume|disc|disk|part|side|mvmt|vol|act|ep|pt|ch|cd)\.?\s*(\d{1,4}|[ivxlcdm]+|[a-h])\b(?:\s*\/\s*\d{1,4})?/gi;

/** Strict roman-numeral shape; "Vol. V" parses, "dim" does not. */
const ROMAN_RE = /^m*(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;
const ROMAN_VALUES: Readonly<Record<string, number>> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000
};

/** Parts above this index are not real track parts — this rejects "mix" (1009). */
const MAX_PART_INDEX = 100;

function romanToNumber(token: string): number | null {
  if (!ROMAN_RE.test(token)) return null;
  let total = 0;
  for (let i = 0; i < token.length; i += 1) {
    const current = ROMAN_VALUES[token.charAt(i)] ?? 0;
    const next = ROMAN_VALUES[token.charAt(i + 1)] ?? 0;
    total += next > current ? -current : current;
  }
  return total > 0 ? total : null;
}

/** Canonicalizes '01'/'1' → '1' and 'A'/'I' → '1'-style indices; null if invalid. */
function parsePartIndex(token: string): string | null {
  const value = token.toLowerCase();
  if (/^\d{1,4}$/.test(value)) return String(Number.parseInt(value, 10));
  if (/^[a-h]$/.test(value)) return String(value.charCodeAt(0) - 96);
  const roman = romanToNumber(value);
  return roman !== null && roman <= MAX_PART_INDEX ? String(roman) : null;
}

// ---------------------------------------------------------------------------
// 5. Variant extraction (bracket-first)
// ---------------------------------------------------------------------------

const FEATURING_RE = /^(?:featuring|feat\.?|ft\.?|starring)\s*/i;
const BRACKET_RE = /[([{]([^()[\]{}]*)[)\]}]/g;

/**
 * Ordered phrase-first: "acoustic version" consumes both words so the generic
 * "version" pattern cannot double-fire. All patterns run ONLY on bracket
 * contents or trailing tails — never on the whole title — which is exactly
 * what keeps "Live and Let Die" safe.
 */
const VARIANT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bradio\s+(?:edit|version)\b/gi, 'radio-edit'],
  [/\bextended(?:\s+(?:mix|version|cut))?\b|\bfull\s+version\b/gi, 'extended'],
  [/\bfemale(?:\s+(?:version|vocals?))?\b/gi, 'female'],
  [/\bmale(?:\s+(?:version|vocals?))?\b/gi, 'male'],
  [/\bslowed(?:\s*\+\s*reverb)?\b/gi, 'slowed'],
  [/\bsped\s+up\b|\bspeed\s*up\b/gi, 'sped-up'],
  [/\bremaster(?:ed)?\b/gi, 'remastered'],
  [/\bremix(?:ed|es)?\b|\brmx\b|\bmix\b/gi, 'remix'],
  [/\bacoustic(?:\s+version)?\b/gi, 'acoustic'],
  [/\bunplugged\b/gi, 'unplugged'],
  [/\blive(?:\s+version)?\b/gi, 'live'],
  [/\binstrumental\b/gi, 'instrumental'],
  [/\bkaraoke\b/gi, 'karaoke'],
  [/\breverb\b/gi, 'reverb'],
  [/\bdemo\b/gi, 'demo'],
  [/\borchestral(?:\s+version)?\b/gi, 'orchestral'],
  [/\bmash\s*up\b|\bmashup\b/gi, 'mashup'],
  [/\bcover\b/gi, 'cover'],
  [/\bversion\b/gi, 'version']
];

interface VariantExtraction {
  variants: string[];
  /** Words that are not variant tags. Empty remainder ⇒ the text was pure variant. */
  remaining: string;
}

function extractVariants(text: string): VariantExtraction {
  const found = new Set<string>();
  let rest = text;
  for (const [pattern, canonical] of VARIANT_PATTERNS) {
    const replaced = rest.replace(pattern, ' ');
    if (replaced !== rest) {
      found.add(canonical);
      rest = replaced;
    }
  }
  return { variants: [...found].sort(), remaining: rest.replace(/\s+/g, ' ').trim() };
}

// ---------------------------------------------------------------------------
// 6. Trailing fallbacks
// ---------------------------------------------------------------------------

function stripTrailingNoise(text: string): string {
  let words = text.split(/\s+/).filter(Boolean);
  let pops = 0;
  while (words.length > 1 && pops < 3) {
    const last = words[words.length - 1] ?? '';
    const lastTwo = words.slice(-2).join(' ').toLowerCase();
    if (TRAILING_NOISE_PHRASES.has(lastTwo)) {
      words = words.slice(0, -2);
      pops += 2;
    } else if (TRAILING_NOISE_WORDS.has(last.toLowerCase())) {
      words = words.slice(0, -1);
      pops += 1;
    } else {
      break;
    }
  }
  return words.join(' ');
}

function stripTrailingVariant(text: string): { variants: string[]; rest: string } {
  // 1) a pure-variant tail after a spaced dash: "Song - Acoustic"
  const dashParts = text.split(/\s+[-–—]\s+/).filter(Boolean);
  if (dashParts.length > 1) {
    const tail = dashParts[dashParts.length - 1] ?? '';
    const { variants, remaining } = extractVariants(tail);
    if (tail !== '' && remaining === '') {
      return { variants, rest: dashParts.slice(0, -1).join(' ') };
    }
  }
  // 2) trailing words: "Song Name Remix" — at least one word always survives
  const words = text.split(/\s+/).filter(Boolean);
  for (let k = Math.min(3, words.length - 1); k >= 1; k -= 1) {
    const tail = words.slice(-k).join(' ');
    const { variants, remaining } = extractVariants(tail);
    if (variants.length > 0 && remaining === '') {
      return { variants, rest: words.slice(0, -k).join(' ') };
    }
  }
  return { variants: [], rest: text };
}

// ---------------------------------------------------------------------------
// 7. Comparison key
// ---------------------------------------------------------------------------

/**
 * Lower-cased, Latin diacritics folded, everything that is not a letter /
 * combining mark / digit removed.
 *
 * Telugu safety: combining vowel signs (ా, ి, ు …) are \p{M} and MUST be
 * kept — only the Latin diacritic range \u0300-\u036F is stripped, otherwise
 * distinct Telugu words would collapse into each other.
 */
function toBase(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function normalizeTitle(input: string, options: NormalizeOptions = {}): NormalizedTitle {
  const featuring: string[] = [];
  const variants: string[] = [];
  let part: PartToken | null = null;

  // 1) web / rip noise
  let working = input
    .trim()
    .replace(FILE_EXTENSION_RE, '')
    .replace(SITE_PREFIX_RE, '')
    .replace(KBPS_RE, ' ')
    .trim();

  // 2) generic guard — BEFORE prefix stripping, so "Track 01" alone is
  //    excluded while "Track 03 - Real Song" still gets its prefix stripped
  if (working === '' || GENERIC_TITLE_RE.test(working)) {
    return {
      raw: input,
      base: toBase(working),
      part: null,
      variants: [],
      featuring: [],
      isGeneric: true
    };
  }

  // 3) prefix stripping (Tier A → B → C)
  working = stripPrefix(working, options).trim();

  // 4) part / sequel extraction — runs on the full string (brackets included),
  //    so "Suite (Part 1)" also yields a part token
  for (const match of working.matchAll(PART_RE)) {
    const keyword = (match[1] ?? '').toLowerCase().replace(/\./g, '');
    const index = parsePartIndex(match[2] ?? '');
    const type = PART_TYPES[keyword];
    if (type !== undefined && index !== null) {
      part = { type, index };
      const start = match.index ?? 0;
      working = `${working.slice(0, start)} ${working.slice(start + match[0].length)}`;
      break;
    }
  }

  // 5) bracket segmentation (bracket-first variant extraction)
  working = working.replace(BRACKET_RE, (_full: string, inner: string): string => {
    const content = inner.trim();
    if (content === '' || NOISE_SEGMENT_RE.test(content)) return ' ';
    if (FEATURING_RE.test(content)) {
      const artist = content.replace(FEATURING_RE, '').trim();
      if (artist !== '') featuring.push(artist);
      return ' ';
    }
    const { variants: bracketVariants, remaining } = extractVariants(content);
    if (remaining === '') {
      variants.push(...bracketVariants);
      return ' ';
    }
    // Mixed content ("Live at Wembley", "Bit Song", "Male Vocal - Shreya") is
    // kept verbatim: dropping it could merge different recordings — the
    // asymmetric cost rule says never.
    return ` ${content} `;
  });

  // 6) trailing noise + trailing variant fallback
  working = stripTrailingNoise(working);
  const trailing = stripTrailingVariant(working);
  variants.push(...trailing.variants);
  working = trailing.rest;

  // 7) final key + second-stage generic check
  const base = toBase(working);
  const isGeneric = base === '' || GENERIC_BASE_WORDS.has(base.replace(/\d+/g, ''));

  return { raw: input, base, part, variants: [...new Set(variants)].sort(), featuring, isGeneric };
}

function stripPrefix(working: string, options: NormalizeOptions): string {
  // Tier A — hard delimiter
  const tierA = TIER_A_PREFIX_RE.exec(working);
  if (tierA !== null) return working.slice(tierA[0].length);

  // Tier B — zero-padded
  const tierB = TIER_B_PREFIX_RE.exec(working);
  if (tierB !== null) return working.slice(tierB[0].length);

  // Tier C — bare "N Title": filename-derived titles only, and the leading
  // number must equal the file's track number tag
  if (options.titleSource === 'filename' && typeof options.trackNo === 'number') {
    const bare = TIER_C_PREFIX_RE.exec(working);
    if (bare !== null && Number.parseInt(bare[1] ?? '', 10) === options.trackNo) {
      return working.slice(bare[0].length);
    }
  }
  return working;
}

export function compareNormalizedTitles(a: NormalizedTitle, b: NormalizedTitle): TitleRelation {
  if (a.isGeneric || b.isGeneric || a.base === '' || b.base === '') return 'DISTINCT';
  // Phase 1 uses exact base equality; fuzzy scoring arrives with Phase 2 gates.
  if (a.base !== b.base) return 'DISTINCT';

  // Part guard — the "okok part 1 vs part 2" rule (only reachable when the
  // bases already match, since the part token is removed from the base)
  if (a.part !== null && b.part !== null) {
    if (a.part.type !== b.part.type || a.part.index !== b.part.index) return 'DISTINCT';
  } else if (a.part !== null || b.part !== null) {
    return 'MANUAL_REVIEW'; // one-sided part: "okok part 1" vs "okok" — human decides
  }

  // Variant sets: identical → same-recording candidate; different → versions
  const sameVariants =
    a.variants.length === b.variants.length &&
    a.variants.every((v, i) => v === b.variants[i]);
  return sameVariants ? 'CANDIDATE' : 'ALTERNATIVE_VERSION';
}

export function compareTitles(
  titleA: string,
  titleB: string,
  optionsA: NormalizeOptions = {},
  optionsB: NormalizeOptions = {}
): TitleRelation {
  return compareNormalizedTitles(normalizeTitle(titleA, optionsA), normalizeTitle(titleB, optionsB));
}
