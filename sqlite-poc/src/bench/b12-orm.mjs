// b12 — Drizzle ORM over node:sqlite (sqlite-proxy adapter): functional + perf check.
// Nora uses drizzle-orm/pglite everywhere; a migration that keeps drizzle would use
// sqlite-core + the sqlite-proxy driver over node:sqlite (drizzle-orm 0.45.2 has no
// native node:sqlite driver; 1.0.0-rc doesn't either — sqlite-proxy is the official path).
// Validates: select where/orderBy, insert, transaction + nested savepoint (drizzle-generated
// SAVEPOINT SQL), join, and measures ORM overhead vs raw engine calls.
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { SQLITE_DDL } from '../schema/sqlite-ddl.mjs';
import { PGLITE_DDL_FULL } from '../schema/pglite-ddl.mjs';
import { POC_ROOT, saveResults, envInfo, stats } from '../lib/util.mjs';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { eq, and, like, asc } from 'drizzle-orm';
import { performance } from 'node:perf_hooks';

const results = { functional: {} };

// ---- SQLite drizzle tables (sqlite-core)
const { sqliteTable, integer: sInt, text: sText, real: sReal } = await import('drizzle-orm/sqlite-core');
const songsSq = sqliteTable('songs', {
  id: sInt('id').primaryKey(),
  title: sText('title').notNull(),
  duration: sReal('duration').notNull(),
  year: sInt('year'),
  isFavorite: sInt('is_favorite').notNull().default(0),
  path: sText('path').notNull(),
  fileCreatedAt: sText('file_created_at'),
  fileModifiedAt: sText('file_modified_at')
});
const artistsSq = sqliteTable('artists', { id: sInt('id').primaryKey(), name: sText('name').notNull() });
const artistsSongsSq = sqliteTable('artists_songs', { artistId: sInt('artist_id').notNull(), songId: sInt('song_id').notNull() });

// ---- PGlite drizzle tables (pg-core — mirrors Nora's real usage)
const { pgTable, integer: pInt, text: pText, boolean: pBool, numeric: pNum, timestamp: pTs } = await import('drizzle-orm/pg-core');
const songsPg = pgTable('songs', {
  id: pInt('id').primaryKey(),
  title: pText('title').notNull(),
  duration: pNum('duration').notNull(),
  year: pInt('year'),
  isFavorite: pBool('is_favorite').notNull().default(false),
  path: pText('path').notNull(),
  fileCreatedAt: pTs('file_created_at', { mode: 'string' }),
  fileModifiedAt: pTs('file_modified_at', { mode: 'string' })
});
const artistsPg = pgTable('artists', { id: pInt('id').primaryKey(), name: pText('name').notNull() });
const artistsSongsPg = pgTable('artists_songs', { artistId: pInt('artist_id').notNull(), songId: pInt('song_id').notNull() });

// setup sqlite (raw seed — speed)
const sqPath = path.join(POC_ROOT, 'data', 'orm-sqlite.db');
rmSync(sqPath, { force: true });
rmSync(sqPath + '-wal', { force: true });
const sq = await openSqlite(sqPath, { ddl: SQLITE_DDL });
sq.tx((tx) => {
  tx.run(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, ['C:\\orm', 'ORM']);
  for (let i = 1; i <= 500; i++) tx.run(`INSERT INTO artists (name) VALUES (?)`, [`artist ${i}`]);
  for (let i = 1; i <= 5000; i++) {
    tx.run(
      `INSERT INTO songs (title, duration, path, is_favorite, year, folder_id, file_created_at, file_modified_at) VALUES (?,?,?,?,?,?,?,?)`,
      [`orm song ${i}`, 200.5, `C:\\orm\\${i}.mp3`, i % 10 === 0 ? 1 : 0, 2000 + (i % 30), 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
    );
    tx.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (?, ?)`, [1 + (i % 500), i]);
  }
});
const sqOrm = sq.orm;

// setup pglite (drizzle-pglite — exactly Nora's stack)
const pgDir = path.join(POC_ROOT, 'data', 'orm-pg');
rmSync(pgDir, { recursive: true, force: true });
const pg = await openPglite(pgDir, { ddl: PGLITE_DDL_FULL });
const pgOrm = (await import('drizzle-orm/pglite')).drizzle(pg.raw);
await pg.run(`INSERT INTO music_folders (path, name) VALUES ($1, $2)`, ['C:\\orm', 'ORM']);
await pg.tx(async (tx) => {
  for (let i = 1; i <= 500; i++) await tx.run(`INSERT INTO artists (name) VALUES ($1)`, [`artist ${i}`]);
  for (let i = 1; i <= 5000; i++) {
    await tx.run(
      `INSERT INTO songs (title, duration, path, is_favorite, year, folder_id, file_created_at, file_modified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [`orm song ${i}`, '200.5', `C:\\orm\\${i}.mp3`, i % 10 === 0, 2000 + (i % 30), 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
    );
    await tx.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES ($1, $2)`, [1 + (i % 500), i]);
  }
});

// ---------- functional checks ----------
// 1. select with where + orderBy
{
  const sqRows = await sqOrm.select({ id: songsSq.id, title: songsSq.title }).from(songsSq).where(and(eq(songsSq.isFavorite, 1), like(songsSq.title, 'orm song 4%'))).orderBy(asc(songsSq.title)).limit(10);
  const pgRows = await pgOrm.select({ id: songsPg.id, title: songsPg.title }).from(songsPg).where(and(eq(songsPg.isFavorite, true), like(songsPg.title, 'orm song 4%'))).orderBy(asc(songsPg.title)).limit(10);
  results.functional.selectWhereOrderBy = {
    sqlite: sqRows.length, pglite: pgRows.length,
    titlesMatch: JSON.stringify(sqRows.map((r) => r.title)) === JSON.stringify(pgRows.map((r) => r.title))
  };
}
// 2. join
{
  const sqRows = await sqOrm.select({ title: songsSq.title, artist: artistsSq.name }).from(artistsSongsSq).innerJoin(artistsSq, eq(artistsSq.id, artistsSongsSq.artistId)).innerJoin(songsSq, eq(songsSq.id, artistsSongsSq.songId)).where(eq(songsSq.id, 42)).limit(5);
  const pgRows = await pgOrm.select({ title: songsPg.title, artist: artistsPg.name }).from(artistsSongsPg).innerJoin(artistsPg, eq(artistsPg.id, artistsSongsPg.artistId)).innerJoin(songsPg, eq(songsPg.id, artistsSongsPg.songId)).where(eq(songsPg.id, 42)).limit(5);
  results.functional.join = {
    sqlite: sqRows, pglite: pgRows,
    match: JSON.stringify(sqRows.map((r) => [r.title, r.artist])) === JSON.stringify(pgRows.map((r) => [r.title, r.artist]))
  };
}
// 3. transaction + nested savepoint (drizzle-generated SAVEPOINT SQL — the songWorkerPool shape)
{
  let sqRolled = 0;
  await sqOrm.transaction(async (tx) => {
    await tx.insert(songsSq).values({ title: 'tx outer', duration: 100, path: 'C:\\orm\\tx-outer.mp3', year: 2024, fileCreatedAt: '2026-01-01T00:00:00.000Z', fileModifiedAt: '2026-01-01T00:00:00.000Z' });
    try {
      await tx.transaction(async (sp) => {
        await sp.insert(songsSq).values({ title: 'tx inner', duration: 100, path: 'C:\\orm\\tx-inner.mp3', year: 2024, fileCreatedAt: '2026-01-01T00:00:00.000Z', fileModifiedAt: '2026-01-01T00:00:00.000Z' });
        throw new Error('rollback inner');
      });
    } catch (e) {
      if (e.message.includes('rollback inner')) sqRolled++;
      else throw e;
    }
  });
  const sqInner = await sqOrm.select().from(songsSq).where(eq(songsSq.path, 'C:\\orm\\tx-inner.mp3'));
  const sqOuter = await sqOrm.select().from(songsSq).where(eq(songsSq.path, 'C:\\orm\\tx-outer.mp3'));

  let pgRolled = 0;
  await pgOrm.transaction(async (tx) => {
    await tx.insert(songsPg).values({ title: 'tx outer', duration: '100', path: 'C:\\orm\\tx-outer.mp3', year: 2024, fileCreatedAt: '2026-01-01T00:00:00.000Z', fileModifiedAt: '2026-01-01T00:00:00.000Z' });
    try {
      await tx.transaction(async (sp) => {
        await sp.insert(songsPg).values({ title: 'tx inner', duration: '100', path: 'C:\\orm\\tx-inner.mp3', year: 2024, fileCreatedAt: '2026-01-01T00:00:00.000Z', fileModifiedAt: '2026-01-01T00:00:00.000Z' });
        throw new Error('rollback inner');
      });
    } catch (e) {
      if (e.message.includes('rollback inner')) pgRolled++;
      else throw e;
    }
  });
  const pgInner = await pgOrm.select().from(songsPg).where(eq(songsPg.path, 'C:\\orm\\tx-inner.mp3'));
  const pgOuter = await pgOrm.select().from(songsPg).where(eq(songsPg.path, 'C:\\orm\\tx-outer.mp3'));

  results.functional.nestedSavepoint = {
    sqlite: { rolled: sqRolled, innerGone: sqInner.length === 0, outerSurvived: sqOuter.length === 1 },
    pglite: { rolled: pgRolled, innerGone: pgInner.length === 0, outerSurvived: pgOuter.length === 1 },
    equivalent: sqRolled === 1 && pgRolled === 1 && sqInner.length === 0 && pgInner.length === 0 && sqOuter.length === 1 && pgOuter.length === 1
  };
}
// 4. insert + returning
{
  const sqIns = await sqOrm.insert(songsSq).values({ title: 'orm ret', duration: 5, path: 'C:\\orm\\ret.mp3', year: 2025, fileCreatedAt: '2026-01-01T00:00:00.000Z', fileModifiedAt: '2026-01-01T00:00:00.000Z' }).returning({ id: songsSq.id });
  const pgIns = await pgOrm.insert(songsPg).values({ title: 'orm ret', duration: '5', path: 'C:\\orm\\ret.mp3', year: 2025, fileCreatedAt: '2026-01-01T00:00:00.000Z', fileModifiedAt: '2026-01-01T00:00:00.000Z' }).returning({ id: songsPg.id });
  results.functional.insertReturning = { sqliteId: sqIns[0]?.id, pgliteId: pgIns[0]?.id, bothReturned: !!sqIns[0]?.id && !!pgIns[0]?.id };
}
console.log('functional:', JSON.stringify(results.functional, null, 1));

// ---------- perf: ORM overhead ----------
const N = 100;
const bench = async (name, fn) => {
  results[name] = {};
  for (const [eng, orm] of [['sqlite', sqOrm], ['pglite', pgOrm]]) {
    const times = [];
    for (let i = 0; i < N; i++) times.push(await fn(orm, i));
    results[name][eng] = stats(times);
  }
  console.log(`${name}: sqlite med=${results[name].sqlite.median}ms pglite med=${results[name].pglite.median}ms`);
};

await bench('orm_pk_lookup', (orm, i) => sqlBench(orm, i));
async function sqlBench(orm, i) {
  const t0 = performance.now();
  if (orm === sqOrm) await orm.select().from(songsSq).where(eq(songsSq.id, (i % 5000) + 1));
  else await orm.select().from(songsPg).where(eq(songsPg.id, (i % 5000) + 1));
  return performance.now() - t0;
}

await bench('orm_filtered_list', async (orm, i) => {
  const t0 = performance.now();
  if (orm === sqOrm) await orm.select({ id: songsSq.id, title: songsSq.title }).from(songsSq).where(eq(songsSq.isFavorite, 1)).orderBy(asc(songsSq.title)).limit(200);
  else await orm.select({ id: songsPg.id, title: songsPg.title }).from(songsPg).where(eq(songsPg.isFavorite, true)).orderBy(asc(songsPg.title)).limit(200);
  return performance.now() - t0;
});

await bench('orm_join', async (orm, i) => {
  const t0 = performance.now();
  if (orm === sqOrm) await orm.select({ title: songsSq.title, artist: artistsSq.name }).from(artistsSongsSq).innerJoin(artistsSq, eq(artistsSq.id, artistsSongsSq.artistId)).innerJoin(songsSq, eq(songsSq.id, artistsSongsSq.songId)).where(eq(songsSq.id, (i % 5000) + 1));
  else await orm.select({ title: songsPg.title, artist: artistsPg.name }).from(artistsSongsPg).innerJoin(artistsPg, eq(artistsPg.id, artistsSongsPg.artistId)).innerJoin(songsPg, eq(songsPg.id, artistsSongsPg.songId)).where(eq(songsPg.id, (i % 5000) + 1));
  return performance.now() - t0;
});

await sq.close();
await pg.close();
await saveResults('orm', { env: envInfo(), results });
