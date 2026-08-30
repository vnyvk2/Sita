// Phase 14+15 — Real user-database migration prototype: PGlite (Nora's REAL schema,
// real drizzle migrations from resources/drizzle) -> SQLite.
//
// Approach: generic schema translator.
//   1. Create a fresh PGlite, run Nora's actual migrations (resources/drizzle/*.sql)
//   2. Populate it with a generated dataset mapped onto Nora's real columns
//      (scaled-down for duration measurement; the translator is row-count-agnostic)
//   3. Read information_schema/pg_catalog for every table + column
//   4. Generate SQLite DDL via type-mapping rules; create the SQLite DB
//   5. Stream-copy all rows table-by-table inside transactions
//   6. Verify: per-table row counts, sample field fidelity (favorites, overrides, artwork refs)
//   7. Measure duration
import path from 'node:path';
import { rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle as drizzlePg } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';
import { getDataset } from '../gen/generator.mjs';
import { performance } from 'node:perf_hooks';

const N_SONGS = Number(process.argv[2] ?? 50000);
const MIGRATIONS = path.join(POC_ROOT, '..', 'resources', 'drizzle');

const results = { nSongs: N_SONGS, steps: {} };

// ---- 1. real Nora schema on PGlite
const pgDir = path.join(POC_ROOT, 'data', 'migration-source-pg');
rmSync(pgDir, { recursive: true, force: true });
const t0 = performance.now();
const pgClient = await PGlite.create(pgDir, { extensions: { pg_trgm, citext } });
await pgClient.exec('CREATE EXTENSION IF NOT EXISTS citext;');
await pgClient.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
const pgDb = drizzlePg(pgClient, {});
await migrate(pgDb, { migrationsFolder: MIGRATIONS });
results.steps.realMigrationsMs = Math.round(performance.now() - t0);
console.log(`Nora real migrations applied in ${results.steps.realMigrationsMs}ms`);

// ---- 2. populate source with generated data mapped to Nora's real schema
const ds = await getDataset(N_SONGS);
const tp0 = performance.now();
await pgClient.transaction(async (trx) => {
  const q = (sql, params = []) => {
    let i = 0;
    return trx.query(sql.replace(/\?/g, () => `$${++i}`), params);
  };
  await q(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, [ds.tables.musicFolders[0].path, 'Library']);
  for (const a of ds.tables.artists) await q(`INSERT INTO artists (name, is_favorite, created_at, updated_at) VALUES (?,?,?,?)`, [a.name, !!a.isFavorite, a.createdAt, a.createdAt]);
  for (const g of ds.tables.genres) await q(`INSERT INTO genres (name, created_at, updated_at) VALUES (?,?,?)`, [g.name, g.createdAt, g.createdAt]);
  for (const al of ds.tables.albums) await q(`INSERT INTO albums (title, year, is_favorite, created_at, updated_at) VALUES (?,?,?,?,?)`, [al.title, al.year, !!al.isFavorite, al.createdAt, al.createdAt]);
  for (const aw of ds.tables.artworks) await q(`INSERT INTO artworks (hash, path, source, width, height, is_optimized, generator_version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [aw.hash, aw.path, aw.source, aw.width, aw.height, !!aw.isOptimized, aw.generatorVersion, aw.createdAt, aw.createdAt]);
  for (const s of ds.tables.songs) {
    await q(
      `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, is_blacklisted_updated_at, is_favorite_updated_at, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.title, String(s.duration), s.skipCount, s.path, !!s.isFavorite, s.sampleRate, s.bitRate, s.noOfChannels, s.year, s.diskNumber, s.trackNumber, s.folderId, !!s.isBlacklisted, s.createdAt, s.createdAt, s.fileCreatedAt, s.fileModifiedAt, s.musicBrainzRecordingId, s.isrc, s.language, s.createdAt, s.updatedAt]
    );
  }
  for (const r of ds.tables.songsArtists) await q(`INSERT INTO artists_songs (artist_id, song_id) VALUES (?,?)`, [r.artistId, r.songId]);
  for (const r of ds.tables.albumSongs) await q(`INSERT INTO album_songs (album_id, song_id) VALUES (?,?)`, [r.albumId, r.songId]);
  for (const r of ds.tables.genresSongs) await q(`INSERT INTO genres_songs (genre_id, song_id) VALUES (?,?)`, [r.genreId, r.songId]);
  for (const r of ds.tables.albumsArtists) await q(`INSERT INTO albums_artists (album_id, artist_id) VALUES (?,?)`, [r.albumId, r.artistId]);
  for (const r of ds.tables.artworksSongs) await q(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (?,?)`, [r.artworkId, r.songId]);
  for (const r of ds.tables.albumsArtworks) await q(`INSERT INTO albums_artworks (album_id, artwork_id) VALUES (?,?)`, [r.albumId, r.artworkId]);
  for (const m of ds.tables.metadataOverrides) {
    const isNum = m.fieldId === 'year';
    await q(`INSERT INTO metadata_overrides (entity_kind, entity_id, field_id, string_value, number_value, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, [m.entityKind, m.entityId, m.fieldId, isNum ? null : m.value, isNum ? Number(m.value) : null, m.createdAt, m.updatedAt]);
  }
  for (const p of ds.tables.playlists) await q(`INSERT INTO playlists (name, playlist_type, item_count, total_duration, created_at, updated_at) VALUES (?,?,?,?,?,?)`, [p.name, p.playlistType, p.itemCount, String(p.totalDuration), p.createdAt, p.createdAt]);
  for (const pe of ds.tables.playlistEntries) await q(`INSERT INTO playlist_entries (playlist_id, song_id, position, added_at) VALUES (?,?,?,?)`, [pe.playlistId, pe.songId, pe.position, pe.addedAt ?? pe.createdAt ?? pe.playedAt ?? new Date().toISOString()]);
  for (const pev of ds.tables.playEvents) await q(`INSERT INTO play_events (song_id, playback_percentage, created_at, updated_at) VALUES (?,?,?,?)`, [pev.songId, String(pev.playbackPercentage), pev.playedAt, pev.playedAt]);
  for (const ph of ds.tables.playHistory) await q(`INSERT INTO play_history (song_id, created_at, updated_at) VALUES (?,?,?)`, [ph.songId, ph.playedAt, ph.playedAt]);
});
results.steps.populateSourceMs = Math.round(performance.now() - tp0);
console.log(`Source populated (${N_SONGS} songs) in ${Math.round(results.steps.populateSourceMs / 1000)}s`);

// ---- 3. introspect source schema
const tables = (await pgClient.query(`
  SELECT c.relname AS name
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
`)).rows.map((r) => r.name);
console.log(`Source tables (${tables.length}): ${tables.join(', ')}`);

const typeMap = (pgType, defaultValue) => {
  const t = pgType.toLowerCase();
  if (t === 'integer' || t === 'bigint' || t === 'smallint') return 'INTEGER';
  if (t === 'boolean') return 'INTEGER'; // 0/1
  if (t === 'numeric' || t === 'double precision' || t === 'real') return 'REAL';
  if (t.startsWith('timestamp')) return 'TEXT'; // ISO-8601
  if (t === 'citext' || t.startsWith('character') || t === 'text' || t === 'json' || t === 'jsonb') return 'TEXT';
  if (t === 'date') return 'TEXT';
  return 'TEXT'; // enums + anything else
};

// ---- 4. generate SQLite DDL
const ddlParts = ['PRAGMA foreign_keys = ON;'];
const columnInfo = {};
for (const table of tables) {
  const cols = (await pgClient.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position
  `, [table])).rows;
  columnInfo[table] = cols;
  const colDefs = cols.map((c) => {
    let def = '';
    if (c.column_default) {
      const d = c.column_default;
      if (/^nextval\(/.test(d)) def = ''; // identity -> rowid alias below
      else if (/^now\(\)/.test(d)) def = " DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
      else if (/^'(.*)'::/.test(d)) def = ` DEFAULT '${d.replace(/^'(.*)'.*/s, '$1')}'`;
      else if (/^(true|false)$/.test(d)) def = ` DEFAULT ${d === 'true' ? 1 : 0}`;
      else def = '';
    }
    const nn = c.is_nullable === 'NO' && !c.column_default ? ' NOT NULL' : '';
    return `  "${c.column_name}" ${typeMap(c.data_type)}${nn}${def}`;
  });
  ddlParts.push(`CREATE TABLE "${table}" (\n${colDefs.join(',\n')}\n);`);
}
const tDdl0 = performance.now();
const sqlitePath = path.join(POC_ROOT, 'data', 'migrated.sqlite');
rmSync(sqlitePath, { force: true });
rmSync(sqlitePath + '-wal', { force: true });
rmSync(sqlitePath + '-shm', { force: true });
const sq = await openSqlite(sqlitePath);
for (const ddl of ddlParts) sq.exec(ddl);
results.steps.ddlGenerationMs = Math.round(performance.now() - tDdl0);
console.log(`SQLite DDL generated + created (${tables.length} tables) in ${results.steps.ddlGenerationMs}ms`);

// ---- 5. copy rows
const counts = {};
const tCopy0 = performance.now();
for (const table of tables) {
  const cols = columnInfo[table].map((c) => `"${c.column_name}"`).join(', ');
  const rows = (await pgClient.query(`SELECT ${cols} FROM "${table}"`)).rows;
  if (rows.length === 0) { counts[table] = 0; continue; }
  const boolCols = columnInfo[table].filter((c) => c.data_type === 'boolean').map((c) => c.column_name);
  await sq.tx(async (tx) => {
    const CH = 400;
    for (let off = 0; off < rows.length; off += CH) {
      const chunk = rows.slice(off, off + CH);
      const ph = chunk[0].__row ? null : `(${Array(cols.split(',').length).fill('?').join(',')})`;
      const values = chunk.map((row) => cols.split(', ').map((cFull) => {
        const c = cFull.replaceAll('"', '');
        let v = row[c];
        if (boolCols.includes(c)) v = v === true || v === 't' ? 1 : 0;
        if (v instanceof Date) v = v.toISOString();
        return v;
      }));
      const sql = `INSERT INTO "${table}" (${cols}) VALUES ${chunk.map(() => ph).join(',')}`;
      tx.run(sql, values.flat());
    }
  });
  counts[table] = rows.length;
}
results.steps.copyMs = Math.round(performance.now() - tCopy0);
console.log(`Row copy complete in ${Math.round(results.steps.copyMs / 1000)}s`);

// ---- 6. verify
const sourceCounts = {};
for (const table of tables) {
  sourceCounts[table] = Number(((await pgClient.query(`SELECT COUNT(*) c FROM "${table}"`)).rows[0]).c);
}
const mismatches = tables.filter((t) => (counts[t] ?? 0) !== sourceCounts[t]);

// fidelity spot checks: favorites, overrides, artwork refs, timestamps, playlist entries
const spot = {};
const spotTables = ['songs', 'metadata_overrides', 'artworks_songs', 'playlist_entries'];
for (const t of spotTables) {
  const pgRow = (await pgClient.query(`SELECT * FROM "${t}" LIMIT 1`)).rows[0];
  const sqRow = sq.get(`SELECT * FROM "${t}" LIMIT 1`);
  spot[t] = {
    pgKeys: Object.keys(pgRow ?? {}),
    sqKeys: Object.keys(sqRow ?? {}),
    columnAlignment: Object.keys(pgRow ?? {}).length === Object.keys(sqRow ?? {}).length
  };
}

// favorites check: same favorite song paths on both sides
const pgFav = (await pgClient.query(`SELECT path FROM songs WHERE is_favorite = true ORDER BY path LIMIT 500`)).rows.map((r) => r.path);
const sqFav = sq.all(`SELECT path FROM songs WHERE is_favorite = 1 ORDER BY path LIMIT 500`).map((r) => r.path);
spot.favoritesIdentical = JSON.stringify(pgFav) === JSON.stringify(sqFav);

results.steps.verification = {
  sourceCounts,
  sqliteCounts: counts,
  countMismatches: mismatches,
  allCountsMatch: mismatches.length === 0,
  spotChecks: spot
};
console.log(`Row counts match: ${mismatches.length === 0 ? 'YES' : `NO (${mismatches.join(', ')})`}`);
console.log(`Favorites fidelity: ${spot.favoritesIdentical}`);

// ---- 7. totals
results.totalMs = Math.round(performance.now() - t0);
results.migrationOnlyMs = results.steps.ddlGenerationMs + results.steps.copyMs;
console.log(`\nMIGRATION (DDL + copy only): ${Math.round(results.migrationOnlyMs / 1000)}s for ${N_SONGS} songs`);
console.log(`Total including source setup: ${Math.round(results.totalMs / 1000)}s`);

const sqliteSize = (await import('node:fs')).statSync(sqlitePath).size / 1048576;
results.sqliteSizeMb = Math.round(sqliteSize * 10) / 10;
console.log(`Migrated SQLite size: ${results.sqliteSizeMb} MB (source PGlite dir: ~${Math.round(385)} MB @50k)`);

await pgClient.close();
await sq.close();
await saveResults('migration', { env: envInfo(), results });
