// Smoke test: open both engines, ingest the small dataset, run representative queries.
import { openSqlite } from './engines/sqlite-engine.mjs';
import { openPglite } from './engines/pglite-engine.mjs';
import { SQLITE_DDL, SQLITE_FTS_DDL, SQLITE_FTS_TRIGGERS } from './schema/sqlite-ddl.mjs';
import { PGLITE_DDL_FULL } from './schema/pglite-ddl.mjs';
import { getDataset } from './gen/generator.mjs';
import { ingestDataset } from './ingest.mjs';
import { DATA_DIR } from './lib/util.mjs';
import path from 'node:path';
import { rmSync } from 'node:fs';

const ds = await getDataset(1300);
console.log('dataset counts:', ds.counts);

// --- SQLite
const sqlitePath = path.join(DATA_DIR, 'smoke-sqlite.db');
rmSync(sqlitePath, { force: true });
rmSync(sqlitePath + '-wal', { force: true });
rmSync(sqlitePath + '-shm', { force: true });
const sq = await openSqlite(sqlitePath, { ddl: SQLITE_DDL, ftsDdl: SQLITE_FTS_DDL, triggersDdl: SQLITE_FTS_TRIGGERS });
console.log(`sqlite: open=${sq.openMs.toFixed(1)}ms pragma=${sq.pragmaMs.toFixed(1)}ms ddl=${sq.ddlMs.toFixed(1)}ms version=${sq.sqliteVersion()}`);
const insSq = await ingestDataset(sq, ds);
console.log(`sqlite ingest: ${insSq.ingestMs.toFixed(0)}ms`, JSON.stringify(insSq.perTable.songs));

console.log('songs count:', sq.get('SELECT COUNT(*) c FROM songs').c);
console.log('by title:', JSON.stringify(sq.all("SELECT id, title, title_ci FROM songs WHERE title_ci = 'midnight city' LIMIT 2")));
console.log('fts:', JSON.stringify(sq.all("SELECT rowid FROM fts_songs WHERE fts_songs MATCH ? LIMIT 3", ['golden'])));
console.log('join:', JSON.stringify(sq.all('SELECT s.title, a.name FROM songs s JOIN artists_songs ars ON ars.song_id = s.id JOIN artists a ON a.id = ars.artist_id LIMIT 2')));

// --- PGlite
const pgDir = path.join(DATA_DIR, 'smoke-pglite');
rmSync(pgDir, { recursive: true, force: true });
const pg = await openPglite(pgDir, { ddl: PGLITE_DDL_FULL });
console.log(`pglite: open=${pg.openMs.toFixed(1)}ms ext=${pg.extensionMs.toFixed(1)}ms ddl=${pg.ddlMs.toFixed(1)}ms`);
const insPg = await ingestDataset(pg, ds);
console.log(`pglite ingest: ${insPg.ingestMs.toFixed(0)}ms`, JSON.stringify(insPg.perTable.songs));

console.log('songs count:', (await pg.get('SELECT COUNT(*) c FROM songs')).c);
console.log('by title:', JSON.stringify(await pg.all("SELECT id, title, title_ci::text FROM songs WHERE title_ci = 'midnight city' LIMIT 2")));
console.log('trgm:', JSON.stringify(await pg.all('SELECT id FROM songs WHERE title_ci % ? LIMIT 3', ['golden'])));
console.log('join:', JSON.stringify(await pg.all('SELECT s.title, a.name FROM songs s JOIN artists_songs ars ON ars.song_id = s.id JOIN artists a ON a.id = ars.artist_id LIMIT 2')));

const c1 = await pg.close();
const c2 = await sq.close();
console.log(`close: pglite=${c1.toFixed(0)}ms sqlite=${c2.toFixed(0)}ms`);
console.log('SMOKE OK');
