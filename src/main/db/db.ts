import { existsSync } from 'fs';
import path from 'path';

import ShutdownLogger from '@main/lifecycle/ShutdownLogger';
import { ShutdownState } from '@main/lifecycle/ShutdownState';
import logger from '@main/logger';
import { app } from 'electron';

import { seedDatabase } from './seed';
import { deleteSqliteFiles, openSqliteEngine, type SqliteEngine } from './sqlite/engine';

/**
 * Nora database — node:sqlite (SQLite) engine.
 *
 * Migrated from PGlite (see sqlite-poc/RESULTS.md). The database is a single WAL file under
 * userData; a legacy PGlite data dir (`nora.pglite.db/`) found next to it is migrated automatically
 * on first launch (migrateFromPglite).
 */

const DB_NAME = 'nora.sqlite.db';
const LEGACY_PGLITE_DIR_NAME = 'nora.pglite.db';
const isTest = typeof process.env.VITEST !== 'undefined' || process.env.NODE_ENV === 'test';
export const isDatabaseStubbed = !isTest && process.env.NORA_NO_PGLITE === '1';
// NORA_DB_FILE lets integration tests drive the PRODUCTION path (real file DB,
// real singleton) instead of the default in-memory test database.
const useMemoryDb =
  !process.env.NORA_DB_FILE &&
  (isTest || (!isDatabaseStubbed && process.env.NORA_PGLITE_MEMORY === '1'));

const resolveUserDataDir = () => {
  // Isolation override resolved AT THE CONSUMPTION POINT (bundlers may reorder
  // module side-effects, so userDataGuard's setPath alone is not sufficient).
  const isolationOverride =
    !app.isPackaged &&
    typeof process.env.NORA_USER_DATA_DIR === 'string' &&
    process.env.NORA_USER_DATA_DIR.length > 0
      ? path.resolve(process.env.NORA_USER_DATA_DIR)
      : undefined;
  const override = process.env.NORA_USER_DATA ?? isolationOverride;
  if (override) {
    return override;
  }
  return app.getPath('userData');
};

export const DB_PATH =
  process.env.NORA_DB_FILE ?? (useMemoryDb ? ':memory:' : path.join(resolveUserDataDir(), DB_NAME));

if (process.env.NORA_USE_PGLITE === '1') {
  // PGlite was removed in the SQLite migration. Master retains the PGlite
  // implementation as the rollback path (worktree-branch escape hatch).
  throw new Error(
    '[Nora] NORA_USE_PGLITE=1 is no longer supported in this build: the database engine is SQLite (node:sqlite). Use the master branch / a pre-migration release for PGlite.'
  );
}

if (!useMemoryDb && !isDatabaseStubbed) {
  logger.debug(`SQLite database path: ${DB_PATH}`);
}

let engine: SqliteEngine | null = null;
let sqliteFileExisted = false;

if (isDatabaseStubbed) {
  ShutdownLogger.logBootMilestone('SQLite STUBBED via NORA_NO_PGLITE=1', { DB_PATH });
} else {
  // Whether the sqlite file is brand-new (a legacy PGlite dir may need migrating)
  sqliteFileExisted = DB_PATH !== ':memory:' && existsSync(DB_PATH);

  ShutdownLogger.logBootMilestone('SQLite open start', { DB_PATH });
  engine = openSqliteEngine(DB_PATH);
  ShutdownLogger.logBootMilestone('SQLite open completed', {
    openMs: Math.round(engine.initMs.open),
    pragmaMs: Math.round(engine.initMs.pragma),
    ddlMs: Math.round(engine.initMs.ddl)
  });
}

type DrizzleSqlite = NonNullable<ReturnType<typeof openSqliteEngine>>['orm'];

export const db: DrizzleSqlite = isDatabaseStubbed
  ? new Proxy({} as DrizzleSqlite, {
      get() {
        throw new Error('[Nora] Database is stubbed (NORA_NO_PGLITE=1). Query attempted.');
      }
    })
  : (engine as SqliteEngine).orm;

export type DB = DrizzleSqlite;
export type DBTransaction = Parameters<Parameters<DB['transaction']>[0]>[0];

export const getEngine = (): SqliteEngine | null => engine;

// Legacy PGlite data migration + seeding run AFTER `db` is bound: seed.ts and the
// rest of the module graph read this live binding during db.ts evaluation.
if (!isDatabaseStubbed && engine) {
  const { migrateFromPgliteIfNeeded } = await import('./sqlite/migrate-from-pglite');
  await migrateFromPgliteIfNeeded(engine, {
    legacyDir: path.join(resolveUserDataDir(), LEGACY_PGLITE_DIR_NAME),
    sqliteFileExisted,
    isTest
  });

  await seedDatabase();
}

ShutdownLogger.logBootMilestone('Drizzle ORM initialized (SQLite)');

export const closeDatabaseInstance = async () => {
  ShutdownLogger.logShutdownTransition(ShutdownState.ClosingDatabase, 'closeDatabaseInstance');
  if (isDatabaseStubbed) return logger.debug('Database instance stubbed; nothing to close.');
  if (!engine) return logger.debug('Database instance already closed.');

  await engine.close();
  engine = null;
  logger.debug('Database instance closed.');
  ShutdownLogger.logShutdownTransition(ShutdownState.DatabaseClosed, 'closeDatabaseInstance');
};

export const nukeDatabase = async () => {
  try {
    logger.debug('Performing complete database reset...');
    if (!engine) throw new Error('[Nora] Database is stubbed; nuke unavailable.');
    await engine.close();
    deleteSqliteFiles(DB_PATH);
    engine = openSqliteEngine(DB_PATH);
    await seedDatabase();
    logger.debug('Database completely reset');
  } catch (error) {
    logger.error('Failed to reset database:', { error });
    throw error;
  }
};

/**
 * Exports the database as a portable SQL dump (plain text, like the pgDump export it replaces).
 * Consumed by core/exportAppData.ts.
 */
export const exportDatabase = async (): Promise<string> => {
  if (isDatabaseStubbed || !engine) {
    throw new Error('[Nora] Database is stubbed; export unavailable.');
  }
  return dumpToSql(engine);
};

const sqlLiteral = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`;
  return `'${String(v).replaceAll("'", "''")}'`;
};

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

const dumpToSql = (engine: SqliteEngine): string => {
  const tables = (
    engine.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' ORDER BY name"
    ) as { name: string }[]
  ).map((r) => r.name);

  const chunks: string[] = [
    '-- Nora SQLite export (generated; do not edit)',
    'PRAGMA foreign_keys=OFF;',
    'BEGIN TRANSACTION;'
  ];
  for (const table of tables) {
    // delete+insert gives import replace-semantics (like the pgDump import it replaces)
    chunks.push(`DELETE FROM ${quoteIdent(table)};`);
    // generated columns (title_ci etc.) are hidden in table_xinfo and must not be INSERTed
    const cols = (
      engine.all(`PRAGMA table_xinfo(${quoteIdent(table)})`) as {
        name: string;
        hidden: number;
      }[]
    )
      .filter((c) => c.hidden === 0)
      .map((c) => c.name);
    if (cols.length === 0) continue;
    const rows = engine.all(`SELECT * FROM ${quoteIdent(table)}`);
    if (rows.length === 0) continue;
    const colList = cols.map(quoteIdent).join(', ');
    for (const row of rows) {
      const values = cols.map((c) => sqlLiteral(row[c])).join(', ');
      chunks.push(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${values});`);
    }
  }
  chunks.push('COMMIT;');
  return chunks.join('\n');
};

/**
 * Imports a database from a SQL dump (see exportDatabase). Existing rows are replaced by the dump's
 * DELETE+INSERT pairs inside its transaction.
 */
export const importDatabase = async (sqlDump: string) => {
  if (!engine) {
    throw new Error('[Nora] Database is stubbed; import unavailable.');
  }
  engine.exec(sqlDump);
  logger.info('Database imported successfully.');
  return true;
};
