/**
 * Resolution (removal) flow for duplicate song groups — the destructive edge of the engine. Main
 * process only.
 *
 * Trust boundary rule: the renderer's selection is a REQUEST, never a command. The backend
 * re-computes groups, verifies every invariant, and only then touches the filesystem. Validation is
 * atomic — any violation rejects the whole request and NOTHING happens.
 */

import type { DuplicateCategory, DuplicateGroup, SongId } from './songDuplicates';

export type ResolutionMode = 'trash' | 'library-only';

/**
 * Categories the user may remove songs from. Version families are NEVER deletable — they are
 * different recordings, not duplicates.
 */
const RESOLVABLE_CATEGORIES: ReadonlySet<DuplicateCategory> = new Set([
  'EXACT_DUPLICATE',
  'PROBABLE_DUPLICATE',
  'MANUAL_REVIEW' // resolvable only because the user reviewed the flagged ambiguity
]);

export interface ResolveRequest {
  /** Song ids the user explicitly selected for removal. */
  readonly removeSongIds: readonly SongId[];
  readonly mode: ResolutionMode;
}

export interface ResolveDependencies {
  /** Fresh duplicate groups — always re-computed at resolve time, never cached from the UI. */
  readonly loadGroups: () => Promise<readonly DuplicateGroup[]>;
  /**
   * Must resolve once the file no longer exists on disk (trashed, or already missing — ENOENT
   * counts as success). Must reject for real failures so the DB row is kept and the song stays
   * playable.
   */
  readonly trashFile: (path: string) => Promise<void>;
  /** Removes songs from the library, reusing the existing removal mechanism. */
  readonly removeSongsFromLibrary: (ids: readonly SongId[]) => Promise<void>;
}

export interface ResolveResult {
  /** False ⇒ validation rejected the request and NOTHING happened. */
  readonly ok: boolean;
  readonly reason: string | null;
  readonly removed: readonly SongId[];
  readonly failed: readonly { songId: SongId; error: string }[];
}

export function isResolvableCategory(category: DuplicateCategory): boolean {
  return RESOLVABLE_CATEGORIES.has(category);
}

export async function resolveSongDuplicates(
  request: ResolveRequest,
  deps: ResolveDependencies
): Promise<ResolveResult> {
  const groups = await deps.loadGroups();

  // de-dupe the request while preserving the original id values
  const byKey = new Map<string, SongId>();
  for (const id of request.removeSongIds) byKey.set(String(id), id);
  const removal = [...byKey.values()];
  const removalKeys = new Set(byKey.keys());

  if (removalKeys.size === 0) {
    return { ok: true, reason: null, removed: [], failed: [] };
  }

  // --- validation (atomic) ---
  const resolvable = groups.filter((g) => isResolvableCategory(g.category));
  const memberKeys = new Set<string>();
  for (const group of resolvable) {
    for (const song of group.songs) memberKeys.add(String(song.id));
  }

  for (const key of removalKeys) {
    if (!memberKeys.has(key)) {
      return reject(`Song ${key} is not part of a confirmed or reviewed duplicate group.`);
    }
  }

  const affected = resolvable.filter((g) => g.songs.some((s) => removalKeys.has(String(s.id))));
  for (const group of affected) {
    const survivors = group.songs.filter((s) => !removalKeys.has(String(s.id)));
    if (survivors.length === 0) {
      const title = group.songs[0]?.title ?? 'unknown song';
      return reject(`Refusing to remove every copy of "${title}".`);
    }
  }

  // --- execution ---
  if (request.mode === 'library-only') {
    await deps.removeSongsFromLibrary(removal);
    return { ok: true, reason: null, removed: removal, failed: [] };
  }

  const pathByKey = new Map<string, string>();
  for (const group of resolvable) {
    for (const song of group.songs) {
      if (song.path != null) pathByKey.set(String(song.id), song.path);
    }
  }

  const removed: SongId[] = [];
  const failed: Array<{ songId: SongId; error: string }> = [];
  for (const id of removal) {
    const path = pathByKey.get(String(id));
    if (path === undefined) {
      failed.push({ songId: id, error: 'no file path on record' });
      continue;
    }
    try {
      await deps.trashFile(path);
      removed.push(id);
    } catch (error) {
      failed.push({
        songId: id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  // rows are removed only for files that are actually gone
  if (removed.length > 0) await deps.removeSongsFromLibrary(removed);
  return { ok: true, reason: null, removed, failed };
}

function reject(reason: string): ResolveResult {
  return { ok: false, reason, removed: [], failed: [] };
}
