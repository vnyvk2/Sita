// One-off cleanup of leftover ingest-test rows from either engine's populated DB.
// Usage: node src/cleanup-ingest.mjs <sqlite|pglite> [size]
import { openSqlite } from './engines/sqlite-engine.mjs';
import { openPglite } from './engines/pglite-engine.mjs';

const engine = process.argv[2] ?? 'both';
const size = Number(process.argv[3] ?? 50000);
// PG's LIKE treats '\' as the escape character; SQLite's LIKE treats it literally.
// So the same prefix needs different escaping per engine (documented semantic diff).
const PG_LIKE_PREFIX = 'C:\\\\ingest\\\\';   // PG LIKE: \\ -> literal '\', % -> wildcard
const SQLITE_LIKE_PREFIX = 'C:\\ingest\\'; // SQLite LIKE: '\' is literal

if (engine === 'sqlite' || engine === 'both') {
  const sq = await openSqlite(`data/sqlite-${size}.db`);
  const before = sq.get('SELECT COUNT(*) c FROM songs').c;
  await sq.run('DELETE FROM songs WHERE path LIKE ?', [`${SQLITE_LIKE_PREFIX}%`]);
  const after = sq.get('SELECT COUNT(*) c FROM songs').c;
  console.log(`sqlite-${size}: ${before} -> ${after}`);
  await sq.close();
}
if (engine === 'pglite' || engine === 'both') {
  const pg = await openPglite(`data/pglite-${size}`);
  const before = (await pg.get('SELECT COUNT(*) c FROM songs')).c;
  await pg.run('DELETE FROM songs WHERE path LIKE ?', [`${PG_LIKE_PREFIX}%`]);
  const after = (await pg.get('SELECT COUNT(*) c FROM songs')).c;
  console.log(`pglite-${size}: ${before} -> ${after}`);
  await pg.close();
}
