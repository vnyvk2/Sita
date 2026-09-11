import { describe, expect, it } from 'vitest';

import {
  type DuplicateGroup,
  findDuplicateSongGroups,
  type SongInput
} from '../../../../../src/main/core/duplicates/songDuplicates';

function song(partial: Partial<SongInput> & Pick<SongInput, 'id'>): SongInput {
  return { title: 'Test Song', artist: 'Test Artist', durationSec: 200, ...partial };
}

function singleGroup(groups: readonly DuplicateGroup[]): DuplicateGroup {
  expect(groups).toHaveLength(1);
  const first = groups[0];
  if (first === undefined) throw new Error('expected exactly one group');
  return first;
}

describe('findDuplicateSongGroups — blocking gates', () => {
  it('groups exact duplicates across prefix noise (1-songName / 0-songName / songName)', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', title: '1-songName' }),
      song({ id: 'b', title: '0-songName' }),
      song({ id: 'c', title: 'songName' })
    ]);
    const group = singleGroup(groups);
    expect(group.category).toBe('EXACT_DUPLICATE');
    expect(group.songs.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('rejects pairs beyond the duration gate (full song vs 1:12 preview)', () => {
    expect(
      findDuplicateSongGroups([
        song({ id: 'a', title: 'Hello', artist: 'Adele', durationSec: 225 }),
        song({ id: 'b', title: 'Hello', artist: 'Adele', durationSec: 152 })
      ])
    ).toEqual([]);
  });

  it('classifies ≤ 2s deltas as EXACT and 2–5s deltas as PROBABLE', () => {
    const exact = findDuplicateSongGroups([
      song({ id: 'a', durationSec: 200 }),
      song({ id: 'b', durationSec: 201.5 })
    ]);
    expect(singleGroup(exact).category).toBe('EXACT_DUPLICATE');

    const probable = findDuplicateSongGroups([
      song({ id: 'a', durationSec: 200 }),
      song({ id: 'b', durationSec: 204.5 })
    ]);
    expect(singleGroup(probable).category).toBe('PROBABLE_DUPLICATE');
  });

  it('propagates the worst pair category through transitive merges', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', durationSec: 200, bitrateKbps: 128 }),
      song({ id: 'b', durationSec: 201.5, bitrateKbps: 320 }),
      song({ id: 'c', durationSec: 203, format: 'flac' })
    ]);
    const group = singleGroup(groups);
    expect(group.category).toBe('PROBABLE_DUPLICATE'); // a↔c delta 3s poisons the component
    expect(group.songs.map((s) => s.id)).toEqual(['c', 'b', 'a']); // quality ranking
    expect(group.recommendedKeepId).toBe('c');
  });
});

describe('findDuplicateSongGroups — artist gating', () => {
  it('same title, different artists → DISTINCT (Adele vs Lionel Richie)', () => {
    expect(
      findDuplicateSongGroups([
        song({ id: 'a', title: 'Hello', artist: 'Adele' }),
        song({ id: 'b', title: 'Hello', artist: 'Lionel Richie' })
      ])
    ).toEqual([]);
  });

  it('partial artist overlap → MANUAL_REVIEW, never a delete recommendation', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', artist: 'A. R. Rahman' }),
      song({ id: 'b', artist: 'A. R. Rahman, Rakshita Suresh' })
    ]);
    const group = singleGroup(groups);
    expect(group.category).toBe('MANUAL_REVIEW');
    expect(group.reasons).toContain('artist-set-mismatch');
    expect(group.recommendedKeepId).toBeNull();
  });

  it('featuring in the title unions with the artist tag', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', title: 'Starboy (feat. Daft Punk)', artist: 'The Weeknd' }),
      song({ id: 'b', title: 'Starboy', artist: 'The Weeknd, Daft Punk' })
    ]);
    expect(singleGroup(groups).category).toBe('EXACT_DUPLICATE');
  });

  it('missing artist metadata is excluded (conservative)', () => {
    expect(
      findDuplicateSongGroups([
        song({ id: 'a', title: 'Same Title', artist: '' }),
        song({ id: 'b', title: 'Same Title', artist: '' })
      ])
    ).toEqual([]);
  });

  it('artist normalization: "S. Thaman" === "s thaman"', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', artist: 'S. Thaman' }),
      song({ id: 'b', artist: 's thaman' })
    ]);
    expect(singleGroup(groups).category).toBe('EXACT_DUPLICATE');
  });
});

describe('findDuplicateSongGroups — part & variant guards', () => {
  it('okok part 1 vs okok part 2 → never duplicates', () => {
    expect(
      findDuplicateSongGroups([
        song({ id: 'a', title: 'okok part 1', artist: 'Thaman' }),
        song({ id: 'b', title: 'okok part 2', artist: 'Thaman' })
      ])
    ).toEqual([]);
  });

  it('one-sided part → MANUAL_REVIEW', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', title: 'okok part 1' }),
      song({ id: 'b', title: 'okok' })
    ]);
    const group = singleGroup(groups);
    expect(group.category).toBe('MANUAL_REVIEW');
    expect(group.reasons).toContain('one-sided-part');
  });

  it('version variants → ALTERNATIVE_VERSION without a keep recommendation', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', title: 'Coke Song' }),
      song({ id: 'b', title: 'Coke Song (Remix)' })
    ]);
    const group = singleGroup(groups);
    expect(group.category).toBe('ALTERNATIVE_VERSION');
    expect(group.recommendedKeepId).toBeNull();
  });

  it('merges version families transitively (original + remix + live)', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'a', title: 'Coke Song' }),
      song({ id: 'b', title: 'Coke Song (Remix)' }),
      song({ id: 'c', title: 'Coke Song (Live)' })
    ]);
    const group = singleGroup(groups);
    expect(group.category).toBe('ALTERNATIVE_VERSION');
    expect(group.songs.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a song can be in a duplicate group and a version family simultaneously', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'copy1', title: 'Coke Song', bitrateKbps: 320 }),
      song({ id: 'copy2', title: 'Coke Song', format: 'flac' }),
      song({ id: 'remix', title: 'Coke Song (Remix)', bitrateKbps: 320 })
    ]);
    expect(groups.map((g) => g.category)).toEqual(['EXACT_DUPLICATE', 'ALTERNATIVE_VERSION']);
    expect(groups[0]?.recommendedKeepId).toBe('copy2');
    expect(groups[0]?.songs.map((s) => s.id)).toEqual(['copy2', 'copy1']);
    expect(groups[1]?.songs.map((s) => s.id).sort()).toEqual(['copy1', 'copy2', 'remix']);
  });
});

describe('findDuplicateSongGroups — eligibility & quality', () => {
  it('excludes generic titles even when duration and artist match', () => {
    expect(
      findDuplicateSongGroups([song({ id: 'a', title: 'Track 01' }), song({ id: 'b', title: 'Track 01' })])
    ).toEqual([]);
  });

  it('excludes songs without a positive duration', () => {
    expect(
      findDuplicateSongGroups([song({ id: 'a', durationSec: null }), song({ id: 'b', durationSec: 0 })])
    ).toEqual([]);
  });

  it('recommends the highest-quality file (lossless > 320 > 128)', () => {
    const groups = findDuplicateSongGroups([
      song({ id: 'low', format: 'mp3', bitrateKbps: 128, fileSizeBytes: 4_800_000 }),
      song({ id: 'mid', format: 'mp3', bitrateKbps: 320, fileSizeBytes: 8_000_000 }),
      song({ id: 'best', format: 'flac', bitrateKbps: 900, sampleRateHz: 44_100, fileSizeBytes: 28_000_000 })
    ]);
    const group = singleGroup(groups);
    expect(group.recommendedKeepId).toBe('best');
    expect(group.songs.map((s) => s.id)).toEqual(['best', 'mid', 'low']);
    expect(group.songs.map((s) => s.normalized.base)).toEqual(['testsong', 'testsong', 'testsong']);
  });

  it('groupKey is stable and sorted for dismissal persistence', () => {
    const groups = findDuplicateSongGroups([song({ id: 'b', title: 'X Song' }), song({ id: 'a', title: 'X Song' })]);
    expect(singleGroup(groups).groupKey).toBe('a|b');
  });
});
