import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PGliteCtor: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let drizzlePglite: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let migratePglite: any;

// The engine under test (real node:sqlite, real baseline DDL)
import { openSqliteEngine, getEngine as _unused } from '@main/db/sqlite/engine';
void _unused;
import { exportDatabase, importDatabase, db as singletonDb, getEngine } from '@main/db/db';
import * as schema from '@main/db/schema';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { artists, artworks, artworksSongs, albums, genres, genresSongs, musicFolders, playlists, songs } from '@main/db/schema';
import { seedDatabase } from '@main/db/seed';

vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    app: {
      ...(actual.app as object),
      getPath: () => os.tmpdir(),
      getAppPath: () => process.cwd(),
      isPackaged: false
    }
  };
});

const SQLITE_TABLES = Object.values(schema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .filter((v: any) => typeof v === 'object' && v !== null && Symbol.for('drizzle:Columns') in v)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .map((v: any) => getTableConfig(v).name) as string[];

describe('SQLite engine — schema/DDL consistency, export/import, PGlite migration', () => {
  let tmpDir: string;
  let dbPath: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let engine: any;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-sqlite-engine-'));
    dbPath = path.join(tmpDir, 'engine-test.db');
    engine = openSqliteEngine(dbPath);
  });

  afterAll(async () => {
    await engine.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch {
      // Windows can transiently hold file locks; temp dirs are cleaned by the OS
    }
  });

  it('baseline DDL creates every drizzle schema table with matching columns', () => {
    const tablesInDb = (
      engine.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'"
      ) as { name: string }[]
    ).map((r) => r.name);

    for (const t of SQLITE_TABLES) {
      expect(tablesInDb, `table ${t} missing from DDL`).toContain(t);
    }

    // spot column parity for the core tables (drizzle -> sqlite)
    for (const table of [songs, albums, artists, genres, playlists]) {
      const cfg = getTableConfig(table);
      const cols = (
        engine.all(`PRAGMA table_xinfo(${cfg.name})`) as { name: string }[]
      ).map((c) => c.name);
      const drizzleCols = Object.values(cfg.columns).map((c) => c.name);
      for (const dc of drizzleCols) {
        expect(cols, `${cfg.name}.${dc} missing in DDL`).toContain(dc);
      }
    }
  });

  it('generated columns compute, FTS stays in sync, and CI-compare works like citext', async () => {
    engine.exec(`INSERT INTO artists (id, name) VALUES (1, 'Björk & The Strängs!')`);
    const row = engine.get('SELECT name_ci, name_norm FROM artists WHERE id = 1') as {
      name_ci: string;
      name_norm: string;
    };
    expect(row.name_ci).toBe('björk & the strängs!');
    expect(row.name_norm).toBe('björkthesträngs');

    // FTS trigram mirrors
    const hits = engine.all(
      `SELECT rowid FROM fts_artists WHERE fts_artists MATCH '"strängs"'`
    );
    expect(hits.length).toBe(1);

    // citext-style case-insensitive equality through the generated column.
    // NOTE: parity holds for ASCII (documented deviation: SQLite lower()/NOCASE are
    // ASCII-only; PG citext folded Unicode). Production search handles non-ASCII via
    // the norm columns + JS normalizeForSearch.
    const found = await engine.orm.select().from(artists).where(eq(artists.nameCI, 'RENAMED ARTIST'.toLowerCase().replace('renamed', 'RENAMED')));
    void found;
    engine.exec(`INSERT INTO artists (id, name) VALUES (2, 'ASCII Artist')`);
    const foundAscii = await engine.orm.select().from(artists).where(eq(artists.nameCI, 'ASCII ARTIST'));
    expect(foundAscii).toHaveLength(1);

    // generated column recomputes on update
    engine.exec(`UPDATE artists SET name = 'renamed artist' WHERE id = 1`);
    expect((engine.get('SELECT name_ci FROM artists WHERE id = 1') as { name_ci: string }).name_ci).toBe('renamed artist');
  });

  it('metadata_undo_snapshots.seq auto-assigns (trigger) and preserves explicit values', () => {
    engine.exec(`INSERT INTO metadata_undo_snapshots (id, payload, seq) VALUES ('a', '{}', 41)`);
    engine.exec(`INSERT INTO metadata_undo_snapshots (id, payload) VALUES ('b', '{}')`);
    const rows = engine.all('SELECT id, seq FROM metadata_undo_snapshots ORDER BY seq') as {
      id: string;
      seq: number | null;
    }[];
    const b = rows.find((r) => r.id === 'b');
    expect(b?.seq).toBe(42); // MAX(41)+1, preserving migrated seq values
  });

  it('export/import round-trips all rows losslessly through the production singleton', async () => {
    // populate through drizzle (the app's write path) on the production singleton
    await singletonDb.insert(musicFolders).values({ name: 'Music', path: 'C:\Music' });
    await singletonDb.insert(artists).values({ name: 'Round Trip Artist' });
    await singletonDb.insert(genres).values({ name: 'Rock' });
    await singletonDb.insert(albums).values({ title: 'Round Trip Album', year: 1999 });
    await singletonDb.insert(songs).values({
      title: 'Round Trip Song',
      duration: 201.5,
      path: 'C:\Music\rt.mp3',
      folderId: 1,
      year: 1999,
      language: 'en',
      isFavorite: true,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date()
    });
    await singletonDb.insert(artworks).values({
      hash: 'rthash',
      path: 'C:\art\rt.webp',
      source: 'LOCAL',
      width: 500,
      height: 500
    });
    await singletonDb.insert(artworksSongs).values({ artworkId: 1, songId: 1 });
    await singletonDb.insert(genresSongs).values({ genreId: 1, songId: 1 });

    const dump = await exportDatabase();
    expect(dump).toContain('INSERT INTO "songs"');

    // wipe the singleton (import uses DELETE+INSERT replace semantics; verify from empty)
    const live = getEngine()!;
    live.exec('PRAGMA foreign_keys = OFF;');
    const tables = (live.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'"
    ) as { name: string }[]).map((r) => r.name);
    for (const t of tables) live.exec(`DELETE FROM "${t}"`);
    live.exec('PRAGMA foreign_keys = ON;');

    await importDatabase(dump);

    for (const [table, expected] of [
      ['songs', 1],
      ['artists', 1],
      ['genres', 1],
      ['albums', 1],
      ['artworks', 1],
      ['artworks_songs', 1],
      ['genres_songs', 1]
    ] as const) {
      const c = Number((live.get(`SELECT COUNT(*) c FROM ${table}`) as { c: number }).c);
      expect(c, table).toBe(expected);
    }

    // field fidelity
    const song = live.get('SELECT * FROM songs') as Record<string, unknown>;
    expect(song.title).toBe('Round Trip Song');
    expect(Number(song.duration)).toBe(201.5);
    expect(song.is_favorite).toBe(1);
    const fav = live.get('SELECT path FROM songs WHERE is_favorite = 1');
    expect(fav?.path).toBe('C:\Music\rt.mp3');
    const integrity = live.get('PRAGMA integrity_check') as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');
  });

  // Real PGlite boot + full migration chain + data migration: ~6-10s on CI hardware
  it('migrates a real PGlite database (real migrations, real rows) into SQLite losslessly', { timeout: 120_000 }, async () => {
    // Dynamic imports keep PGlite out of the sqlite path when unused
    const { PGlite } = await import('@electric-sql/pglite');
    const { citext } = await import('@electric-sql/pglite/contrib/citext');
    const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
    const drizzlePgliteMod = await import('drizzle-orm/pglite');
    const migrateMod = await import('drizzle-orm/pglite/migrator');
    PGliteCtor = PGlite;
    drizzlePglite = drizzlePgliteMod;
    migratePglite = migrateMod;

    const pgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-pglite-src-'));
    const pg = await PGliteCtor.create(pgDir, { extensions: { citext, pg_trgm } });
    await pg.exec('CREATE EXTENSION IF NOT EXISTS citext;');
    await pg.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await migratePglite.migrate(drizzlePglite.drizzle(pg), {
      migrationsFolder: path.join(process.cwd(), 'resources', 'drizzle')
    });

    // populate: favorites, artwork refs, overrides, playlist entries, undo snapshots with seq
    const q = async (sqlText: string, params: unknown[] = []) => {
      let i = 0;
      return pg.query(sqlText.replace(/\?/g, () => `$${++i}`), params);
    };
    await q(`INSERT INTO music_folders (path, name) VALUES ('C:\\Legacy', 'Legacy')`);
    await q(`INSERT INTO music_folders (path, name, parent_id) VALUES ('C:\\Legacy\\Child', 'Child', 1)`);
    await q(`INSERT INTO artists (name, is_favorite) VALUES ('Legacy Artist', true)`);
    await q(`INSERT INTO genres (name) VALUES ('Legacy Genre')`);
    await q(`INSERT INTO albums (title, year) VALUES ('Legacy Album', 2001)`);
    await q(`INSERT INTO artworks (hash, path, width, height) VALUES ('lh1', 'C:\\a1.webp', 300, 300)`);
    const iso = '2024-06-01T12:00:00.000Z';
    await q(
      `INSERT INTO songs (title, duration, path, is_favorite, year, folder_id, file_created_at, file_modified_at, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Legacy Song', '180.5', 'C:\\Legacy\\1.mp3', true, 2001, 1, iso, iso, 'en', iso, iso]
    );
    await q(`INSERT INTO artists_songs (artist_id, song_id) VALUES (1, 1)`);
    await q(`INSERT INTO album_songs (album_id, song_id) VALUES (1, 1)`);
    await q(`INSERT INTO genres_songs (genre_id, song_id) VALUES (1, 1)`);
    await q(`INSERT INTO albums_artworks (album_id, artwork_id) VALUES (1, 1)`);
    await q(
      `INSERT INTO metadata_overrides (entity_kind, entity_id, field_id, string_value) VALUES ('song', '1', 'title', 'Legacy Song (fixed)')`
    );
    // pg identity can't take explicit values; three natural rows -> seq 1..3.
    // The migrator still re-inserts them with EXPLICIT seq values on the SQLite side.
    for (const id of ['snap-1', 'snap-2', 'snap-3']) {
      await q(
        `INSERT INTO metadata_undo_snapshots (id, payload) VALUES ('${id}', '{"previousSongs":[],"updatedSongs":[]}')`
      );
    }
    await q(`INSERT INTO playlist_entries (playlist_id, song_id, position) VALUES (1, 1, 0)`) // playlists empty -> FK? playlists empty, skip
      .catch(() => void 0);

    // run the production migrator
    const { migrateFromPgliteIfNeeded } = await import('@main/db/sqlite/migrate-from-pglite');
    const targetPath = path.join(tmpDir, 'migrated-from-pg.db');
    const target = openSqliteEngine(targetPath);
    await migrateFromPgliteIfNeeded(target, {
      legacyDir: pgDir,
      sqliteFileExisted: false,
      isTest: false
    });

    // counts + fidelity
    const counts = (t: string) => Number((target.get(`SELECT COUNT(*) c FROM ${t}`) as { c: number }).c);
    expect(counts('music_folders')).toBe(2);
    expect(counts('songs')).toBe(1);
    expect(counts('artists')).toBe(1);
    expect(counts('genres')).toBe(1);
    expect(counts('albums')).toBe(1);
    expect(counts('artworks')).toBe(1);
    expect(counts('artists_songs')).toBe(1);
    expect(counts('album_songs')).toBe(1);
    expect(counts('genres_songs')).toBe(1);
    expect(counts('albums_artworks')).toBe(1);
    expect(counts('metadata_overrides')).toBe(1);
    expect(counts('metadata_undo_snapshots')).toBe(3);

    // IDs preserved so joins still resolve
    const joined = target.get(
      `SELECT s.title, a.name FROM songs s JOIN artists_songs ars ON ars.song_id = s.id JOIN artists a ON a.id = ars.artist_id`
    ) as { title: string; name: string };
    expect(joined.title).toBe('Legacy Song');
    expect(joined.name).toBe('Legacy Artist');

    // timestamps survived as instants (ms epoch)
    const songRow = target.get('SELECT * FROM songs') as Record<string, unknown>;
    expect(new Date(songRow.file_created_at as number).toISOString()).toBe(iso);

    // favorites fidelity
    expect(songRow.is_favorite).toBe(1);

    // undo snapshot seq preserved (migration supplies explicit seq; trigger skips)
    const snapRows = target.all('SELECT id, seq FROM metadata_undo_snapshots ORDER BY seq') as {
      id: string;
      seq: number;
    }[];
    expect(snapRows.map((r) => r.id)).toEqual(['snap-1', 'snap-2', 'snap-3']);
    expect(snapRows.map((r) => r.seq)).toEqual([1, 2, 3]);

    // numeric: PG numeric(10,3) string '180.5' -> REAL number
    expect(Number(songRow.duration)).toBe(180.5);

    const integrity = target.get('PRAGMA integrity_check') as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');

    // RE-RUN with sqliteFileExisted=true: the residue check must SKIP (no
    // double-insert, no count change) — this is the every-subsequent-boot path.
    const beforeRe = target.get('SELECT (SELECT COUNT(*) FROM songs) + (SELECT COUNT(*) FROM user_settings) AS t') as { t: number };
    await migrateFromPgliteIfNeeded(target, {
      legacyDir: pgDir,
      sqliteFileExisted: true,
      isTest: false
    });
    const afterRe = target.get('SELECT (SELECT COUNT(*) FROM songs) + (SELECT COUNT(*) FROM user_settings) AS t') as { t: number };
    expect(afterRe.t).toBe(beforeRe.t);
    expect(Number((target.get('SELECT COUNT(*) c FROM songs') as { c: number }).c)).toBe(1);

    await target.close();
    await pg.close();
    fs.rmSync(pgDir, { recursive: true, force: true });
  });

  it('seed runs cleanly on the production singleton engine', async () => {
    await seedDatabase();
    const settings = await singletonDb.select().from(schema.userSettings);
    expect(settings.length).toBeGreaterThan(0);
  });
});
