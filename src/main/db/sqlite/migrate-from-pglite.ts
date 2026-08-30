import fs from 'fs';
import path from 'path';

import logger from '@main/logger';
import * as schema from '@db/schema';
import { getTableColumns, getTableName, type Table } from 'drizzle-orm';

import type { SqliteEngine } from './engine';

/**
 * One-time PGlite -> SQLite user-data migration.
 *
 * Reads every table from a legacy `nora.pglite.db/` data dir and re-inserts rows
 * through the drizzle sqlite schema (which applies column coercion: Date -> epoch-ms,
 * boolean -> 0/1, json -> text). Explicit ids are preserved so every junction
 * reference stays intact; metadata_undo_snapshots.seq values are preserved (the
 * baseline trigger skips rows that supply seq).
 *
 * Value-conversion correctness was verified by probe: drizzle-pg writes Date -> ISO
 * into `timestamp without time zone` and PGlite reads it back as UTC, so
 * Date.getTime() is an exact round-trip (no wall-clock drift).
 */

// Insert order respecting FK dependencies.
const TABLE_ORDER = [
  'music_folders',
  'artists',
  'genres',
  'albums',
  'artworks',
  'songs',
  'palettes',
  'palette_swatches',
  'playlists',
  'smart_playlist_rules',
  'playlist_entries',
  'play_events',
  'seek_events',
  'skip_events',
  'play_history',
  'metadata_overrides',
  'metadata_undo_snapshots',
  'metadata_pending_writes',
  'user_settings',
  'user_keyboard_shortcuts',
  'user_equalizer_preset',
  'ignored_artists',
  'ignored_featuring_artists',
  'ignored_duplicate_metadata',
  'artworks_songs',
  'artists_artworks',
  'albums_artworks',
  'artists_songs',
  'album_songs',
  'genres_songs',
  'artworks_genres',
  'playlists_songs',
  'artworks_playlists',
  'albums_artists',
  'scrobble_queue',
  'waveforms',
  'lyrics',
  'replay_gain',
  'operation_journal',
  'collection_contexts',
  'spotify_integrations',
  'spotify_playlist_links'
] as const;

const schemaTablesByName = new Map<string, Table>();
for (const exported of Object.values(schema)) {
  if (typeof exported === 'object' && exported !== null && Symbol.for('drizzle:Columns') in exported) {
    const table = exported as unknown as Table;
    schemaTablesByName.set(getTableName(table), table);
  }
}

type PgliteLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  close: () => Promise<void>;
};

async function openLegacyPglite(dir: string): Promise<PgliteLike> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const pg = await PGlite.create(dir, { extensions: { citext, pg_trgm } });
  return pg as unknown as PgliteLike;
}

/** PG value -> drizzle sqlite value, per the drizzle column's declared dataType. */
function convertValue(
  drizzleColumn: { dataType: string; columnType: string },
  pgValue: unknown
): unknown {
  if (pgValue === null || pgValue === undefined) return null;
  switch (drizzleColumn.dataType) {
    case 'boolean':
      return pgValue === true || pgValue === 't' || pgValue === 1;
    case 'date': {
      // timestamp columns are read as TEXT (see select below). PG stores the UTC
      // wall-clock for `timestamp without time zone` (drizzle-pg re-reads it as UTC);
      // timestamptz carries an explicit offset. Normalize: space -> T; append Z only
      // when no offset is present.
      let text = String(pgValue).trim();
      text = text.replace(' ', 'T');
      // normalize pg timezone forms: '+00' -> '+00:00'; bare wall-clock -> UTC (Z)
      const tz = text.match(/([+-]\d{2})(?::?(\d{2}))?$/);
      if (tz && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
        if (!tz[2]) text = text.slice(0, text.length - 3) + `${tz[1]}:00`;
      } else if (/\d$/.test(text)) {
        text += 'Z';
      }
      const d = new Date(text);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'number': {
      // numeric columns arrive as strings from PG; ints/doubles arrive as numbers
      if (typeof pgValue === 'number') return pgValue;
      const n = Number(pgValue);
      return Number.isFinite(n) ? n : null;
    }
    case 'string':
      // text and json-mode columns: json-mode values arrive as objects -> passthrough
      return pgValue;
    case 'bigint':
      return typeof pgValue === 'bigint' ? pgValue : Number(pgValue);
    default:
      return pgValue;
  }
}

export interface MigrateFromPgliteOptions {
  legacyDir: string;
  sqliteFileExisted: boolean;
  isTest: boolean;
}

export const migrateFromPgliteIfNeeded = async (
  engine: SqliteEngine,
  options: MigrateFromPgliteOptions
): Promise<void> => {
  const { legacyDir, sqliteFileExisted, isTest } = options;
  if (isTest || engine.dbPath === ':memory:') return;
  if (!fs.existsSync(legacyDir)) return;
  if (!fs.existsSync(path.join(legacyDir, 'PG_VERSION'))) {
    logger.warn(`Legacy dir ${legacyDir} exists but is not a PGlite data dir; skipping migration.`);
    return;
  }

  // If the SQLite database already existed on disk, check if it already has active
  // user data. user_settings is seeded only AFTER a successful migration + boot, so
  // its presence proves a prior completed run — without it, a user who deleted their
  // entire library would re-trigger migration on every launch (legacy dir is kept).
  if (sqliteFileExisted) {
    try {
      const counts = engine.get(
        'SELECT (SELECT count(*) FROM "songs") + (SELECT count(*) FROM "music_folders") + (SELECT count(*) FROM "playlists") + (SELECT count(*) FROM "user_settings") AS total'
      ) as { total?: number } | undefined;
      if (Number(counts?.total ?? 0) > 0) {
        return; // SQLite DB already has active user data / a completed prior boot
      }
    } catch {
      // Incomplete schema; continue to migration
    }
  }

  logger.info(`Legacy PGlite database found at ${legacyDir}. Migrating to SQLite...`);
  const t0 = Date.now();

  let pg: PgliteLike;
  try {
    pg = await openLegacyPglite(legacyDir);
  } catch (err) {
    logger.error('Failed to open legacy PGlite database for migration; continuing with an empty SQLite database.', { err });
    return;
  }

  try {
    // Disable foreign keys during bulk migration so out-of-order parent-child
    // rows (e.g. self-referencing music_folders) and cross-table references
    // can be inserted in parallel/batches without constraint violations.
    // NOTE: must stay OUTSIDE the transaction below — PRAGMA foreign_keys is a
    // no-op inside one.
    engine.exec('PRAGMA foreign_keys = OFF;');

    const pgTables = new Set(
      (
        await pg.query(
          `SELECT c.relname AS name FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'`
        )
      ).rows.map((r) => r.name as string)
    );

    const summary: Record<string, number> = {};
    let skipped: string[] = [];

    // ONE transaction for the entire migration: a crash (power loss, kill) rolls
    // back every table, leaving a clean empty DB that the residue check on the
    // next boot re-migrates — no silent partial-library state.
    await engine.orm.transaction(async (trx) => {
    for (const tableName of TABLE_ORDER) {
      if (!pgTables.has(tableName)) continue;
      const table = schemaTablesByName.get(tableName);
      if (!table) {
        skipped.push(tableName);
        continue;
      }
      const columns = getTableColumns(table);

      // Only select columns that exist in the legacy source table (the SQLite
      // schema has extra generated columns like *_norm the PG side never had)
      const pgColumns = new Set(
        (
          await pg.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
            [tableName]
          )
        ).rows.map((r) => r.column_name as string)
      );
      // cast timestamp columns to text: drizzle-pg interprets the stored UTC
      // wall-clock as UTC, while PGlite's raw parse would apply the local offset
      const dateCols = Object.values(columns)
        .filter((c) => c.dataType === 'date')
        .map((c) => c.name);
      const selectList = Object.values(columns)
        .filter((c) => pgColumns.has(c.name))
        .map((c) => (dateCols.includes(c.name) ? `"${c.name}"::text AS "${c.name}"` : `"${c.name}"`))
        .join(', ');
      if (!selectList) {
        summary[tableName] = 0;
        continue;
      }
      const rows = (await pg.query(`SELECT ${selectList} FROM "${tableName}"`)).rows;
      if (rows.length === 0) {
        summary[tableName] = 0;
        continue;
      }

      // map PG rows -> drizzle values. drizzle's insert().values() expects objects
      // keyed by the drizzle PROPERTY name (isFavorite), not the DB column name, so
      // build a PG-column-name -> property-name lookup. Generated columns (title_ci,
      // *_norm) are recomputed by SQLite — they must not be inserted.
      const pgColToProperty = new Map(
        Object.entries(columns)
          .filter(([, c]) => !c.generated)
          .map(([property, c]) => [c.name, property])
      );
      const mapped: Record<string, unknown>[] = [];
      for (const row of rows) {
        const out: Record<string, unknown> = {};
        for (const [pgCol, value] of Object.entries(row)) {
          const property = pgColToProperty.get(pgCol);
          if (!property) continue; // PG-only column (e.g. generated title_ci)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const col = (columns as any)[property];
          out[property] = convertValue(col, value);
        }
        mapped.push(out);
      }

      // batched insert into the caller's (migration-wide) transaction
      {
        const BATCH = 200;
        for (let i = 0; i < mapped.length; i += BATCH) {
          const chunk = mapped.slice(i, i + BATCH);
          // drizzle multi-row insert; undefined fields use schema defaults
          const insert = trx.insert(table as never) as unknown as {
            values: (v: unknown) => Promise<unknown>;
          };
          await insert.values(chunk);
        }
      }
      summary[tableName] = mapped.length;
    }
    }); // end migration-wide transaction

    // Re-enable foreign keys and verify integrity
    engine.exec('PRAGMA foreign_keys = ON;');
    const fkViolations = engine.all('PRAGMA foreign_key_check;');
    if (fkViolations.length > 0) {
      logger.warn(`Foreign key check after migration reported ${fkViolations.length} issue(s)`, { fkViolations });
    }

    // verify counts
    const mismatches: string[] = [];
    for (const [tableName, migrated] of Object.entries(summary)) {
      const res = engine.get(`SELECT COUNT(*) AS c FROM "${tableName}"`);
      const actual = Number(res?.c ?? -1);
      if (actual !== migrated) mismatches.push(`${tableName}: expected ${migrated}, got ${actual}`);
    }

    const durationMs = Date.now() - t0;
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    logger.info(`PGlite -> SQLite migration complete in ${durationMs}ms (${total} rows).`, { summary, skipped });
    if (mismatches.length > 0) {
      logger.error(`Migration count mismatches: ${mismatches.join('; ')}`);
      throw new Error(`PGlite->SQLite migration verification failed: ${mismatches.join('; ')}`);
    }
    if (skipped.length > 0) {
      logger.warn(`Tables with no schema counterpart skipped: ${skipped.join(', ')}`);
    }
    // Legacy dir is intentionally KEPT as a user-data backup; cleanup is a manual/UX decision.
  } finally {
    try {
      engine.exec('PRAGMA foreign_keys = ON;');
    } catch {
      /* ignore if db closed or already on */
    }
    await pg.close();
  }
};
