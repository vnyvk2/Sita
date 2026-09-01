/**
 * Match tier constants for Nora's search ranking system.
 *
 * Every search engine uses the same tiers. Results are sorted by tier (highest first), then by
 * pg_trgm similarity score within the same tier.
 *
 * Tier values are intentionally spaced to allow future tiers between them.
 */
export const MATCH_TIER = {
  NONE: 0,
  FUZZY: 1,
  METADATA: 2,
  CONTAINS: 3,
  WORD_PREFIX: 4,
  PREFIX: 5,
  EXACT: 6
} as const;

export type MatchTierValue = (typeof MATCH_TIER)[keyof typeof MATCH_TIER];

// ---------------------------------------------------------------------------
// Search limits — named constants, never hardcoded
// ---------------------------------------------------------------------------

export const SEARCH_LIMITS = {
  /** Limit for dedicated page search results (e.g. Songs tab) */
  PAGE: 250,
  /** Default limit for global search page results per entity */
  GLOBAL: 50,
  /** Limit for cross-metadata song results (artist/album name → songs) */
  METADATA: 20
} as const;

// ---------------------------------------------------------------------------
// Normalized query — computed once by the coordinator, shared to all engines
// ---------------------------------------------------------------------------

/** A pre-processed search query ready for SQL matching. */
export interface NormalizedQuery {
  /** Raw user input (trimmed) */
  original: string;
  /** Lowercased, punctuation stripped, whitespace collapsed */
  normalized: string;
  /** LIKE-safe version of normalized (%, _ escaped) */
  escaped: string;
}

// ---------------------------------------------------------------------------
// Engine options
// ---------------------------------------------------------------------------

/** Configures which metadata fields the song engine should search. */
export interface MetadataSearchOptions {
  artist?: boolean;
  album?: boolean;
  // Future: lyrics?: boolean; composer?: boolean; folder?: boolean;
}

/** Options passed to each search engine. */
export interface SearchEngineOptions {
  /** Enable pg_trgm fuzzy matching (tier 1). Default: true */
  fuzzy?: boolean;
  /** Max results to return. Default: SEARCH_LIMITS.GLOBAL */
  limit?: number;
  /**
   * Song-engine only: also search by related entity names. Pass an object to control which fields,
   * or undefined to disable.
   */
  metadata?: MetadataSearchOptions;
}

// ---------------------------------------------------------------------------
// Engine result — what every engine returns
// ---------------------------------------------------------------------------

/** A single search result paired with its match tier. */
export interface SearchMatch<T> {
  item: T;
  tier: MatchTierValue;
}
