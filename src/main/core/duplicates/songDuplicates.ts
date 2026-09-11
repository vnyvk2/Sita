/**
 * Duplicate song grouping engine (Phase 2, pure core).
 *
 * No database / IPC / filesystem imports — the DB adapter lives in
 * getSongDuplicateGroups.ts and maps rows onto SongInput.
 *
 * Pipeline: eligibility → duration blocking (±5s sliding window) →
 * per-pair gates (title relation, artist sets) → union-find grouping →
 * quality ranking. Every ambiguous outcome lands in MANUAL_REVIEW —
 * the engine never decides deletions for the user.
 */

import {
  compareNormalizedTitles,
  normalizeTitle,
  type NormalizedTitle,
  type PartToken,
  type TitleSource
} from './normalizeTitle';

export type SongId = string | number;

export interface SongInput {
  readonly id: SongId;
  readonly title: string;
  /** Raw artist string; multiple artists may be comma/&/feat-separated. */
  readonly artist: string;
  /** Duration in seconds. Non-positive durations are excluded (Phase 3 hash tier). */
  readonly durationSec: number | null;
  readonly trackNo?: number | null;
  /** 'tag' (default, conservative) or 'filename' — enables Tier C prefix stripping. */
  readonly titleSource?: TitleSource;
  // Quality metadata — used only for ranking / UI comparison.
  readonly format?: string | null;
  readonly bitrateKbps?: number | null;
  readonly sampleRateHz?: number | null;
  readonly fileSizeBytes?: number | null;
  readonly path?: string | null;
}

export type DuplicateCategory =
  | 'EXACT_DUPLICATE'
  | 'PROBABLE_DUPLICATE'
  | 'MANUAL_REVIEW'
  | 'ALTERNATIVE_VERSION';

export type ReviewReason = 'one-sided-part' | 'artist-set-mismatch';

export interface DuplicateSong {
  readonly id: SongId;
  readonly title: string;
  readonly artist: string;
  readonly path: string | null;
  readonly durationSec: number;
  readonly format: string | null;
  readonly bitrateKbps: number | null;
  readonly sampleRateHz: number | null;
  readonly fileSizeBytes: number | null;
  /** Normalization diagnostics for the UI diff view. */
  readonly normalized: Readonly<{ base: string; part: PartToken | null; variants: string[] }>;
}

export interface DuplicateGroup {
  readonly category: DuplicateCategory;
  /** Highest-quality song first. */
  readonly songs: readonly DuplicateSong[];
  /**
   * Only set for EXACT/PROBABLE groups — versions and review items never get
   * a delete recommendation (asymmetric cost principle).
   */
  readonly recommendedKeepId: SongId | null;
  readonly reasons: readonly ReviewReason[];
  /** Stable key (sorted member ids) for persisting dismissals via ignoredItems. */
  readonly groupKey: string;
}

/** Pair durations within this delta are still considered (the blocking window). */
export const MAX_DURATION_DELTA_SEC = 5;
/** Pair durations within this delta classify as EXACT instead of PROBABLE. */
export const EXACT_DURATION_TOLERANCE_SEC = 2;

type DupPairCategory = 'EXACT_DUPLICATE' | 'PROBABLE_DUPLICATE';

interface SongEntry {
  readonly song: SongInput;
  readonly norm: NormalizedTitle;
  readonly artists: ReadonlySet<string>;
  readonly duration: number;
}

const CATEGORY_RANK: Readonly<Record<DuplicateCategory, number>> = {
  EXACT_DUPLICATE: 0,
  PROBABLE_DUPLICATE: 1,
  MANUAL_REVIEW: 2,
  ALTERNATIVE_VERSION: 3
};

const LOSSLESS_FORMATS = new Set(['flac', 'wav', 'alac', 'aiff', 'aif', 'ape', 'wv', 'dsf', 'dff']);

/**
 * Splits multi-artist tags: "A. R. Rahman, Rakshita Suresh", "Simon & Garfunkel",
 * "A x B", "Florence + The Machine" … All groups are non-capturing so split()
 * returns only the artist names.
 */
const ARTIST_SEPARATOR_RE =
  /\s*(?:[,;+&\/×]|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b|\bvs\.?\b|\band\b|\bx\b)\s*/i;

/** Same folding as the title base: Latin diacritics out, Telugu \p{M} marks kept. */
function normalizeArtistName(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

function artistSet(artist: string, featuring: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const part of artist.split(ARTIST_SEPARATOR_RE)) {
    const normalized = normalizeArtistName(part);
    if (normalized !== '') set.add(normalized);
  }
  // Featuring artists extracted from the title ("Starboy (feat. Daft Punk)")
  // are unioned in so tag inconsistencies still match.
  for (const feat of featuring) {
    const normalized = normalizeArtistName(feat);
    if (normalized !== '') set.add(normalized);
  }
  return set;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function hasIntersection(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

function qualityScore(song: SongInput): number {
  let score = 0;
  const format = (song.format ?? '').toLowerCase();
  if (format !== '' && LOSSLESS_FORMATS.has(format)) score += 1_000_000;
  score += (song.bitrateKbps ?? 0) * 1_000;
  score += Math.floor((song.sampleRateHz ?? 0) / 100);
  score += Math.floor((song.fileSizeBytes ?? 0) / 100_000);
  return score;
}

function findRoot(parent: ReadonlyMap<string, string>, key: string): string {
  let root = key;
  for (let next = parent.get(root); next !== undefined; next = parent.get(root)) {
    root = next;
  }
  return root;
}

function unionRoots(parent: Map<string, string>, aKey: string, bKey: string): void {
  const rootA = findRoot(parent, aKey);
  const rootB = findRoot(parent, bKey);
  if (rootA !== rootB) parent.set(rootA, rootB);
}

function worsePairCategory(a: DupPairCategory, b: DupPairCategory): DupPairCategory {
  return a === 'PROBABLE_DUPLICATE' || b === 'PROBABLE_DUPLICATE'
    ? 'PROBABLE_DUPLICATE'
    : 'EXACT_DUPLICATE';
}

function toDuplicateSong(entry: SongEntry): DuplicateSong {
  const song = entry.song;
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    path: song.path ?? null,
    durationSec: entry.duration,
    format: song.format ?? null,
    bitrateKbps: song.bitrateKbps ?? null,
    sampleRateHz: song.sampleRateHz ?? null,
    fileSizeBytes: song.fileSizeBytes ?? null,
    normalized: {
      base: entry.norm.base,
      part: entry.norm.part,
      variants: [...entry.norm.variants]
    }
  };
}

function toGroup(
  category: DuplicateCategory,
  members: readonly SongEntry[],
  reasons: readonly ReviewReason[]
): DuplicateGroup {
  const ordered = [...members].sort(
    (x, y) =>
      qualityScore(y.song) - qualityScore(x.song) ||
      String(x.song.id).localeCompare(String(y.song.id))
  );
  const songs = ordered.map(toDuplicateSong);
  const recommendedKeepId =
    category === 'EXACT_DUPLICATE' || category === 'PROBABLE_DUPLICATE'
      ? (songs[0]?.id ?? null)
      : null;
  const groupKey = members
    .map((m) => String(m.song.id))
    .sort()
    .join('|');
  return { category, songs, recommendedKeepId, reasons, groupKey };
}

function collectComponents(
  parent: ReadonlyMap<string, string>,
  members: ReadonlySet<string>,
  entryById: ReadonlyMap<string, SongEntry>
): SongEntry[][] {
  const components = new Map<string, SongEntry[]>();
  for (const key of members) {
    const entry = entryById.get(key);
    if (entry === undefined) continue;
    const root = findRoot(parent, key);
    const list = components.get(root);
    if (list === undefined) components.set(root, [entry]);
    else list.push(entry);
  }
  return [...components.values()].filter((list) => list.length >= 2);
}

export function findDuplicateSongGroups(songs: readonly SongInput[]): DuplicateGroup[] {
  // 1) eligibility + normalize once (missing duration or generic title ⇒ out)
  const entries: SongEntry[] = [];
  const entryById = new Map<string, SongEntry>();
  for (const song of songs) {
    const duration = song.durationSec ?? 0;
    if (duration <= 0) continue;
    const norm = normalizeTitle(song.title, {
      titleSource: song.titleSource ?? 'tag',
      trackNo: song.trackNo ?? null
    });
    if (norm.isGeneric) continue;
    const entry: SongEntry = {
      song,
      norm,
      artists: artistSet(song.artist, norm.featuring),
      duration
    };
    entries.push(entry);
    entryById.set(String(song.id), entry);
  }

  // 2) duration blocking: sort once, then a sliding ±5s window
  entries.sort(
    (a, b) => a.duration - b.duration || String(a.song.id).localeCompare(String(b.song.id))
  );

  const dupParent = new Map<string, string>();
  const dupMembers = new Set<string>();
  const pairCategoryById = new Map<string, DupPairCategory>();
  const altParent = new Map<string, string>();
  const altMembers = new Set<string>();
  const manualPairs: Array<{ a: SongEntry; b: SongEntry; reason: ReviewReason }> = [];

  const addDupPair = (a: SongEntry, b: SongEntry, category: DupPairCategory): void => {
    const aKey = String(a.song.id);
    const bKey = String(b.song.id);
    unionRoots(dupParent, aKey, bKey);
    dupMembers.add(aKey);
    dupMembers.add(bKey);
    for (const key of [aKey, bKey]) {
      pairCategoryById.set(key, worsePairCategory(pairCategoryById.get(key) ?? category, category));
    }
  };

  const addAltPair = (a: SongEntry, b: SongEntry): void => {
    const aKey = String(a.song.id);
    const bKey = String(b.song.id);
    unionRoots(altParent, aKey, bKey);
    altMembers.add(aKey);
    altMembers.add(bKey);
  };

  // 3) pair evaluation — cheap gates first
  for (let i = 0; i < entries.length; i += 1) {
    const a = entries[i];
    if (a === undefined) break;
    for (let j = i + 1; j < entries.length; j += 1) {
      const b = entries[j];
      if (b === undefined) break;
      if (b.duration - a.duration > MAX_DURATION_DELTA_SEC) break;
      if (a.song.id === b.song.id) continue;

      const relation = compareNormalizedTitles(a.norm, b.norm);
      if (relation === 'DISTINCT') continue;

      // Disjoint artist sets (also covers missing-artist tags, conservatively)
      // ⇒ different recordings — never duplicates.
      if (!hasIntersection(a.artists, b.artists)) continue;

      if (relation === 'MANUAL_REVIEW') {
        manualPairs.push({ a, b, reason: 'one-sided-part' });
        continue;
      }
      if (!setsEqual(a.artists, b.artists)) {
        // Partial overlap ("A. R. Rahman" vs "A. R. Rahman, Rakshita Suresh")
        // — tag inconsistency, but too risky to auto-group.
        manualPairs.push({ a, b, reason: 'artist-set-mismatch' });
        continue;
      }
      if (relation === 'ALTERNATIVE_VERSION') {
        addAltPair(a, b);
        continue;
      }

      // CANDIDATE + equal artist sets + duration already inside the window
      const delta = Math.abs(a.duration - b.duration);
      addDupPair(
        a,
        b,
        delta <= EXACT_DURATION_TOLERANCE_SEC ? 'EXACT_DUPLICATE' : 'PROBABLE_DUPLICATE'
      );
    }
  }

  // 4) assemble groups — manual pairs stay as pairs (no transitive chaining,
  //    so one bad link can never merge unrelated songs into a review group)
  const groups: DuplicateGroup[] = [];
  for (const members of collectComponents(dupParent, dupMembers, entryById)) {
    const category = members.reduce<DupPairCategory>(
      (worst, m) => worsePairCategory(worst, pairCategoryById.get(String(m.song.id)) ?? 'EXACT_DUPLICATE'),
      'EXACT_DUPLICATE'
    );
    groups.push(toGroup(category, members, []));
  }
  for (const pair of manualPairs) {
    groups.push(toGroup('MANUAL_REVIEW', [pair.a, pair.b], [pair.reason]));
  }
  for (const members of collectComponents(altParent, altMembers, entryById)) {
    groups.push(toGroup('ALTERNATIVE_VERSION', members, []));
  }

  return groups.sort(
    (a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.groupKey.localeCompare(b.groupKey)
  );
}
