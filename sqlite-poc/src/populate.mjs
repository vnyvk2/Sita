// Populates disk-backed DBs for both engines at a given size, used by all benches.
// Usage: node src/populate.mjs <size> [engine]   engine in {sqlite,pglite,both}
import path from 'node:path';
import { rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { openSqlite } from './engines/sqlite-engine.mjs';
import { openPglite } from './engines/pglite-engine.mjs';
import { SQLITE_DDL, SQLITE_FTS_DDL, SQLITE_FTS_TRIGGERS } from './schema/sqlite-ddl.mjs';
import { PGLITE_DDL_FULL } from './schema/pglite-ddl.mjs';
import { getDataset } from './gen/generator.mjs';
import { ingestDataset } from './ingest.mjs';
import { DATA_DIR } from './lib/util.mjs';

export function sqlitePathFor(size) {
  return path.join(DATA_DIR, `sqlite-${size}.db`);
}
export function pgliteDirFor(size) {
  return path.join(DATA_DIR, `pglite-${size}`);
}

async function populateSqlite(size, { force = false } = {}) {
  const dbPath = sqlitePathFor(size);
  const done = existsSync(dbPath);
  if (done && !force) return { reused: true, dbPath, sizeMb: mb(dbPath) };
  rmSync(dbPath, { force: true });
  rmSync(dbPath + '-wal', { force: true });
  rmSync(dbPath + '-shm', { force: true });
  const ds = await getDataset(size);
  const sq = await openSqlite(dbPath, { ddl: SQLITE_DDL, ftsDdl: SQLITE_FTS_DDL, triggersDdl: SQLITE_FTS_TRIGGERS });
  const ins = await ingestDataset(sq, ds);
  const closeMs = await sq.close();
  return { reused: false, dbPath, ingestMs: ins.ingestMs, closeMs, sizeMb: mb(dbPath), genMs: ds.genMs ?? ds.loadMs };
}

async function populatePglite(size, { force = false } = {}) {
  const dir = pgliteDirFor(size);
  if (existsSync(dir) && !force) return { reused: true, dir, sizeMb: mb(dir) };
  rmSync(dir, { recursive: true, force: true });
  const ds = await getDataset(size);
  const pg = await openPglite(dir, { ddl: PGLITE_DDL_FULL });
  const ins = await ingestDataset(pg, ds);
  const closeMs = await pg.close();
  return { reused: false, dir, ingestMs: ins.ingestMs, closeMs, sizeMb: mb(dir), genMs: ds.genMs ?? ds.loadMs };
}

function mb(p) {
  try {
    if (statSync(p).isFile()) return Math.round(statSync(p).size / 1048576 * 10) / 10;
    let total = 0;
    const walk = (d) => {
      for (const f of readdirSync(d)) {
        const fp = d + '/' + f;
        if (statSync(fp).isDirectory()) walk(fp);
        else total += statSync(fp).size;
      }
    };
    walk(p);
    return Math.round(total / 1048576 * 10) / 10;
  } catch {
    return 0;
  }
}

// CLI
const size = Number(process.argv[2] ?? 1300);
const engine = process.argv[3] ?? 'both';
if (process.argv[1]?.endsWith('populate.mjs')) {
  if (engine === 'sqlite' || engine === 'both') {
    const r = await populateSqlite(size);
    console.log(`sqlite ${size}:`, JSON.stringify(r));
  }
  if (engine === 'pglite' || engine === 'both') {
    const r = await populatePglite(size);
    console.log(`pglite ${size}:`, JSON.stringify(r));
  }
}
