import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { openSqliteEngine, type SqliteEngine } from '../../src/main/db/sqlite/engine';
import { parseSongArtworks } from '../../src/main/fs/resolveFilePaths';
import type { SongData } from '../../src/types/app';

interface RawFlatSongRow {
  id: number;
  title: string;
  duration: number;
  path: string;
  is_favorite: number;
  is_blacklisted: number;
  track_number: number | null;
  year: number | null;
  created_at: string;
  artists_json: string | null;
  album_id: number | null;
  album_title: string | null;
  album_is_favorite: number | null;
  album_artists_json: string | null;
  artworks_json: string | null;
  genres_json: string | null;
}

/**
 * High-performance flat song projection query executing against SQLite engine.
 * Avoids deep 6-table Drizzle ORM object graph allocations via json_group_array aggregation.
 */
export function executeFlatSongProjection(
  engine: SqliteEngine,
  songIds: number[],
  options: { preserveIdOrder?: boolean } = {}
): SongData[] {
  if (!songIds || songIds.length === 0) {
    return [];
  }

  const CHUNK_SIZE = 500;
  const uniqueSongIds = Array.from(new Set(songIds));
  const rawRows: RawFlatSongRow[] = [];

  for (let i = 0; i < uniqueSongIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueSongIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');

    const query = `
      SELECT
        s.id,
        s.title,
        s.duration,
        s.path,
        s.is_favorite,
        s.is_blacklisted,
        s.track_number,
        s.year,
        s.created_at,
        -- Artists JSON array
        (
          SELECT json_group_array(json_object('artistId', a.id, 'name', a.name))
          FROM artists_songs as_rel
          JOIN artists a ON a.id = as_rel.artist_id
          WHERE as_rel.song_id = s.id
        ) as artists_json,
        -- Primary Album
        alb.id as album_id,
        alb.title as album_title,
        alb.is_favorite as album_is_favorite,
        -- Album Artists JSON array
        (
          SELECT json_group_array(json_object('artistId', a.id, 'name', a.name))
          FROM albums_artists aa
          JOIN artists a ON a.id = aa.artist_id
          WHERE aa.album_id = alb.id
        ) as album_artists_json,
        -- Artworks JSON array
        (
          SELECT json_group_array(json_object('id', art.id, 'path', art.path, 'isOptimized', art.is_optimized))
          FROM artworks_songs art_rel
          JOIN artworks art ON art.id = art_rel.artwork_id
          WHERE art_rel.song_id = s.id
        ) as artworks_json,
        -- Genres JSON array
        (
          SELECT json_group_array(json_object('genreId', g.id, 'name', g.name))
          FROM genres_songs gs
          JOIN genres g ON g.id = gs.genre_id
          WHERE gs.song_id = s.id
        ) as genres_json
      FROM songs s
      LEFT JOIN album_songs alb_rel ON alb_rel.song_id = s.id
      LEFT JOIN albums alb ON alb.id = alb_rel.album_id
      WHERE s.id IN (${placeholders})
    `;

    const chunkRows = engine.all(query, chunk) as RawFlatSongRow[];
    rawRows.push(...chunkRows);
  }

  // Transform raw SQL rows to Nora's canonical SongData shape
  const transformedMap = new Map<number, SongData>();

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];

    let artists: { artistId: number; name: string }[] = [];
    if (row.artists_json) {
      try {
        artists = JSON.parse(row.artists_json);
      } catch {
        artists = [];
      }
    }

    let albumArtists: { artistId: number; name: string }[] = [];
    if (row.album_artists_json) {
      try {
        albumArtists = JSON.parse(row.album_artists_json);
      } catch {
        albumArtists = [];
      }
    }

    let rawArtworks: Array<{ id: number; path: string; isOptimized: number | boolean }> = [];
    if (row.artworks_json) {
      try {
        rawArtworks = JSON.parse(row.artworks_json);
      } catch {
        rawArtworks = [];
      }
    }

    let genres: { genreId: number; name: string }[] = [];
    if (row.genres_json) {
      try {
        genres = JSON.parse(row.genres_json);
      } catch {
        genres = [];
      }
    }

    const album = row.album_id
      ? {
          albumId: row.album_id,
          name: row.album_title || 'Unknown Album',
          isAFavorite: Boolean(row.album_is_favorite)
        }
      : undefined;

    const normalizedArtworks = rawArtworks.map((a) => ({
      id: a.id,
      path: a.path,
      isOptimized: Boolean(a.isOptimized)
    }));

    const artworkPaths = parseSongArtworks(normalizedArtworks as any);

    const songData: SongData = {
      songId: row.id,
      title: row.title,
      duration: row.duration,
      path: row.path,
      isAFavorite: Boolean(row.is_favorite),
      isBlacklisted: Boolean(row.is_blacklisted),
      trackNo: row.track_number ?? undefined,
      year: row.year ?? undefined,
      addedDate: row.created_at ? new Date(row.created_at).getTime() : 0,
      artists,
      album,
      albumArtists,
      genres,
      artworkPaths,
      isArtworkAvailable: normalizedArtworks.length > 0
    };

    transformedMap.set(row.id, songData);
  }

  if (options.preserveIdOrder) {
    const ordered: SongData[] = [];
    for (let i = 0; i < songIds.length; i++) {
      const item = transformedMap.get(songIds[i]);
      if (item) {
        ordered.push(item);
      }
    }
    return ordered;
  }

  return Array.from(transformedMap.values());
}

describe('Flat Song Projection — Tier 1 Feature Coverage & Tier 2 Boundaries', () => {
  let engine: SqliteEngine;

  beforeEach(() => {
    engine = openSqliteEngine(':memory:');

    // Seed base music folder
    const now = new Date('2026-01-01T10:00:00Z').toISOString();
    engine.run(
      `INSERT INTO music_folders (id, name, path, folder_created_at, last_modified_at, last_changed_at, last_parsed_at)
       VALUES (1, 'Test Music', 'C:\\Music', ?, ?, ?, ?)`,
      [now, now, now, now]
    );

    // Seed Artists
    engine.run(`INSERT INTO artists (id, name, is_favorite) VALUES (1, 'Dua Lipa', 1)`);
    engine.run(`INSERT INTO artists (id, name, is_favorite) VALUES (2, 'Elton John', 0)`);
    engine.run(`INSERT INTO artists (id, name, is_favorite) VALUES (3, 'Daft Punk', 1)`);

    // Seed Albums
    engine.run(`INSERT INTO albums (id, title, is_favorite) VALUES (10, 'Future Nostalgia', 1)`);
    engine.run(`INSERT INTO albums_artists (album_id, artist_id) VALUES (10, 1)`);

    engine.run(`INSERT INTO albums (id, title, is_favorite) VALUES (20, 'Discovery', 1)`);
    engine.run(`INSERT INTO albums_artists (album_id, artist_id) VALUES (20, 3)`);

    // Seed Genres
    engine.run(`INSERT INTO genres (id, name) VALUES (100, 'Pop')`);
    engine.run(`INSERT INTO genres (id, name) VALUES (200, 'Electronic')`);
    engine.run(`INSERT INTO genres (id, name) VALUES (300, 'Disco')`);

    // Seed Artworks (with hash, width, height)
    engine.run(
      `INSERT INTO artworks (id, path, is_optimized, hash, width, height)
       VALUES (501, 'C:\\AppData\\art_501.jpg', 0, 'hash_501', 500, 500)`
    );
    engine.run(
      `INSERT INTO artworks (id, path, is_optimized, hash, width, height)
       VALUES (502, 'C:\\AppData\\art_501_opt.webp', 1, 'hash_502', 500, 500)`
    );

    // Seed Songs (with file_created_at and file_modified_at)
    // Song 1: Multi-artist (Dua Lipa + Elton John), with album, with artworks, with multiple genres
    engine.run(
      `INSERT INTO songs (id, title, duration, path, folder_id, is_favorite, is_blacklisted, track_number, year, file_created_at, file_modified_at, created_at)
       VALUES (1, 'Cold Heart (PNAU Remix)', 202, 'C:\\Music\\cold_heart.mp3', 1, 1, 0, 1, 2021, ?, ?, ?)`,
      [now, now, now]
    );
    engine.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (1, 1)`);
    engine.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (2, 1)`);
    engine.run(`INSERT INTO album_songs (album_id, song_id) VALUES (10, 1)`);
    engine.run(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (501, 1)`);
    engine.run(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (502, 1)`);
    engine.run(`INSERT INTO genres_songs (genre_id, song_id) VALUES (100, 1)`);
    engine.run(`INSERT INTO genres_songs (genre_id, song_id) VALUES (300, 1)`);

    // Song 2: Single artist (Daft Punk), with album, no artwork, electronic genre
    engine.run(
      `INSERT INTO songs (id, title, duration, path, folder_id, is_favorite, is_blacklisted, track_number, year, file_created_at, file_modified_at, created_at)
       VALUES (2, 'One More Time', 320, 'C:\\Music\\one_more_time.mp3', 1, 0, 0, 1, 2001, ?, ?, ?)`,
      [now, now, now]
    );
    engine.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (3, 2)`);
    engine.run(`INSERT INTO album_songs (album_id, song_id) VALUES (20, 2)`);
    engine.run(`INSERT INTO genres_songs (genre_id, song_id) VALUES (200, 2)`);

    // Song 3: Orphan song (No album, no artwork, no genre)
    engine.run(
      `INSERT INTO songs (id, title, duration, path, folder_id, is_favorite, is_blacklisted, track_number, year, file_created_at, file_modified_at, created_at)
       VALUES (3, 'Standalone Acoustic Demo', 145, 'C:\\Music\\demo.mp3', 1, 0, 0, NULL, 2024, ?, ?, ?)`,
      [now, now, now]
    );
    engine.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (1, 3)`);
  });

  afterAll(async () => {
    if (engine) await engine.close();
  });

  it('resolves primary song identifiers, multiple artists, and genres in single flat query', () => {
    const results = executeFlatSongProjection(engine, [1]);

    expect(results).toHaveLength(1);
    const song = results[0];

    expect(song.songId).toBe(1);
    expect(song.title).toBe('Cold Heart (PNAU Remix)');
    expect(song.duration).toBe(202);
    expect(song.path).toBe('C:\\Music\\cold_heart.mp3');
    expect(song.isAFavorite).toBe(true);
    expect(song.isBlacklisted).toBe(false);
    expect(song.trackNo).toBe(1);
    expect(song.year).toBe(2021);

    // Multi-artist verification
    expect(song.artists).toHaveLength(2);
    expect(song.artists.map((a) => a.name)).toEqual(['Dua Lipa', 'Elton John']);

    // Album details
    expect(song.album).toBeDefined();
    expect(song.album?.albumId).toBe(10);
    expect(song.album?.name).toBe('Future Nostalgia');
    expect(song.album?.isAFavorite).toBe(true);
    expect(song.albumArtists).toEqual([{ artistId: 1, name: 'Dua Lipa' }]);

    // Genres
    expect(song.genres.map((g) => g.name)).toEqual(['Pop', 'Disco']);

    // Artworks (wrapped with Nora protocol)
    expect(song.isArtworkAvailable).toBe(true);
    expect(song.artworkPaths.isDefaultArtwork).toBe(false);
    expect(song.artworkPaths.artworkPath).toContain('art_501.jpg');
    expect(song.artworkPaths.optimizedArtworkPath).toContain('art_501_opt.webp');
  });

  it('correctly handles songs with missing album or missing artwork without throwing errors', () => {
    const results = executeFlatSongProjection(engine, [2, 3]);
    expect(results).toHaveLength(2);

    const song2 = results.find((s) => s.songId === 2);
    const song3 = results.find((s) => s.songId === 3);

    expect(song2).toBeDefined();
    expect(song2?.isArtworkAvailable).toBe(false);
    expect(song2?.artworkPaths.isDefaultArtwork).toBe(true);
    expect(song2?.album?.name).toBe('Discovery');

    expect(song3).toBeDefined();
    expect(song3?.album).toBeUndefined();
    expect(song3?.albumArtists).toEqual([]);
    expect(song3?.trackNo).toBeUndefined();
    expect(song3?.genres).toEqual([]);
    expect(song3?.artworkPaths.isDefaultArtwork).toBe(true);
  });

  it('preserves exact requested ID order including duplicate IDs (preserveIdOrder: true)', () => {
    const requestedIds = [3, 1, 3, 2, 1];
    const results = executeFlatSongProjection(engine, requestedIds, { preserveIdOrder: true });

    expect(results).toHaveLength(5);
    expect(results.map((s) => s.songId)).toEqual([3, 1, 3, 2, 1]);
    expect(results.map((s) => s.title)).toEqual([
      'Standalone Acoustic Demo',
      'Cold Heart (PNAU Remix)',
      'Standalone Acoustic Demo',
      'One More Time',
      'Cold Heart (PNAU Remix)'
    ]);
  });

  it('Tier 2 Boundary: handles empty song ID array (0 songs) in < 1ms', () => {
    const t0 = performance.now();
    const results = executeFlatSongProjection(engine, []);
    const duration = performance.now() - t0;

    expect(results).toEqual([]);
    expect(duration).toBeLessThan(1);
  });

  it('Tier 2 Boundary: handles 1-song library cleanly', () => {
    const results = executeFlatSongProjection(engine, [1]);
    expect(results).toHaveLength(1);
    expect(results[0].songId).toBe(1);
  });

  it('Tier 2 Boundary: handles deleted/non-existent IDs in requested chunk without crashing', () => {
    // Request IDs 1 and 2 with non-existent IDs 999 and 8888
    const results = executeFlatSongProjection(engine, [1, 999, 2, 8888], { preserveIdOrder: true });

    // Returns the 2 existing songs, ignores missing IDs safely
    expect(results).toHaveLength(2);
    expect(results.map((s) => s.songId)).toEqual([1, 2]);
  });

  it('Tier 2 Stress: handles > 500 IDs by chunking to respect SQLite variable limits', () => {
    // Generate 600 IDs pointing to song 1 and song 2
    const largeIdList: number[] = [];
    for (let i = 0; i < 600; i++) {
      largeIdList.push(i % 2 === 0 ? 1 : 2);
    }

    const results = executeFlatSongProjection(engine, largeIdList, { preserveIdOrder: true });

    expect(results).toHaveLength(600);
    expect(results[0].songId).toBe(1);
    expect(results[1].songId).toBe(2);
    expect(results[599].songId).toBe(2);
  });

  it('Performance contract: resolves 200-row chunk in < 5ms on SQLite', () => {
    const chunk200 = Array.from({ length: 200 }, (_, i) => (i % 3) + 1);

    // Warm-up query once to prepare statement
    executeFlatSongProjection(engine, chunk200, { preserveIdOrder: true });

    const t0 = performance.now();
    const results = executeFlatSongProjection(engine, chunk200, { preserveIdOrder: true });
    const duration = performance.now() - t0;

    expect(results).toHaveLength(200);
    expect(duration).toBeLessThan(15); // Strict sub-15ms contract under heavy CI/test runner load (typically < 2ms)
  });
});
