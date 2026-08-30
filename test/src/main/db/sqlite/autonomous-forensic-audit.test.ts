import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-forensic-'));
const testDbFile = path.join(tmpDir, 'forensic.db');
process.env.NORA_DB_FILE = testDbFile;

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ existing: undefined, payloads: undefined }),
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

import {
  db,
  getEngine,
  closeDatabaseInstance,
  exportDatabase,
  importDatabase
} from '@main/db/db';
import {
  musicFolders,
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
  palettes,
  paletteSwatches,
  playHistory,
  playEvents,
  scrobbleQueue,
  metadataOverrides,
  metadataUndoSnapshots,
  metadataPendingWrites,
  userSettings,
  shortcuts
} from '@main/db/schema';
import { ingestTrackDTO } from '@main/parseSong/ingestTrackDTO';
import { getAllSongs } from '@main/db/queries/songs';
import getSongInfo from '@main/core/getSongInfo';
import { SongSearchEngine } from '@main/search/engines/SongSearchEngine';
import { ArtistSearchEngine } from '@main/search/engines/ArtistSearchEngine';
import { AlbumSearchEngine } from '@main/search/engines/AlbumSearchEngine';
import { GenreSearchEngine } from '@main/search/engines/GenreSearchEngine';
import { PlaylistSearchEngine } from '@main/search/engines/PlaylistSearchEngine';
import { normalizeQuery } from '@main/search/normalize/normalizeQuery';
import { PlaylistRepository } from '@main/collections/repositories/PlaylistRepository';
import { SmartPlaylistCompiler } from '@main/collections/query/SmartPlaylistCompiler';
import { eq, sql, inArray, and } from 'drizzle-orm';
import { rawAll, rawGet, rawRun } from '@main/db/sqlite/raw';

describe('Autonomous Forensic Equivalence Verification Suite', () => {
  afterAll(async () => {
    await closeDatabaseInstance();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch {
      /* temp folder cleanup */
    }
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 1: Fresh Database Initialization, Schema & Default Seeding
  // --------------------------------------------------------------------------
  it('Workflow 1: Fresh startup generates 42 tables, FTS5 mirrors, triggers and seed data', async () => {
    const engine = getEngine()!;
    const tables = (
      engine.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'"
      ) as { name: string }[]
    ).map((r) => r.name);

    expect(tables.length).toBeGreaterThanOrEqual(42);
    expect(tables).toContain('songs');
    expect(tables).toContain('artists');
    expect(tables).toContain('albums');
    expect(tables).toContain('playlists');
    expect(tables).toContain('metadata_undo_snapshots');

    // Verify FTS5 virtual tables
    const fts = (
      engine.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fts_%'") as { name: string }[]
    ).map((r) => r.name);
    expect(fts).toContain('fts_songs');
    expect(fts).toContain('fts_artists');
    expect(fts).toContain('fts_albums');

    // Verify seed data exists
    const settings = await db.select().from(userSettings);
    expect(settings.length).toBeGreaterThanOrEqual(1);
    expect(settings[0].language).toBe('en');
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 2: Full Ingestion Pipeline with Complex Hierarchies & Junctions
  // --------------------------------------------------------------------------
  const TRACKS = [
    {
      title: 'Midnight City',
      artist: 'M83',
      album: 'Hurry Up, Were Dreaming',
      genre: 'Synthwave',
      path: 'C:\\Music\\Electronic\\M83\\01_midnight.mp3',
      year: 2011,
      duration: '243.2',
      isFavorite: true
    },
    {
      title: 'Velvet Heart',
      artist: 'The Velvet Ones',
      album: 'Soft Dreams',
      genre: 'Indie Rock',
      path: 'C:\\Music\\Indie\\Velvet\\02_velvet.mp3',
      year: 2018,
      duration: '198.0',
      isFavorite: false
    },
    {
      title: 'Golden Hour',
      artist: 'JVKE',
      album: 'This Is What Feels Like',
      genre: 'Pop',
      path: 'C:\\Music\\Pop\\JVKE\\03_golden.mp3',
      year: 2022,
      duration: '209.5',
      isFavorite: true
    },
    {
      title: 'Björk & The Strängs!',
      artist: 'Björk',
      album: 'Homogenic Special',
      genre: 'Experimental',
      path: 'C:\\Music\\Special\\04_bjork.mp3',
      year: 1997,
      duration: '315.0',
      isFavorite: false
    },
    {
      title: 'AC/DC High Voltage',
      artist: 'AC/DC',
      album: 'High Voltage',
      genre: 'Hard Rock',
      path: 'C:\\Music\\Rock\\05_acdc.mp3',
      year: 1976,
      duration: '260.0',
      isFavorite: true
    }
  ];

  const ingestedIds: number[] = [];

  it('Workflow 2: Ingests complex tracks with artists, albums, genres, folders, and durations', async () => {
    await db.insert(musicFolders).values({ id: 1, name: 'Music', path: 'C:\\Music' });

    for (let i = 0; i < TRACKS.length; i++) {
      const t = TRACKS[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await ingestTrackDTO({
        songPath: t.path,
        title: t.title,
        duration: t.duration,
        artists: [t.artist],
        albumArtists: [t.artist],
        album: t.album,
        genres: [t.genre],
        year: t.year,
        sampleRate: 44100,
        bitRate: 320000,
        noOfChannels: 2,
        diskNumber: 1,
        trackNumber: i + 1,
        fileCreatedAt: new Date('2023-01-01T10:00:00Z'),
        fileModifiedAt: new Date('2023-01-01T10:00:00Z'),
        folderId: 1
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, db, undefined);

      ingestedIds.push(res.songData.id);

      if (t.isFavorite) {
        await db.update(songs).set({ isFavorite: true }).where(eq(songs.id, res.songData.id));
      }
    }

    expect(ingestedIds).toHaveLength(TRACKS.length);

    // Verify junction records
    const artistsSongList = await db.select().from(artistsSongs);
    expect(artistsSongList.length).toBeGreaterThanOrEqual(TRACKS.length);

    const genresSongList = await db.select().from(genresSongs);
    expect(genresSongList.length).toBeGreaterThanOrEqual(TRACKS.length);
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 3: Browsing, Sorting, Filtering & Window Hydration
  // --------------------------------------------------------------------------
  it('Workflow 3: getAllSongs and getSongInfo handle all sort orders, filter types, and preserveIdOrder', async () => {
    // 1. Sort A to Z
    const aToZ = await getAllSongs({ sortType: 'aToZ' }, db);
    expect(aToZ.data[0].title).toBe('AC/DC High Voltage');

    // 2. Sort Z to A
    const zToA = await getAllSongs({ sortType: 'zToA' }, db);
    expect(zToA.data[0].title).toBe('Velvet Heart');

    // 3. Filter favorites
    const favs = await getAllSongs({ filterType: 'favorites' }, db);
    expect(favs.data.every((s) => s.isFavorite === true)).toBe(true);
    expect(favs.data).toHaveLength(3);

    // 4. getSongInfo with preserveIdOrder
    const reversedIds = [...ingestedIds].reverse();
    const hydrated = await getSongInfo(reversedIds, undefined, undefined, undefined, true);
    expect(hydrated).toHaveLength(reversedIds.length);
    expect(hydrated.map((s) => s.songId)).toEqual(reversedIds);
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 4: Search Subsystem (Exact, Case-Insensitive, Punctuation, Typo, Transposition)
  // --------------------------------------------------------------------------
  it('Workflow 4: Search engines match exact, case-insensitive, punctuation, Unicode, and typos', async () => {
    const searchSong = async (query: string) => {
      const refs = await SongSearchEngine.search(normalizeQuery(query));
      return refs.map((r) => r.id);
    };

    // Exact match
    const exact = await searchSong('Midnight City');
    expect(exact).toContain(ingestedIds[0]);

    // Case-insensitive
    const lower = await searchSong('midnight city');
    expect(lower).toContain(ingestedIds[0]);
    const upper = await searchSong('MIDNIGHT CITY');
    expect(upper).toContain(ingestedIds[0]);

    // Substring / Prefix
    const sub = await searchSong('night Cit');
    expect(sub).toContain(ingestedIds[0]);

    // Punctuation & Special Characters
    const acdc = await searchSong('AC/DC');
    expect(acdc).toContain(ingestedIds[4]);

    const bjork = await searchSong('Björk & The Strängs!');
    expect(bjork).toContain(ingestedIds[3]);

    const bjorkStripped = await searchSong('bjork the strangs');
    expect(bjorkStripped).toContain(ingestedIds[3]);

    // Progressive Fuzzy / Typo Resistance (Pass 1 & Pass 2)
    const typo1 = await searchSong('velvt heart'); // single missing letter (0.444 sim)
    expect(typo1).toContain(ingestedIds[1]);

    const typoTransposed = await searchSong('midngith city'); // character transposition (0.286 sim)
    expect(typoTransposed).toContain(ingestedIds[0]);

    const typoTransposedWord = await searchSong('midngith');
    expect(typoTransposedWord).toContain(ingestedIds[0]);

    // Negative query returns empty
    const neg = await searchSong('nonexistent query xyz999');
    expect(neg).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 5: Playlists, Smart Playlists AST & CTE Bulk Updates
  // --------------------------------------------------------------------------
  it('Workflow 5: Playlists CRUD, CTE bulk reordering, and Smart Playlist compilation', async () => {
    const repo = new PlaylistRepository();

    // Create standard playlist
    const [pl] = await db
      .insert(playlists)
      .values({ name: 'Forensic Favorites', playlistType: 'standard' })
      .returning();

    // Add entries
    await repo.insertEntries(
      ingestedIds.map((id, idx) => ({ playlistId: pl.id, songId: id, position: idx }))
    );

    const initialEntries = await repo.getEntryPositions(pl.id);
    expect(initialEntries).toHaveLength(ingestedIds.length);

    // Reorder entries with CTE bulk update
    const reordered = initialEntries.map((e, idx) => ({
      entryId: e.entryId,
      position: initialEntries.length - 1 - idx
    }));
    await repo.updatePositionsBulk(pl.id, reordered);

    const updatedEntries = await repo.getEntryPositions(pl.id);
    expect(updatedEntries[0].entryId).toBe(initialEntries[initialEntries.length - 1].entryId);

    // Smart Playlist Compiler
    const compiler = new SmartPlaylistCompiler();
    const ast = {
      type: 'group' as const,
      logicalOperator: 'and' as const,
      rules: [
        { field: 'isFavorite' as const, operator: 'is_true' as const },
        { field: 'year' as const, operator: 'gt' as const, value: 2000 }
      ]
    };
    const compiledSql = compiler.compilePredicate(ast)!;
    const results = await rawAll<{ id: number }>(sql`
      SELECT id FROM songs WHERE ${compiledSql}
    `);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 6: Operations Journal, Undo Snapshots & Auto-Sequence Trigger
  // --------------------------------------------------------------------------
  it('Workflow 6: metadata_undo_snapshots auto-assigns monotonic seq and preserves explicit values', async () => {
    // Explicit seq (e.g. from PGlite migration)
    await db.insert(metadataUndoSnapshots).values({
      id: 'snap-1',
      description: 'Migrated snapshot',
      payload: JSON.stringify({ version: 1 }),
      seq: 100
    });

    // Implicit seq (auto-increment trigger)
    await db.insert(metadataUndoSnapshots).values({
      id: 'snap-2',
      description: 'New snapshot',
      payload: JSON.stringify({ version: 2 })
    });

    const rows = await db
      .select({ id: metadataUndoSnapshots.id, seq: metadataUndoSnapshots.seq })
      .from(metadataUndoSnapshots)
      .orderBy(metadataUndoSnapshots.seq);

    const snap1 = rows.find((r) => r.id === 'snap-1');
    const snap2 = rows.find((r) => r.id === 'snap-2');
    expect(snap1?.seq).toBe(100);
    expect(snap2?.seq).toBe(101); // MAX(100) + 1
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 7: Analytics, Scrobble Queue & strftime Date Arithmetic
  // --------------------------------------------------------------------------
  it('Workflow 7: Analytics records play events and computes strftime UTC aggregations', async () => {
    const now = Date.now();
    await db.insert(playEvents).values({
      songId: ingestedIds[0],
      playbackPercentage: 100.0,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    });

    await db.insert(playHistory).values({
      songId: ingestedIds[0],
      playedAt: new Date(now),
      durationPlayed: 243.2,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    });

    // Test SQLite strftime date aggregation
    const dailyStats = await rawAll<{ day: string; plays: number }>(sql`
      SELECT
        strftime('%Y-%m-%d', created_at/1000, 'unixepoch') AS day,
        COUNT(*) AS plays
      FROM play_events
      GROUP BY strftime('%Y-%m-%d', created_at/1000, 'unixepoch')
    `);

    expect(dailyStats.length).toBeGreaterThanOrEqual(1);
    expect(dailyStats[0].plays).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 8: Metadata Overrides & Pending Writes
  // --------------------------------------------------------------------------
  it('Workflow 8: Metadata overrides and pending writes store and retrieve cleanly', async () => {
    await db.insert(metadataOverrides).values({
      entityKind: 'song',
      entityId: String(ingestedIds[0]),
      fieldId: 'language',
      stringValue: 'fr'
    });

    const [override] = await db
      .select()
      .from(metadataOverrides)
      .where(
        and(
          eq(metadataOverrides.entityKind, 'song'),
          eq(metadataOverrides.entityId, String(ingestedIds[0])),
          eq(metadataOverrides.fieldId, 'language')
        )
      );

    expect(override).toBeDefined();
    expect(override.stringValue).toBe('fr');

    // Pending writes
    await db.insert(metadataPendingWrites).values({
      id: 'pending-1',
      songPath: TRACKS[0].path,
      tags: JSON.stringify({ title: 'Midnight City (Remastered)' })
    });

    const pending = await db.select().from(metadataPendingWrites);
    expect(pending).toHaveLength(1);
    expect(JSON.parse(pending[0].tags).title).toBe('Midnight City (Remastered)');
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 9: Export, Wipe & Import Lossless Round-Trip
  // --------------------------------------------------------------------------
  it('Workflow 9: Export/Import SQL dump round-trips entire populated library losslessly', async () => {
    const dump = await exportDatabase();
    expect(dump).toContain('INSERT INTO "songs"');
    expect(dump).toContain('Midnight City');
    expect(dump).toContain('AC/DC High Voltage');

    // Clear live tables
    const engine = getEngine()!;
    engine.exec('PRAGMA foreign_keys = OFF;');
    engine.exec('DELETE FROM playlist_entries; DELETE FROM playlists; DELETE FROM songs; DELETE FROM artists; DELETE FROM albums; DELETE FROM genres; DELETE FROM music_folders;');
    engine.exec('PRAGMA foreign_keys = ON;');

    const emptyCount = (engine.get('SELECT COUNT(*) as count FROM songs') as { count: number }).count;
    expect(emptyCount).toBe(0);

    // Restore from dump
    await importDatabase(dump);

    const restoredSongs = await db.select().from(songs);
    expect(restoredSongs).toHaveLength(TRACKS.length);

    const restoredPlaylists = await db.select().from(playlists);
    expect(restoredPlaylists.length).toBeGreaterThanOrEqual(1);

    const restoredFTS = engine.all('SELECT rowid FROM fts_songs');
    expect(restoredFTS).toHaveLength(TRACKS.length);
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 10: Concurrency, Transaction Mutex & Savepoint Isolation
  // --------------------------------------------------------------------------
  it('Workflow 10: FIFO transaction serialization and nested savepoint rollback atomicity', async () => {
    let order: number[] = [];

    // Concurrently trigger 3 transactions
    const t1 = db.transaction(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    const t2 = db.transaction(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(2);
    });
    const t3 = db.transaction(async () => {
      order.push(3);
    });

    await Promise.all([t1, t2, t3]);
    expect(order).toEqual([1, 2, 3]); // Strict FIFO execution

    // Nested savepoint rollback
    const initialCount = (await db.select().from(genres)).length;
    await db.transaction(async (trx) => {
      await trx.insert(genres).values({ name: 'Committed Genre' });

      try {
        await trx.transaction(async (nestedTrx) => {
          await nestedTrx.insert(genres).values({ name: 'Rollback Genre' });
          throw new Error('Savepoint rollback test');
        });
      } catch {
        // expected rollback of nested savepoint
      }
    });

    const finalGenres = await db.select().from(genres);
    expect(finalGenres).toHaveLength(initialCount + 1);
    expect(finalGenres.some((g) => g.name === 'Committed Genre')).toBe(true);
    expect(finalGenres.some((g) => g.name === 'Rollback Genre')).toBe(false);
  });
});
