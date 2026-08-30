// Startup child: opens one engine on a populated DB and reports per-stage timings
// as the LAST stdout line (JSON). Mirrors Nora's src/main/db/db.ts init order.
import { performance } from 'node:perf_hooks';
import path from 'node:path';

const engine = process.argv[2];
const size = Number(process.argv[3]);
const POC_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');

const stages = {};
const mark = async (name, fn) => {
  const t = performance.now();
  const out = await fn();
  stages[name] = Math.round((performance.now() - t) * 100) / 100;
  return out;
};

let e;
if (engine === 'sqlite') {
  const { openSqlite } = await import('../engines/sqlite-engine.mjs');
  const { SQLITE_DDL, SQLITE_FTS_DDL } = await import('../schema/sqlite-ddl.mjs');
  e = await mark('engineCreateMs', () => openSqlite(path.join(POC_ROOT, 'data', `sqlite-${size}.db`)));
  // schema verification pass (mirrors Nora's migrate() cost shape)
  await mark('schemaInitMs', async () => {
    e.get('SELECT COUNT(*) c FROM sqlite_master').c;
  });
  await mark('drizzleInitMs', async () => {
    // drizzle instance is created inside openSqlite; measure a drizzle round-trip instead
    await e.orm.run('SELECT 1');
  });
  await mark('firstQueryMs', async () => {
    e.get('SELECT 1 AS one');
  });
  await mark('firstMeaningfulQueryMs', async () => {
    e.all(
      `SELECT s.id, s.title, s.duration, al.title AS album, a.name AS artist
       FROM songs s
       LEFT JOIN album_songs als ON als.song_id = s.id
       LEFT JOIN albums al ON al.id = als.album_id
       LEFT JOIN artists_songs ars ON ars.song_id = s.id
       LEFT JOIN artists a ON a.id = ars.artist_id
       WHERE s.is_blacklisted = 0
       ORDER BY s.created_at DESC, s.title
       LIMIT 100`
    );
  });
  stages.closeMs = await e.close();
} else {
  const { openPglite } = await import('../engines/pglite-engine.mjs');
  e = await mark('engineCreateMs', () => openPglite(path.join(POC_ROOT, 'data', `pglite-${size}`)));
  await mark('schemaInitMs', async () => {
    await e.get('SELECT COUNT(*) c FROM information_schema.tables');
  });
  await mark('drizzleInitMs', async () => {
    await e.run('SELECT 1');
  });
  await mark('firstQueryMs', async () => {
    await e.get('SELECT 1 AS one');
  });
  await mark('firstMeaningfulQueryMs', async () => {
    await e.all(
      `SELECT s.id, s.title, s.duration, al.title AS album, a.name AS artist
       FROM songs s
       LEFT JOIN album_songs als ON als.song_id = s.id
       LEFT JOIN albums al ON al.id = als.album_id
       LEFT JOIN artists_songs ars ON ars.song_id = s.id
       LEFT JOIN artists a ON a.id = ars.artist_id
       WHERE s.is_blacklisted = false
       ORDER BY s.created_at DESC, s.title
       LIMIT 100`
    );
  });
  stages.closeMs = await e.close();
}

console.log(JSON.stringify(stages));
