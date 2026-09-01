import { normalizeForMatching } from '../metadata/matching/normalizeForMatching';

/**
 * Common metadata suffix patterns to strip when comparing track titles. Examples: - "Bohemian
 * Rhapsody (Remastered 2011)" -> "bohemian rhapsody" - "Hotel California - Live at the Forum" ->
 * "hotel california" - "Save Your Tears (feat. Ariana Grande) [Remix]" -> "save your tears" -
 * "Cruel Summer (Live from The Eras Tour)" -> "cruel summer"
 */
const TRACK_EXTRA_PATTERNS = [
  // Parentheses or brackets with remaster/live/deluxe/edit/version/mono/stereo/mix/bonus
  /\s*[\(\[](?:remaster(?:ed)?|live|deluxe|bonus|edit|radio edit|club mix|extended|acoustic|instrumental|album version|single version|original mix|mono|stereo|anniversary|expanded|explicit|clean|remix|version|\d{4}\s*remaster(?:ed)?).*?[\)\]]/gi,
  // Trailing hyphens/dashes with remaster/live/etc.
  /\s*-\s*(?:remaster(?:ed)?|live|deluxe|bonus|edit|radio edit|club mix|extended|acoustic|instrumental|album version|single version|original mix|mono|stereo|anniversary|expanded|explicit|clean|remix|version|\d{4}\s*remaster(?:ed)?).*$/gi,
  // Featuring patterns inside parentheses/brackets or after dash
  /\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+[^)\]]+[\)\]]/gi,
  /\s*-\s*(?:feat\.?|ft\.?|featuring)\s+.*$/gi,
  /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/gi
];

/**
 * Normalizes a track title by stripping noise, features, and version variants, then applying
 * canonical Unicode and punctuation normalization.
 */
export function normalizeTrackTitle(title?: string): string {
  if (!title) return '';

  let cleaned = title.trim();

  // Strip feature and version noise iteratively
  for (const pattern of TRACK_EXTRA_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Canonical punctuation & diacritic normalization
  const normalized = normalizeForMatching(cleaned);
  // If stripping left an empty string (e.g. title was just "Live"), fallback to original normalized
  return normalized || normalizeForMatching(title);
}

export interface LocalSongMatchCandidate {
  id: number;
  title: string;
  duration?: number; // in seconds
}

export interface LocalSongMatchResult {
  localSongId: number;
  confidence: 'exact' | 'fuzzy';
}

/**
 * Matches an online track against a list of local library songs for the same artist. Uses
 * normalized title matching and optional duration tolerance (±3s).
 */
export function matchOnlineTrackToLocalSong(
  onlineTitle: string,
  onlineDurationSec: number | undefined,
  localSongs: LocalSongMatchCandidate[]
): LocalSongMatchResult | null {
  const normOnline = normalizeTrackTitle(onlineTitle);
  if (!normOnline) return null;

  let bestMatch: { id: number; confidence: 'exact' | 'fuzzy'; durationDiff: number } | null = null;

  for (const song of localSongs) {
    const normLocal = normalizeTrackTitle(song.title);
    if (!normLocal) continue;

    if (normLocal === normOnline) {
      const durationDiff =
        onlineDurationSec && song.duration ? Math.abs(onlineDurationSec - song.duration) : 0;

      // Exact title match: <= 3s variance is exact confidence, > 3s is fuzzy confidence
      const confidence: 'exact' | 'fuzzy' =
        onlineDurationSec && song.duration && durationDiff > 3 ? 'fuzzy' : 'exact';

      if (!bestMatch || durationDiff < bestMatch.durationDiff) {
        bestMatch = { id: song.id, confidence, durationDiff };
      }
    }
  }

  if (bestMatch) {
    return {
      localSongId: bestMatch.id,
      confidence: bestMatch.confidence
    };
  }

  return null;
}

/**
 * Deduplicates a list of candidate tracks by normalized title, preserving the highest-ranked /
 * highest-playcount entry.
 */
export function deduplicateCandidateTracks<
  T extends { title: string; playcount?: number; listeners?: number }
>(tracks: T[]): T[] {
  const seenMap = new Map<string, T>();

  for (const track of tracks) {
    const norm = normalizeTrackTitle(track.title);
    if (!norm) continue;

    const existing = seenMap.get(norm);
    if (!existing) {
      seenMap.set(norm, track);
    } else {
      // If duplicate exists, keep the one with higher playcount/listeners
      const existingScore = (existing.playcount ?? 0) + (existing.listeners ?? 0);
      const currentScore = (track.playcount ?? 0) + (track.listeners ?? 0);
      if (currentScore > existingScore) {
        seenMap.set(norm, track);
      }
    }
  }

  return Array.from(seenMap.values());
}
