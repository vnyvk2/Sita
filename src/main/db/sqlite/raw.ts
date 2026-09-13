import logger from '@main/logger';
import { type SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

import { getEngine } from '../db';
import type { SqliteEngine } from './engine';

/**
 * Raw object-row queries against the SQLite engine.
 *
 * Drizzle's sqlite-proxy returns positional arrays for raw `.all()`/`.get()` calls (positional
 * mapping is what the query-builder layer requires), so raw SQL that expects object rows goes
 * through the engine's object-mode statement cache instead.
 *
 * Concurrency/transaction note: node:sqlite is a single connection. Statements issued here without
 * an active transaction context are serialized through `withTxLock` to prevent joining in-flight
 * transactions. When an active transaction context is supplied via `trx`, statements execute
 * directly within the caller's held transaction without re-acquiring the lock (avoiding self-deadlock).
 */

const dialect = new SQLiteSyncDialect();

export function isTransactionContext(trx: unknown, engine: SqliteEngine): boolean {
  if (!trx) return false;
  if (trx === engine.orm || trx === engine) return false;
  if ((trx as { _isTransaction?: boolean })._isTransaction === true) return true;
  if (
    typeof (trx as any).transaction === 'function' &&
    trx !== engine.orm &&
    (trx as any)._engine !== undefined
  ) {
    return true;
  }
  return false;
}

const executeWithLock = async <T>(
  engine: SqliteEngine,
  fn: () => T,
  helperName: string,
  querySql: string
): Promise<T> => {
  const stack = new Error().stack;
  let watchdogFired = false;
  const timer = setTimeout(() => {
    watchdogFired = true;
    logger.error(
      `[Nora/db] ${helperName} queued behind txLock for >5s. Potential transaction deadlock! SQL: ${querySql.slice(0, 200)}`,
      { stack }
    );
  }, 5000);

  try {
    return await engine.withTxLock(async () => {
      clearTimeout(timer);
      if (watchdogFired) {
        logger.warn(`[Nora/db] ${helperName} finally acquired txLock after >5s watchdog alert.`);
      }
      return fn();
    });
  } finally {
    clearTimeout(timer);
  }
};

export const rawAll = async <T>(query: SQL, trx?: unknown): Promise<T[]> => {
  const engine = (trx as { _engine?: SqliteEngine } | undefined)?._engine ?? getEngine();
  if (!engine) throw new Error('[Nora] rawAll called with no SQLite engine');
  const { sql: q, params } = dialect.sqlToQuery(query);

  if (isTransactionContext(trx, engine)) {
    return engine.all(q, params) as unknown as T[];
  }

  return await executeWithLock(engine, () => engine.all(q, params) as unknown as T[], 'rawAll', q);
};

export const rawGet = async <T>(query: SQL, trx?: unknown): Promise<T | undefined> => {
  const engine = (trx as { _engine?: SqliteEngine } | undefined)?._engine ?? getEngine();
  if (!engine) throw new Error('[Nora] rawGet called with no SQLite engine');
  const { sql: q, params } = dialect.sqlToQuery(query);

  if (isTransactionContext(trx, engine)) {
    return engine.get(q, params) as unknown as T | undefined;
  }

  return await executeWithLock(
    engine,
    () => engine.get(q, params) as unknown as T | undefined,
    'rawGet',
    q
  );
};

export const rawRun = async (query: SQL, trx?: unknown): Promise<void> => {
  const engine = (trx as { _engine?: SqliteEngine } | undefined)?._engine ?? getEngine();
  if (!engine) throw new Error('[Nora] rawRun called with no SQLite engine');
  const { sql: q, params } = dialect.sqlToQuery(query);

  if (isTransactionContext(trx, engine)) {
    engine.run(q, params);
    return;
  }

  await executeWithLock(engine, () => engine.run(q, params), 'rawRun', q);
};

