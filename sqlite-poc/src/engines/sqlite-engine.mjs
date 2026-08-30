// SQLite engine (node:sqlite DatabaseSync) — the candidate replacement.
// Exposes raw helpers AND a drizzle-orm instance via sqlite-proxy, so the POC can
// benchmark both the engine layer and Nora's real ORM usage pattern.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy';
import { SQLITE_PRAGMAS } from '../schema/sqlite-ddl.mjs';

export async function openSqlite(dbPath, { pragmas = SQLITE_PRAGMAS, ftsDdl = null, triggersDdl = null, ddl = null } = {}) {
  const t0 = performance.now();
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  const openMs = performance.now() - t0;

  const t1 = performance.now();
  for (const p of pragmas) db.exec(p);
  const pragmaMs = performance.now() - t1;

  let ddlMs = 0;
  if (ddl) {
    const t2 = performance.now();
    db.exec(ddl);
    if (ftsDdl) db.exec(ftsDdl);
    if (triggersDdl) db.exec(triggersDdl);
    ddlMs = performance.now() - t2;
  }

  // ---- prepared-statement cache (node:sqlite does not cache internally)
  // Two caches: array-mode for the drizzle proxy, object-mode for raw helpers.
  const stmtCache = new Map();
  const objCache = new Map();
  const prepared = (sql) => {
    let s = stmtCache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      s.setReturnArrays(true); // positional rows — required by drizzle sqlite-proxy
      stmtCache.set(sql, s);
    }
    return s;
  };
  const preparedObj = (sql) => {
    let s = objCache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      objCache.set(sql, s);
    }
    return s;
  };

  const engine = {
    kind: 'sqlite',
    driver: 'node:sqlite',
    dbPath,
    raw: db,
    openMs,
    pragmaMs,
    ddlMs,

    exec: (sql) => db.exec(sql),
    // params is always an ARRAY (parity with PGlite's query(sql, params))
    run: (sql, params = []) => preparedObj(sql).run(...params),
    all: (sql, params = []) => preparedObj(sql).all(...params),
    get: (sql, params = []) => preparedObj(sql).get(...params),

    // statement cache access for benches that want to manage it
    prepared,
    clearStmtCache: () => stmtCache.clear(),

    sqliteVersion: () => db.prepare('select sqlite_version() v').get().v,

    async tx(fn) {
      db.exec('BEGIN');
      try {
        const out = await fn(engine);
        db.exec('COMMIT');
        return out;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw err;
      }
    },

    async savepoint(name, fn) {
      db.exec(`SAVEPOINT ${name}`);
      try {
        const out = await fn(engine);
        db.exec(`RELEASE SAVEPOINT ${name}`);
        return out;
      } catch (err) {
        try { db.exec(`ROLLBACK TO SAVEPOINT ${name}`); db.exec(`RELEASE SAVEPOINT ${name}`); } catch { /* nop */ }
        throw err;
      }
    },

    async close() {
      // flush WAL into the main db file so timing includes full close cost
      const t = performance.now();
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* readonly */ }
      db.close();
      return performance.now() - t;
    }
  };

  // ---- drizzle over node:sqlite (sqlite-proxy adapter, the official extension point
  // for drivers drizzle doesn't ship — drizzle-orm 0.45.2 has no native node:sqlite driver)
  const drizzleDb = drizzleProxy(
    async (sql, params, method) => {
      const stmt = prepared(sql);
      if (method === 'run') {
        stmt.run(...params);
        return { rows: [] };
      }
      if (method === 'get') {
        const row = stmt.get(...params);
        return { rows: row ?? undefined };
      }
      if (method === 'values') {
        return { rows: stmt.all(...params) };
      }
      return { rows: stmt.all(...params) };
    },
    undefined,
    { casing: 'snake_case' }
  );
  engine.orm = drizzleDb;

  return engine;
}
