import { type SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

import { getEngine } from '../db';
import type { SqliteEngine } from './engine';

/**
 * Raw object-row queries against the SQLite engine.
 *
 * drizzle's sqlite-proxy returns positional arrays for raw `.all()`/`.get()` calls
 * (positional mapping is what the query-builder layer requires), so raw SQL that
 * expects object rows goes through the engine's object-mode statement cache instead.
 *
 * Concurrency/transaction note: node:sqlite is a single connection. Statements issued
 * here while a drizzle transaction is open on the same connection participate in that
 * transaction (SQLite tx state lives on the connection), so these helpers are
 * transaction-safe when called inside `db.transaction(...)`.
 */

const dialect = new SQLiteSyncDialect();

export const rawAll = async <T>(query: SQL, trx?: unknown): Promise<T[]> => {
  const engine = (trx as { _engine?: SqliteEngine } | undefined)?._engine ?? getEngine();
  if (!engine) throw new Error('[Nora] rawAll called with no SQLite engine');
  const { sql: q, params } = dialect.sqlToQuery(query);
  return engine.all(q, params) as unknown as T[];
};

export const rawGet = async <T>(query: SQL, trx?: unknown): Promise<T | undefined> => {
  const engine = (trx as { _engine?: SqliteEngine } | undefined)?._engine ?? getEngine();
  if (!engine) throw new Error('[Nora] rawGet called with no SQLite engine');
  const { sql: q, params } = dialect.sqlToQuery(query);
  return engine.get(q, params) as unknown as T | undefined;
};

export const rawRun = async (query: SQL, trx?: unknown): Promise<void> => {
  const engine = (trx as { _engine?: SqliteEngine } | undefined)?._engine ?? getEngine();
  if (!engine) throw new Error('[Nora] rawRun called with no SQLite engine');
  const { sql: q, params } = dialect.sqlToQuery(query);
  engine.run(q, params);
};
