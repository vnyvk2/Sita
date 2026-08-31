import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy';

import * as schema from '@db/schema';
import logger from '@main/logger';

import { BASELINE_DDL, SCHEMA_VERSION } from './ddl';

/**
 * SQLite engine (node:sqlite) for Nora's main process.
 *
 * Durability posture (sqlite-poc RESULTS.md §3b / b14): WAL + synchronous=NORMAL —
 * commits survive power loss (at worst the last uncommitted WAL frame is lost; no
 * corruption). busy_timeout covers straggler writers during close windows.
 */
export const SQLITE_PRAGMAS = [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA synchronous = NORMAL;',
  'PRAGMA busy_timeout = 5000;',
  'PRAGMA foreign_keys = ON;',
  'PRAGMA temp_store = MEMORY;',
  'PRAGMA cache_size = -16000;'
] as const;

export type NoraDrizzle = ReturnType<typeof buildDrizzle>['orm'];

export interface SqliteEngine {
  kind: 'sqlite';
  dbPath: string;
  raw: DatabaseSync;
  orm: NoraDrizzle;
  initMs: { open: number; pragma: number; ddl: number };
  exec: (sql: string) => void;
  run: (sql: string, params?: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  all: (sql: string, params?: unknown[]) => Record<string, unknown>[];
  get: (sql: string, params?: unknown[]) => Record<string, unknown> | undefined;
  close: () => Promise<number>;
}

function buildDrizzle(db: DatabaseSync) {
  // Statement caches: array-mode rows for the drizzle proxy (positional mapping),
  // object-mode rows for raw helpers. Shared with the engine body via returned refs.
  const arrayCache = new Map<string, StatementSync>();
  const objectCache = new Map<string, StatementSync>();

  const prepared = (sqlText: string) => {
    let s = arrayCache.get(sqlText);
    if (!s) {
      s = db.prepare(sqlText);
      s.setReturnArrays(true);
      arrayCache.set(sqlText, s);
    }
    return s;
  };

  const preparedObj = (sqlText: string) => {
    let s = objectCache.get(sqlText);
    if (!s) {
      s = db.prepare(sqlText);
      objectCache.set(sqlText, s);
    }
    return s;
  };

  type AsyncRemoteCallback = Parameters<typeof drizzleProxy>[0];
  const callback = (async (sqlText: string, params: unknown[], method: string) => {
      const stmt = prepared(sqlText);
      if (method === 'run') {
        stmt.run(...(params as never[]));
        return { rows: [] };
      }
      if (method === 'get') {
        const row = stmt.get(...(params as never[]));
        return { rows: row ?? undefined };
      }
      return { rows: stmt.all(...(params as never[])) };
    }) as unknown as AsyncRemoteCallback;

  // NOTE: sqlite-proxy's signature is (callback, batchCallbackOrConfig, config?) —
  // with no batch callback, the config object is the SECOND argument.
  const orm = drizzleProxy(callback, { schema });

  // ------------------------------------------------------------------
  // Transaction serialization (PGlite semantic parity).
  //
  // PGlite serialized whole transactions: concurrent `db.transaction()` calls
  // queued, and no foreign statement ever joined an open transaction. drizzle's
  // sqlite-proxy does neither — two overlapping transactions would both emit
  // `BEGIN` (SQLITE_ERROR) and bare statements could join someone else's
  // transaction. Nora runs concurrent job transactions, so the adapter
  // reproduces PGlite's contract:
  //   1. `orm.transaction()` calls are FIFO-queued, lock held across the whole
  //      async body (nested savepoint transactions run on the trx object and
  //      stay inside the held lock — no self-deadlock).
  //   2. Bare statements (insert/update/delete/select/query created OUTSIDE a
  //      transaction) wait at execution time while a transaction is active, so
  //      they can neither collide with BEGIN nor join/see an uncommitted tx.
  // ------------------------------------------------------------------
  let txLock: Promise<void> | null = null;

  const withTxLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = txLock;
    let release!: () => void;
    const lock = new Promise<void>((r) => (release = r));
    txLock = lock;
    try {
      if (prev) await prev;
      return await fn();
    } finally {
      release();
      if (txLock === lock) txLock = null;
    }
  };

  const originalTransaction = orm.transaction.bind(orm);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (orm as any).transaction = (fn: any, config: any) => withTxLock(() => originalTransaction(fn, config));

  const guardBareStatement = (builder: any): any => {
    if (!builder || (typeof builder !== 'object' && typeof builder !== 'function')) return builder;
    if ((builder as { __txGuarded?: boolean }).__txGuarded) return builder;
    if (typeof builder.then === 'function') {
      const originalThen = builder.then.bind(builder);
      builder.then = (onFulfilled: unknown, onRejected: unknown) => {
        const run = () => originalThen(onFulfilled, onRejected);
        if (txLock) {
          const prev = txLock;
          return prev.then(run, run);
        }
        return run();
      };
      (builder as { __txGuarded?: boolean }).__txGuarded = true;
      return builder;
    }
    // chainable pre-promise builder (e.g. db.insert(t) before .values()):
    // re-guard every chained result so the eventual promise gets the guard
    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (prop === '__txGuarded') return true;
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return (...args: unknown[]) => guardBareStatement(value.apply(target, args));
        }
        return value;
      }
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ormAny = orm as any;
  for (const method of ['select', 'insert', 'update', 'delete'] as const) {
    const original = ormAny[method].bind(orm);
    ormAny[method] = (...args: unknown[]) => guardBareStatement(original(...args));
  }
  const originalQuery = ormAny.query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ormAny.query = new Proxy(originalQuery, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const builder = value.apply(target, args);
          return guardBareStatement(builder);
        };
      }
      return value;
    }
  });

  return { orm, preparedObj };
}

export function openSqliteEngine(dbPath: string): SqliteEngine {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const tOpen = performance.now();
  const db = new DatabaseSync(dbPath);
  const openMs = performance.now() - tOpen;

  const tPragma = performance.now();
  for (const p of SQLITE_PRAGMAS) db.exec(p);
  const pragmaMs = performance.now() - tPragma;

  // Baseline schema: apply once, stamped via user_version.
  let ddlMs = 0;
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version < SCHEMA_VERSION) {
    const tDdl = performance.now();
    db.exec(BASELINE_DDL);
    db.prepare(`PRAGMA user_version = ${SCHEMA_VERSION}`).run();
    ddlMs = performance.now() - tDdl;
    logger.info(`SQLite baseline schema applied (v${SCHEMA_VERSION}) in ${Math.round(ddlMs)}ms`);
  }

  const { orm, preparedObj } = buildDrizzle(db);

  const engine: SqliteEngine = {
    kind: 'sqlite',
    dbPath,
    raw: db,
    orm,
    initMs: { open: openMs, pragma: pragmaMs, ddl: ddlMs },
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => preparedObj(sql).run(...(params as never[])) as {
      changes: number | bigint;
      lastInsertRowid: number | bigint;
    },
    all: (sql, params = []) => preparedObj(sql).all(...(params as never[])) as Record<string, unknown>[],
    get: (sql, params = []) => preparedObj(sql).get(...(params as never[])) as Record<string, unknown> | undefined,
    close: async () => {
      const t = performance.now();
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {
        /* another connection may hold the db; checkpoint is best-effort on close */
      }
      db.close();
      return performance.now() - t;
    }
  };

  (orm as any)._engine = engine;

  return engine;
}

/** Deletes the database files (nuke). Caller must have closed all connections. */
export function deleteSqliteFiles(dbPath: string): void {
  if (dbPath === ':memory:') return;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + suffix, { force: true });
    } catch {
      /* best effort */
    }
  }
}
