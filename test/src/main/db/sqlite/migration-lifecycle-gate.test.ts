import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    app: {
      ...(actual.app as object),
      getPath: () => os.tmpdir(),
      getAppPath: () => process.cwd(),
      isPackaged: false
    }
  };
});

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ existing: undefined, payloads: undefined }),
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { SmartPlaylistCompiler } from '@main/collections/query/SmartPlaylistCompiler';
import { PlaylistRepository } from '@main/collections/repositories/PlaylistRepository';
import getSongInfo from '@main/core/getSongInfo';
import { getAllSongs } from '@main/db/queries/songs';
import {
  songs,
  artists,
  albums,
  genres,
  playlists,
  playlistEntries,
  smartPlaylistRules,
  artistsSongs,
  albumSongs,
  genresSongs,
  artworks,
  artworksSongs,
  albumsArtworks,
  musicFolders,
  metadataOverrides,
  metadataUndoSnapshots,
  playHistory,
  playEvents,
  userSettings
} from '@main/db/schema';
import { openSqliteEngine, type SqliteEngine } from '@main/db/sqlite/engine';
import { migrateFromPgliteIfNeeded } from '@main/db/sqlite/migrate-from-pglite';
import { rawAll, rawGet } from '@main/db/sqlite/raw';
import { SongSearchEngine } from '@main/search/engines/SongSearchEngine';
import { normalizeQuery } from '@main/search/normalize/normalizeQuery';
import { eq, sql, and } from 'drizzle-orm';
import * as drizzlePgliteMod from 'drizzle-orm/pglite';
import * as migrateMod from 'drizzle-orm/pglite/migrator';

describe('Final Migration Lifecycle & Persistence Gate: PGlite -> SQLite -> App Boot 1 -> Writes -> App Boot 2', () => {
  let tmpDir: string;
  let pgDir: string;
  let sqliteDbPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-final-gate-'));
    pgDir = path.join(tmpDir, 'pglite-source');
    sqliteDbPath = path.join(tmpDir, 'nora-migrated.db');
  });

  afterAll(async () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch {
      /* temp cleanup */
    }
  });

  // --------------------------------------------------------------------------
  // STEP 1: Construct Populated Legacy PGlite Database
  // --------------------------------------------------------------------------
  it('Step 1: Populates a realistic PGlite database with complete relational structures', async () => {
    const pg = await PGlite.create(pgDir, { extensions: { citext, pg_trgm } });
    await pg.exec('CREATE EXTENSION IF NOT EXISTS citext;');
    await pg.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    // Run original PGlite migrations
    await migrateMod.migrate(drizzlePgliteMod.drizzle(pg), {
      migrationsFolder: path.join(process.cwd(), 'resources', 'drizzle')
    });

    const q = async (sqlText: string, params: unknown[] = []) => {
      let i = 0;
      return pg.query(
        sqlText.replace(/\?/g, () => `$${++i}`),
        params
      );
    };

    // 1. Folders (hierarchical parent-child)
    await q(`INSERT INTO music_folders (path, name) VALUES ('C:\\\\Music', 'Music')`);
    await q(
      `INSERT INTO music_folders (path, name, parent_id) VALUES ('C:\\\\Music\\\\Synthwave', 'Synthwave', 1)`
    );

    // 2. Artists, Albums, Genres, Artworks
    await q(`INSERT INTO artists (name, is_favorite) VALUES ('M83', true)`);
    await q(`INSERT INTO artists (name, is_favorite) VALUES ('Daft Punk', true)`);
    await q(`INSERT INTO albums (title, year) VALUES ('Hurry Up, Were Dreaming', 2011)`);
    await q(`INSERT INTO albums (title, year) VALUES ('Discovery', 2001)`);
    await q(`INSERT INTO genres (name) VALUES ('Electronic')`);
    await q(`INSERT INTO genres (name) VALUES ('French House')`);
    await q(
      `INSERT INTO artworks (hash, path, width, height) VALUES ('art-1', 'C:\\\\art1.webp', 500, 500)`
    );
    await q(
      `INSERT INTO artworks (hash, path, width, height) VALUES ('art-2', 'C:\\\\art2.webp', 500, 500)`
    );

    // 3. Songs with full metadata
    const iso1 = '2023-01-15T10:00:00.000Z';
    const iso2 = '2023-02-20T14:30:00.000Z';

    await q(
      `INSERT INTO songs (title, duration, path, is_favorite, year, folder_id, file_created_at, file_modified_at, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'Midnight City',
        '243.2',
        'C:\\\\Music\\\\Synthwave\\\\midnight.mp3',
        true,
        2011,
        2,
        iso1,
        iso1,
        'en',
        iso1,
        iso1
      ]
    );

    await q(
      `INSERT INTO songs (title, duration, path, is_favorite, year, folder_id, file_created_at, file_modified_at, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'One More Time',
        '320.0',
        'C:\\\\Music\\\\Synthwave\\\\onemoretime.mp3',
        true,
        2001,
        2,
        iso2,
        iso2,
        'en',
        iso2,
        iso2
      ]
    );

    // 4. Junctions
    await q(`INSERT INTO artists_songs (artist_id, song_id) VALUES (1, 1)`);
    await q(`INSERT INTO artists_songs (artist_id, song_id) VALUES (2, 2)`);
    await q(`INSERT INTO album_songs (album_id, song_id) VALUES (1, 1)`);
    await q(`INSERT INTO album_songs (album_id, song_id) VALUES (2, 2)`);
    await q(`INSERT INTO genres_songs (genre_id, song_id) VALUES (1, 1)`);
    await q(`INSERT INTO genres_songs (genre_id, song_id) VALUES (2, 2)`);
    await q(`INSERT INTO albums_artworks (album_id, artwork_id) VALUES (1, 1)`);
    await q(`INSERT INTO albums_artworks (album_id, artwork_id) VALUES (2, 2)`);
    await q(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (1, 1)`);
    await q(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (2, 2)`);

    // 5. Playlists & Smart Playlists
    await q(`INSERT INTO playlists (name, playlist_type) VALUES ('My Synthwave Hits', 'standard')`);
    await q(`INSERT INTO playlist_entries (playlist_id, song_id, position) VALUES (1, 1, 0)`);
    await q(`INSERT INTO playlist_entries (playlist_id, song_id, position) VALUES (1, 2, 1)`);

    await q(`INSERT INTO playlists (name, playlist_type) VALUES ('2000s Favorites', 'smart')`);
    await q(
      `INSERT INTO smart_playlist_rules (playlist_id, rule_ast)
       VALUES (2, '{"type":"group","logicalOperator":"and","rules":[{"field":"isFavorite","operator":"is_true"},{"field":"year","operator":"gte","value":2000}]}')`
    );

    // 6. Overrides, Undo History & Analytics
    await q(
      `INSERT INTO metadata_overrides (entity_kind, entity_id, field_id, string_value)
       VALUES ('song', '1', 'language', 'fr')`
    );

    for (let s = 1; s <= 3; s++) {
      await q(
        `INSERT INTO metadata_undo_snapshots (id, payload) VALUES ('snap-${s}', '{"version":${s}}')`
      );
    }

    await q(
      `INSERT INTO play_history (song_id, created_at, updated_at)
       VALUES (1, '${iso1}', '${iso1}')`
    );
    await q(
      `INSERT INTO play_events (song_id, playback_percentage, created_at, updated_at)
       VALUES (1, 100.0, '${iso1}', '${iso1}')`
    );

    await pg.close();
    expect(fs.existsSync(path.join(pgDir, 'base'))).toBe(true);
  }, 60000);

  // --------------------------------------------------------------------------
  // STEP 2: Execute Production Migration Pipeline
  // --------------------------------------------------------------------------
  it('Step 2: Migrates PGlite database to SQLite losslessly with full integrity', async () => {
    const targetEngine = openSqliteEngine(sqliteDbPath);

    await migrateFromPgliteIfNeeded(targetEngine, {
      legacyDir: pgDir,
      sqliteFileExisted: false,
      isTest: false
    });

    // Check SQLite integrity & foreign keys
    const integrity = targetEngine.get('PRAGMA integrity_check') as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');

    const fkErrors = targetEngine.all('PRAGMA foreign_key_check') as unknown[];
    expect(fkErrors).toEqual([]);

    await targetEngine.close();
  }, 60000);

  // --------------------------------------------------------------------------
  // STEP 3: Cold Boot #1 — Application Reads & Writes via Core APIs
  // --------------------------------------------------------------------------
  it('Step 3: First application cold boot reads migrated data through core APIs and performs live operations', async () => {
    const engine1 = openSqliteEngine(sqliteDbPath);
    const db1 = engine1.orm;

    // 1. Browse All Songs (getAllSongs)
    const songList = await getAllSongs({ sortType: 'aToZ' }, db1);
    expect(songList.data).toHaveLength(2);
    expect(songList.data[0].title).toBe('Midnight City');
    expect(songList.data[1].title).toBe('One More Time');

    // 2. Hydrate visible window (getSongInfo with relations & override applied)
    const hydrated = await getSongInfo([1, 2], undefined, undefined, undefined, true, false, db1);
    expect(hydrated).toHaveLength(2);
    expect(hydrated[0].songId).toBe(1);
    expect(hydrated[0].language).toBe('fr'); // Override applied!
    expect(hydrated[0].artists[0].name).toBe('M83');
    expect(hydrated[0].album?.name).toBe('Hurry Up, Were Dreaming');
    expect(hydrated[0].genres[0].name).toBe('Electronic');
    expect(hydrated[0].duration).toBe(243.2);

    // 3. Search Engine (exact, substring, typo)
    const exactRefs = await SongSearchEngine.search(normalizeQuery('Midnight City'), {}, db1);
    expect(exactRefs.map((r) => r.id)).toContain(1);

    const typoRefs = await SongSearchEngine.search(normalizeQuery('midngith city'), {}, db1);
    expect(typoRefs.map((r) => r.id)).toContain(1);

    // 4. Playlists Repository & CTE Reordering
    const repo = new PlaylistRepository();
    const positions = await repo.getEntryPositions(1, db1);
    expect(positions).toHaveLength(2);

    // Reorder playlist (swap positions: entry 1 -> pos 1, entry 2 -> pos 0)
    await repo.updatePositionsBulk(
      1,
      [
        { entryId: positions[0].entryId, position: 1 },
        { entryId: positions[1].entryId, position: 0 }
      ],
      db1
    );

    // 5. Smart Playlist AST Compilation
    const compiler = new SmartPlaylistCompiler();
    const ast = {
      type: 'group' as const,
      logicalOperator: 'and' as const,
      rules: [
        { field: 'isFavorite' as const, operator: 'is_true' as const },
        { field: 'year' as const, operator: 'gte' as const, value: 2000 }
      ]
    };
    const compiledPredicate = compiler.compilePredicate(ast)!;
    const smartResults = await rawAll<{ id: number }>(
      sql`
      SELECT id FROM songs WHERE ${compiledPredicate} ORDER BY id
    `,
      db1
    );
    expect(smartResults.map((r) => r.id)).toEqual([1, 2]);

    // 6. Live Writes: Add new Play History, Play Event, and New Metadata Override
    const now = Date.now();
    await db1.insert(playHistory).values({
      songId: 2,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    });

    await db1.insert(playEvents).values({
      songId: 2,
      playbackPercentage: 100.0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    });

    await db1.insert(metadataOverrides).values({
      entityKind: 'song',
      entityId: '2',
      fieldId: 'language',
      stringValue: 'ja'
    });

    // Verify undo snapshot seq monotonicity on newly created snapshot
    await db1.insert(metadataUndoSnapshots).values({
      id: 'snap-4',
      description: 'Post-migration live snapshot',
      payload: JSON.stringify({ version: 4 })
    });

    const snap4 = await db1
      .select({ id: metadataUndoSnapshots.id, seq: metadataUndoSnapshots.seq })
      .from(metadataUndoSnapshots)
      .where(eq(metadataUndoSnapshots.id, 'snap-4'))
      .get();
    expect(snap4?.seq).toBe(4); // Monotonically continued from legacy 1..3!

    await engine1.close();
  }, 60000);

  // --------------------------------------------------------------------------
  // STEP 4: Cold Boot #2 — Verify All New & Migrated State Persisted
  // --------------------------------------------------------------------------
  it('Step 4: Second application cold boot verifies all state seamlessly persisted across restarts', async () => {
    // Open fresh connection to the existing database file
    const engine2 = openSqliteEngine(sqliteDbPath);
    const db2 = engine2.orm;

    // 1. Verify Playlist Reordering Persisted
    const repo = new PlaylistRepository();
    const entries = await repo.getEntries(1, {}, db2);
    expect(entries).toHaveLength(2);
    expect(entries[0].entry.position).toBe(0);
    expect(entries[0].song.id).toBe(2); // One More Time (song 2) was moved to position 0!
    expect(entries[1].entry.position).toBe(1);
    expect(entries[1].song.id).toBe(1);

    // 2. Verify Hydration + New Metadata Override Persisted
    const song2Hydrated = await getSongInfo([2], undefined, undefined, undefined, true, false, db2);
    expect(song2Hydrated).toHaveLength(1);
    expect(song2Hydrated[0].songId).toBe(2);
    expect(song2Hydrated[0].language).toBe('ja'); // Live override survived restart!

    // 3. Verify Play History & Events Persisted
    const allHistory = await db2.select().from(playHistory).orderBy(playHistory.id);
    expect(allHistory).toHaveLength(2);
    expect(allHistory[0].songId).toBe(1); // Migrated
    expect(allHistory[1].songId).toBe(2); // Live write from session 1

    const allEvents = await db2.select().from(playEvents).orderBy(playEvents.id);
    expect(allEvents).toHaveLength(2);

    // 4. Verify Undo Snapshots Sequence Integrity
    const allSnaps = await db2
      .select({ id: metadataUndoSnapshots.id, seq: metadataUndoSnapshots.seq })
      .from(metadataUndoSnapshots)
      .orderBy(metadataUndoSnapshots.seq);
    expect(allSnaps.map((s) => s.id)).toEqual(['snap-1', 'snap-2', 'snap-3', 'snap-4']);
    expect(allSnaps.map((s) => s.seq)).toEqual([1, 2, 3, 4]);

    // 5. Final Database Integrity Check
    const integrity = engine2.get('PRAGMA integrity_check') as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');

    const fkErrors = engine2.all('PRAGMA foreign_key_check') as unknown[];
    expect(fkErrors).toEqual([]);

    await engine2.close();
  }, 60000);
});
