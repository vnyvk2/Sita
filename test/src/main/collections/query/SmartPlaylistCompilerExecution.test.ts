import { eq } from 'drizzle-orm';

// Mock DB
vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});

import type { SmartPlaylistRuleAST } from '@common/collections/smartPlaylist';
import { SmartPlaylistCompiler } from '@main/collections/query/SmartPlaylistCompiler';
import { db } from '@main/db/db';
import { artists, artistsSongs, songs } from '@main/db/schema';

describe('SmartPlaylistCompiler SQLite Execution', () => {
  const compiler = new SmartPlaylistCompiler();

  beforeEach(async () => {
    await db.delete(artistsSongs);
    await db.delete(artists);
    await db.delete(songs);
  });

  afterEach(async () => {
    await db.delete(artistsSongs);
    await db.delete(artists);
    await db.delete(songs);
  });

  it('escapes %, _, and \\ in LIKE queries to prevent wildcard injection', async () => {
    const now = new Date();
    await db.insert(songs).values([
      {
        title: 'Song A (100% Hits)',
        path: '/music/a.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Song B (1000 Hits)',
        path: '/music/b.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Track_1 Special',
        path: '/music/c.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'TrackX1 Special',
        path: '/music/d.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Back\\Slash Track',
        path: '/music/e.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      }
    ]);

    // Test 1: % escape
    const percentRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'title', operator: 'contains', value: '100%' }]
    };
    const percentSql = compiler.compilePredicate(percentRule);
    const percentResults = await db.select({ title: songs.title }).from(songs).where(percentSql!);

    expect(percentResults.length).toBe(1);
    expect(percentResults[0].title).toBe('Song A (100% Hits)');

    // Test 2: _ escape
    const underscoreRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'Track_1' }]
    };
    const underscoreSql = compiler.compilePredicate(underscoreRule);
    const underscoreResults = await db
      .select({ title: songs.title })
      .from(songs)
      .where(underscoreSql!);

    expect(underscoreResults.length).toBe(1);
    expect(underscoreResults[0].title).toBe('Track_1 Special');

    // Test 3: \ escape
    const backslashRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'Back\\Slash' }]
    };
    const backslashSql = compiler.compilePredicate(backslashRule);
    const backslashResults = await db
      .select({ title: songs.title })
      .from(songs)
      .where(backslashSql!);

    expect(backslashResults.length).toBe(1);
    expect(backslashResults[0].title).toBe('Back\\Slash Track');
  });

  it('correctly handles skipCount and nullable fields (is_null / is_not_null)', async () => {
    const now = new Date();
    await db.insert(songs).values([
      {
        title: 'Never Skipped (default)',
        path: '/music/default.mp3',
        duration: 200,
        year: null,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Zero Skipped (0)',
        path: '/music/zero.mp3',
        duration: 200,
        skipCount: 0,
        year: 2021,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Skipped Once (1)',
        path: '/music/one.mp3',
        duration: 200,
        skipCount: 1,
        year: 1995,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Skipped Often (5)',
        path: '/music/five.mp3',
        duration: 200,
        skipCount: 5,
        year: null,
        fileCreatedAt: now,
        fileModifiedAt: now
      }
    ]);

    // Query 1: skipCount < 2 (user intent: songs rarely or never skipped)
    const rule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'skipCount', operator: 'lt', value: 2 }]
    };

    const predicate = compiler.compilePredicate(rule);
    const results = await db
      .select({ title: songs.title })
      .from(songs)
      .where(predicate!)
      .orderBy(songs.title);

    const titles = results.map((r) => r.title);
    expect(titles).toContain('Never Skipped (default)');
    expect(titles).toContain('Zero Skipped (0)');
    expect(titles).toContain('Skipped Once (1)');
    expect(titles).not.toContain('Skipped Often (5)');
    expect(results.length).toBe(3);

    // Query 2: year is_null
    const nullYearRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'year', operator: 'is_null' }]
    };
    const nullYearPredicate = compiler.compilePredicate(nullYearRule);
    const nullYearResults = await db
      .select({ title: songs.title })
      .from(songs)
      .where(nullYearPredicate!)
      .orderBy(songs.title);

    const nullYearTitles = nullYearResults.map((r) => r.title);
    expect(nullYearTitles).toEqual(['Never Skipped (default)', 'Skipped Often (5)']);
  });

  it('handles multi-artist songs deterministically with scalar aggregates in ORDER BY', async () => {
    const now = new Date();
    const [song1] = await db
      .insert(songs)
      .values({
        title: 'Track With Duo',
        path: '/music/duo.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [song2] = await db
      .insert(songs)
      .values({
        title: 'Track With Solo',
        path: '/music/solo.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [artistAlice] = await db.insert(artists).values({ name: 'Alice' }).returning();
    const [artistBob] = await db.insert(artists).values({ name: 'Bob' }).returning();
    const [artistZack] = await db.insert(artists).values({ name: 'Zack' }).returning();

    // Song 1 has Alice and Zack
    await db.insert(artistsSongs).values([
      { songId: song1.id, artistId: artistAlice.id },
      { songId: song1.id, artistId: artistZack.id }
    ]);

    // Song 2 has Bob
    await db.insert(artistsSongs).values([{ songId: song2.id, artistId: artistBob.id }]);

    // Order ASC: min(artists.name) -> Alice ('Track With Duo') comes before Bob ('Track With Solo')
    const ascOrder = compiler.compileOrderBy([{ field: 'artist', direction: 'asc' }]);
    const ascResults = await db
      .select({ id: songs.id, title: songs.title })
      .from(songs)
      .leftJoin(artistsSongs, eq(songs.id, artistsSongs.songId))
      .leftJoin(artists, eq(artistsSongs.artistId, artists.id))
      .groupBy(songs.id)
      .orderBy(...ascOrder);

    expect(ascResults[0].id).toBe(song1.id);
    expect(ascResults[1].id).toBe(song2.id);

    // Order DESC: max(artists.name) -> Zack ('Track With Duo') comes before Bob ('Track With Solo')
    const descOrder = compiler.compileOrderBy([{ field: 'artist', direction: 'desc' }]);
    const descResults = await db
      .select({ id: songs.id, title: songs.title })
      .from(songs)
      .leftJoin(artistsSongs, eq(songs.id, artistsSongs.songId))
      .leftJoin(artists, eq(artistsSongs.artistId, artists.id))
      .groupBy(songs.id)
      .orderBy(...descOrder);

    expect(descResults[0].id).toBe(song1.id);
    expect(descResults[1].id).toBe(song2.id);
  });

  it('handles NULL-safe semantics for neq and not_contains on nullable fields', async () => {
    const now = new Date();
    await db.insert(songs).values([
      {
        title: 'Song No Year',
        path: '/music/noyear.mp3',
        duration: 180,
        year: null,
        language: null,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Song 2020 English',
        path: '/music/2020en.mp3',
        duration: 180,
        year: 2020,
        language: 'English',
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Song 1999 French',
        path: '/music/1999fr.mp3',
        duration: 180,
        year: 1999,
        language: 'French',
        fileCreatedAt: now,
        fileModifiedAt: now
      }
    ]);

    // Test neq: year != 2020 should include 'Song No Year' (null) and 'Song 1999 French' (1999)
    const neqRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'year', operator: 'neq', value: 2020 }]
    };
    const neqPredicate = compiler.compilePredicate(neqRule);
    const neqResults = await db
      .select({ title: songs.title })
      .from(songs)
      .where(neqPredicate!)
      .orderBy(songs.title);

    const neqTitles = neqResults.map((r) => r.title);
    expect(neqTitles).toEqual(['Song 1999 French', 'Song No Year']);

    // Test not_contains: language not_contains 'Eng' should include 'Song No Year' (null) and 'Song 1999 French'
    const notContainsRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'language', operator: 'not_contains', value: 'Eng' }]
    };
    const notContainsPredicate = compiler.compilePredicate(notContainsRule);
    const notContainsResults = await db
      .select({ title: songs.title })
      .from(songs)
      .where(notContainsPredicate!)
      .orderBy(songs.title);

    const notContainsTitles = notContainsResults.map((r) => r.title);
    expect(notContainsTitles).toEqual(['Song 1999 French', 'Song No Year']);
  });

  it('handles boolean operators is_true and is_false using integer 1/0', async () => {
    const now = new Date();
    await db.insert(songs).values([
      {
        title: 'Favorite Track',
        path: '/music/fav.mp3',
        duration: 180,
        isFavorite: true,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Unfavorite Track',
        path: '/music/unfav.mp3',
        duration: 180,
        isFavorite: false,
        fileCreatedAt: now,
        fileModifiedAt: now
      }
    ]);

    const trueRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'isFavorite', operator: 'is_true' }]
    };
    const truePredicate = compiler.compilePredicate(trueRule);
    const trueResults = await db.select({ title: songs.title }).from(songs).where(truePredicate!);
    expect(trueResults.map((r) => r.title)).toEqual(['Favorite Track']);

    const falseRule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'isFavorite', operator: 'is_false' }]
    };
    const falsePredicate = compiler.compilePredicate(falseRule);
    const falseResults = await db.select({ title: songs.title }).from(songs).where(falsePredicate!);
    expect(falseResults.map((r) => r.title)).toEqual(['Unfavorite Track']);
  });
});
