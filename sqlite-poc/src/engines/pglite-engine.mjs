// PGlite engine — Nora's current database, driven the same way src/main/db/db.ts does it.
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

export async function openPglite(dataDir, { ddl = null } = {}) {
  const t0 = performance.now();
  if (dataDir && dataDir !== 'memory://') mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir ?? 'memory://', {
    extensions: { pg_trgm, citext }
  });
  const openMs = performance.now() - t0;

  const t1 = performance.now();
  await pg.exec('CREATE EXTENSION IF NOT EXISTS citext;');
  await pg.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
  const extensionMs = performance.now() - t1;

  let ddlMs = 0;
  if (ddl) {
    const t2 = performance.now();
    await pg.exec(ddl);
    ddlMs = performance.now() - t2;
  }

  // Translate `?` placeholders (used across the POC's SQL) to PG's $n style.
  // Safe for POC queries: no literal '?' inside string/quoted contexts is used.
  const toPgParams = (sql) => {
    if (!sql.includes('?')) return sql;
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };

  const q = async (sql, params = []) => pg.query(toPgParams(sql), params);

  const engine = {
    kind: 'pglite',
    driver: '@electric-sql/pglite',
    dbPath: dataDir,
    raw: pg,
    openMs,
    extensionMs,
    ddlMs,

    exec: (sql) => pg.exec(sql),
    run: async (sql, params = []) => await q(sql, params),
    all: async (sql, params = []) => (await q(sql, params)).rows,
    get: async (sql, params = []) => (await q(sql, params)).rows[0],

    async tx(fn) {
      return pg.transaction(async (trx) => {
        const wrapped = {
          raw: trx,
          run: async (sql, params = []) => await trx.query(toPgParams(sql), params),
          all: async (sql, params = []) => (await trx.query(toPgParams(sql), params)).rows,
          get: async (sql, params = []) => (await trx.query(toPgParams(sql), params)).rows[0],
          exec: (sql) => trx.exec(sql)
        };
        return fn(wrapped);
      });
    },

    async savepoint(_name, fn) {
      // PGlite nests via drizzle-style nested transaction (SAVEPOINT) when given a trx;
      // raw SQL savepoints are exercised through tx() in the POC benches.
      return fn();
    },

    async close() {
      const t = performance.now();
      await pg.close();
      return performance.now() - t;
    }
  };

  return engine;
}
