import { describe, expect, it, vi } from 'vitest';
import { titleToBucket } from '../../../../../src/common/titleToBucket';
import { getFilteredSongLibraryIds } from '@main/db/queries/songs';

describe('getFilteredSongLibraryIds (A–Z Single-Pass Alphabet Map)', () => {
  const createMockTrx = (
    rows: Array<{ id: number; isBlacklisted: number; title: string }>
  ) => {
    const queryObj: any = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      toSQL: vi.fn().mockReturnValue({ sql: '', params: [] }),
      then: (resolve: any) => Promise.resolve(rows).then(resolve)
    };
    return {
      select: vi.fn().mockReturnValue(queryObj)
    } as any;
  };

  it('Property Check: All observed letters start on the correct bucket and never immediately follow the same bucket', async () => {
    const fixture = [
      { id: 1, isBlacklisted: 0, title: '#1 Song' },
      { id: 2, isBlacklisted: 0, title: '007 GoldenEye' },
      { id: 3, isBlacklisted: 0, title: 'Alone' },
      { id: 4, isBlacklisted: 0, title: 'Always' },
      { id: 5, isBlacklisted: 1, title: 'Animal' }, // Blacklisted song in-place
      { id: 6, isBlacklisted: 0, title: 'Bad Guy' },
      { id: 7, isBlacklisted: 0, title: 'Beautiful' },
      { id: 8, isBlacklisted: 0, title: 'Castle' },
      { id: 9, isBlacklisted: 0, title: 'Zombie' }
    ];

    const mockTrx = createMockTrx(fixture);
    const result = await getFilteredSongLibraryIds({ sortType: 'aToZ' }, mockTrx);

    expect(result.ids).toHaveLength(fixture.length);
    expect(result.total).toBe(fixture.length);
    expect(result.blacklistedIds).toEqual([5]);
    expect(result.alphabetMap).toBeDefined();
    expect(result.letterCounts).toBeDefined();

    const map = result.alphabetMap!;
    const counts = result.letterCounts!;

    // 1. Monotonicity check
    const offsets = Object.values(map);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }

    // 2. Sum check: sum(counts) === ids.length
    const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0);
    expect(totalCount).toBe(result.ids.length);

    // 3. Property-based round-trip check
    for (const [letter, start] of Object.entries(map)) {
      expect(titleToBucket(fixture[start].title)).toBe(letter);
      if (start > 0) {
        expect(titleToBucket(fixture[start - 1].title)).not.toBe(letter);
      }
    }

    // Specific expected offsets
    expect(map['#']).toBe(0); // '#1 Song' at 0
    expect(map['A']).toBe(2); // 'Alone' at 2
    expect(map['B']).toBe(5); // 'Bad Guy' at 5
    expect(map['C']).toBe(7); // 'Castle' at 7
    expect(map['Z']).toBe(8); // 'Zombie' at 8
  });

  it('Adversarial Fixtures: Handles leading spaces, tabs, symbols, emojis, and non-Latin correctly', async () => {
    const fixture = [
      { id: 10, isBlacklisted: 0, title: '   space start' }, // space-trimmed -> S
      { id: 11, isBlacklisted: 0, title: '\ttab start' },     // tab-trimmed -> T
      { id: 12, isBlacklisted: 0, title: '123 Number' },      // #
      { id: 13, isBlacklisted: 0, title: 'Élodie' },          // non-Latin -> #
      { id: 14, isBlacklisted: 0, title: '🔥 Fire' },         // emoji -> #
      { id: 15, isBlacklisted: 0, title: 'Alpha' },
      { id: 16, isBlacklisted: 0, title: 'Bravo' }
    ];

    const mockTrx = createMockTrx(fixture);
    const result = await getFilteredSongLibraryIds({ sortType: 'aToZ' }, mockTrx);

    expect(result.alphabetMap).toBeDefined();
    const map = result.alphabetMap!;

    // First occurrences are observed accurately without crashing
    for (const [letter, start] of Object.entries(map)) {
      expect(titleToBucket(fixture[start].title)).toBe(letter);
      if (start > 0) {
        expect(titleToBucket(fixture[start - 1].title)).not.toBe(letter);
      }
    }
  });

  it('zToA Reverse Stream: Verified on ASCII-only fixture and mixed fixture', async () => {
    // 1. Pure ASCII descending fixture: Z must be 0, # must be last
    const asciiDescFixture = [
      { id: 20, isBlacklisted: 0, title: 'Zoo' },
      { id: 21, isBlacklisted: 0, title: 'Yellow' },
      { id: 22, isBlacklisted: 0, title: 'Apple' },
      { id: 23, isBlacklisted: 0, title: '007' }
    ];

    const mockAsciiTrx = createMockTrx(asciiDescFixture);
    const asciiResult = await getFilteredSongLibraryIds({ sortType: 'zToA' }, mockAsciiTrx);

    expect(asciiResult.alphabetMap).toBeDefined();
    expect(asciiResult.alphabetMap!['Z']).toBe(0);
    expect(asciiResult.alphabetMap!['Y']).toBe(1);
    expect(asciiResult.alphabetMap!['A']).toBe(2);
    expect(asciiResult.alphabetMap!['#']).toBe(3);

    // 2. Mixed fixture: monotonicity and round-trip hold regardless of non-Latin ordering
    const mixedDescFixture = [
      { id: 30, isBlacklisted: 0, title: 'Élodie' }, // sorts before Z in Unicode DESC
      { id: 31, isBlacklisted: 0, title: 'Zebra' },
      { id: 32, isBlacklisted: 0, title: 'Alpha' }
    ];

    const mockMixedTrx = createMockTrx(mixedDescFixture);
    const mixedResult = await getFilteredSongLibraryIds({ sortType: 'zToA' }, mockMixedTrx);

    const map = mixedResult.alphabetMap!;
    for (const [letter, start] of Object.entries(map)) {
      expect(titleToBucket(mixedDescFixture[start].title)).toBe(letter);
      if (start > 0) {
        expect(titleToBucket(mixedDescFixture[start - 1].title)).not.toBe(letter);
      }
    }
  });

  it('Non-alphabetical sort orders omit alphabetMap (zero overhead)', async () => {
    const fixture = [
      { id: 1, isBlacklisted: 0, title: 'Song 1' },
      { id: 2, isBlacklisted: 0, title: 'Song 2' }
    ];

    const mockTrx = createMockTrx(fixture);
    const result = await getFilteredSongLibraryIds({ sortType: 'dateAddedDescending' }, mockTrx);

    expect(result.ids).toEqual([1, 2]);
    expect(result.alphabetMap).toBeUndefined();
    expect(result.letterCounts).toBeUndefined();
  });
});
