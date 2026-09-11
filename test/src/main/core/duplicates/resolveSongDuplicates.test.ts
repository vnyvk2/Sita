import { describe, expect, it } from 'vitest';

import {
  resolveSongDuplicates,
  type ResolveDependencies
} from '../../../../../src/main/core/duplicates/resolveSongDuplicates';
import type {
  DuplicateGroup,
  DuplicateSong
} from '../../../../../src/main/core/duplicates/songDuplicates';

function makeSong(id: number, overrides: Partial<DuplicateSong> = {}): DuplicateSong {
  return {
    id,
    title: 'Test Song',
    artist: 'Test Artist',
    path: `/music/song-${id}.mp3`,
    durationSec: 200,
    format: 'mp3',
    bitrateKbps: 320,
    sampleRateHz: 44_100,
    fileSizeBytes: null,
    normalized: { base: 'testsong', part: null, variants: [] },
    ...overrides
  };
}

function makeGroup(
  ids: number[],
  category: DuplicateGroup['category'] = 'EXACT_DUPLICATE'
): DuplicateGroup {
  const songs = ids.map((id) => makeSong(id));
  const recommended =
    category === 'EXACT_DUPLICATE' || category === 'PROBABLE_DUPLICATE'
      ? (songs[0]?.id ?? null)
      : null;
  return {
    category,
    songs,
    recommendedKeepId: recommended,
    reasons: [],
    groupKey: ids.map(String).sort().join('|')
  };
}

function makeDeps(
  groups: readonly DuplicateGroup[],
  failPaths: ReadonlySet<string> = new Set()
): { deps: ResolveDependencies; state: { trashed: string[]; removedIds: number[] } } {
  const state = { trashed: [] as string[], removedIds: [] as number[] };
  return {
    state,
    deps: {
      loadGroups: async () => groups,
      trashFile: async (path) => {
        if (failPaths.has(path)) throw new Error('EPERM: locked');
        state.trashed.push(path);
      },
      removeSongsFromLibrary: async (ids) => {
        state.removedIds.push(...(ids as number[]));
      }
    }
  };
}

describe('resolveSongDuplicates — validation (trust boundary)', () => {
  it('rejects ids outside any resolvable group — no filesystem or DB action', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2, 3])]);
    const result = await resolveSongDuplicates({ removeSongIds: [99], mode: 'trash' }, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not part of a confirmed');
    expect(state.trashed).toEqual([]);
    expect(state.removedIds).toEqual([]);
  });

  it('never removes from ALTERNATIVE_VERSION groups (versions are not duplicates)', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2], 'ALTERNATIVE_VERSION')]);
    const result = await resolveSongDuplicates({ removeSongIds: [2], mode: 'trash' }, deps);
    expect(result.ok).toBe(false);
    expect(state.removedIds).toEqual([]);
  });

  it('allows removal from MANUAL_REVIEW groups (the user confirmed the ambiguity)', async () => {
    const { deps } = makeDeps([makeGroup([1, 2], 'MANUAL_REVIEW')]);
    const result = await resolveSongDuplicates({ removeSongIds: [2], mode: 'library-only' }, deps);
    expect(result.ok).toBe(true);
    expect(result.removed).toEqual([2]);
  });

  it('refuses to remove every copy of a song', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2])]);
    const result = await resolveSongDuplicates(
      { removeSongIds: [1, 2], mode: 'library-only' },
      deps
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('every copy');
    expect(state.removedIds).toEqual([]);
  });

  it('multi-membership (manual pairs share a song): emptying one pair is rejected, disjoint removals are safe', async () => {
    // manual pairs {1,2} and {1,3} — song 1 appears in both review pairs
    const groups = [makeGroup([1, 2], 'MANUAL_REVIEW'), makeGroup([1, 3], 'MANUAL_REVIEW')];
    const rejected = await resolveSongDuplicates(
      { removeSongIds: [1, 2], mode: 'library-only' },
      makeDeps(groups).deps
    );
    expect(rejected.ok).toBe(false); // pair {1,2} would be emptied

    const safe = await resolveSongDuplicates(
      { removeSongIds: [2, 3], mode: 'library-only' },
      makeDeps(groups).deps
    );
    expect(safe.ok).toBe(true); // song 1 survives in both pairs
    expect(safe.removed).toEqual([2, 3]);
  });

  it('an empty request is a no-op', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2])]);
    const result = await resolveSongDuplicates({ removeSongIds: [], mode: 'trash' }, deps);
    expect(result.ok).toBe(true);
    expect(state.removedIds).toEqual([]);
  });

  it('deduplicates repeated ids in a request', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2])]);
    const result = await resolveSongDuplicates(
      { removeSongIds: [2, 2], mode: 'library-only' },
      deps
    );
    expect(result.removed).toEqual([2]);
    expect(state.removedIds).toEqual([2]);
  });
});

describe('resolveSongDuplicates — execution', () => {
  it('library-only mode removes rows without touching files', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2, 3])]);
    const result = await resolveSongDuplicates(
      { removeSongIds: [2, 3], mode: 'library-only' },
      deps
    );
    expect(result.ok).toBe(true);
    expect(state.trashed).toEqual([]);
    expect(state.removedIds).toEqual([2, 3]);
  });

  it('trash mode trashes the selected file, then removes its row', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2, 3])]);
    const result = await resolveSongDuplicates({ removeSongIds: [2], mode: 'trash' }, deps);
    expect(result.ok).toBe(true);
    expect(state.trashed).toEqual(['/music/song-2.mp3']);
    expect(state.removedIds).toEqual([2]);
  });

  it('a trash failure keeps the DB row (song stays playable) and is reported', async () => {
    const { deps, state } = makeDeps([makeGroup([1, 2, 3])], new Set(['/music/song-2.mp3']));
    const result = await resolveSongDuplicates({ removeSongIds: [2, 3], mode: 'trash' }, deps);
    expect(result.ok).toBe(true);
    expect(result.removed).toEqual([3]);
    expect(result.failed).toEqual([{ songId: 2, error: 'EPERM: locked' }]);
    expect(state.removedIds).toEqual([3]); // song 2 kept in the library
  });

  it('a song without a recorded path fails safely with no trash attempt', async () => {
    const group: DuplicateGroup = {
      category: 'EXACT_DUPLICATE',
      songs: [makeSong(1), makeSong(2, { path: null })],
      recommendedKeepId: 1,
      reasons: [],
      groupKey: '1|2'
    };
    const { deps, state } = makeDeps([group]);
    const result = await resolveSongDuplicates({ removeSongIds: [2], mode: 'trash' }, deps);
    expect(result.ok).toBe(true);
    expect(result.removed).toEqual([]);
    expect(result.failed).toEqual([{ songId: 2, error: 'no file path on record' }]);
    expect(state.trashed).toEqual([]);
    expect(state.removedIds).toEqual([]);
  });
});
