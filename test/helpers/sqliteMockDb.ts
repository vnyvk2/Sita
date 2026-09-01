import { openSqliteEngine } from '../../src/main/db/sqlite/engine';

/**
 * Shared vi.mock factory backing for the SQLite migration test suite.
 *
 * Replaces the in-memory PGlite + drizzle-migrate setup the PGlite tests used:
 * `openSqliteEngine(':memory:')` applies the same baseline DDL the production engine uses (42
 * tables + FTS5 + triggers), so tests exercise the real schema.
 *
 * Usage inside a test file: vi.mock('@main/db/db', async () => { const { createSqliteMockDb } =
 * await import('<relpath>/helpers/sqliteMockDb'); return createSqliteMockDb(); });
 */
export async function createSqliteMockDb() {
  const engine = openSqliteEngine(':memory:');

  return {
    db: engine.orm,
    client: engine.raw,
    engine,
    getEngine: () => engine,
    isDatabaseStubbed: false,
    DB_PATH: ':memory:',
    closeDatabaseInstance: async () => {
      // real close: node:sqlite then rejects every later statement on this connection
      // with "database is not open" (mirrors the PGlite mock's client.close())
      await engine.close();
    },
    nukeDatabase: async () => {
      // clear all rows, keep schema (mirrors the old DROP SCHEMA + re-migrate flow)
      const tables = engine.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'"
      ) as { name: string }[];
      engine.exec('PRAGMA foreign_keys = OFF;');
      try {
        for (const { name } of tables) engine.exec(`DELETE FROM "${name}";`);
      } finally {
        engine.exec('PRAGMA foreign_keys = ON;');
      }
    },
    exportDatabase: async () => '',
    importDatabase: async () => true
  };
}
