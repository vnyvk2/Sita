// Phase 6 — Query benchmark: realistic Nora operations on populated DBs (default 50k).
// Mirrors Nora's actual query shapes from src/main/db/queries/:
//   - pk lookups (getSongById), hydration chunks (getSongInfo 500-id chunks, preserve order)
//   - windowed lists (getAllSongIds / facets / ordered ids)
//   - favorites/blacklist/language/genre filters
//   - relation hydration (song->artists, song->album, album->songs, artist->songs)
// N repetitions per query per engine; median/min/max. Both engines get identical SQL shapes.
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { POC_ROOT, saveResults, envInfo, stats } from '../lib/util.mjs';
import path from 'node:path';

const SIZE = Number(process.argv[2] ?? 50000);
const REPS = Number(process.argv[3] ?? 20);

const sqliteDb = path.join(POC_ROOT, 'data', `sqlite-${SIZE}.db`);
const pgliteDir = path.join(POC_ROOT, 'data', `pglite-${SIZE}`);

const sq = await openSqlite(sqliteDb);
const pg = await openPglite(pgliteDir);

const songCountSq = sq.get('SELECT COUNT(*) c FROM songs').c;
const songCountPg = (await pg.get('SELECT COUNT(*) c FROM songs')).c;
console.log(`songs: sqlite=${songCountSq} pglite=${songCountPg}`);
const maxId = Math.min(songCountSq, songCountPg);

// --- query definitions: same logical operation on both engines
const queries = {
  // --- basic lookup
  song_by_id: {
    sqlite: `SELECT * FROM songs WHERE id = ?`,
    pglite: `SELECT * FROM songs WHERE id = $1`,
    params: () => [1 + Math.floor(Math.random() * maxId)],
    reps: 200
  },
  songs_by_100_ids: {
    // Nora getSongInfo hydrates 500-id chunks; this is the same shape at 100
    sqlite: (ids) => [`SELECT * FROM songs WHERE id IN (${ids.map(() => '?').join(',')})`, ids],
    pglite: (ids) => [`SELECT * FROM songs WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids],
    setup: () => Array.from({ length: 100 }, () => 1 + Math.floor(Math.random() * maxId)),
    reps: 50
  },
  song_hydration_chunk_500: {
    sqlite: (ids) => [`SELECT id, title, duration, path, is_favorite, year, track_number FROM songs WHERE id IN (${ids.map(() => '?').join(',')})`, ids],
    pglite: (ids) => [`SELECT id, title, duration, path, is_favorite, year, track_number FROM songs WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids],
    setup: () => Array.from({ length: 500 }, (_, i) => i + 1),
    reps: 20
  },
  album_by_id: {
    sqlite: `SELECT * FROM albums WHERE id = ?`,
    pglite: `SELECT * FROM albums WHERE id = $1`,
    params: () => [1 + Math.floor(Math.random() * 3000)],
    reps: 200
  },
  artist_by_id: {
    sqlite: `SELECT * FROM artists WHERE id = ?`,
    pglite: `SELECT * FROM artists WHERE id = $1`,
    params: () => [1 + Math.floor(Math.random() * 4500)],
    reps: 200
  },

  // --- lists (windowed hydration pattern: ids + light columns)
  all_song_ids_by_title: {
    sqlite: `SELECT id FROM songs WHERE is_blacklisted = 0 ORDER BY title`,
    pglite: `SELECT id FROM songs WHERE is_blacklisted = false ORDER BY title`,
    reps: 10
  },
  all_song_ids_by_created: {
    sqlite: `SELECT id FROM songs WHERE is_blacklisted = 0 ORDER BY created_at DESC, title`,
    pglite: `SELECT id FROM songs WHERE is_blacklisted = false ORDER BY created_at DESC, title`,
    reps: 10
  },
  all_song_ids_by_year: {
    sqlite: `SELECT id, title, year FROM songs WHERE is_blacklisted = 0 ORDER BY year, title`,
    pglite: `SELECT id, title, year FROM songs WHERE is_blacklisted = false ORDER BY year, title`,
    reps: 10
  },
  favorites: {
    sqlite: `SELECT id, title FROM songs WHERE is_favorite = 1 AND is_blacklisted = 0 ORDER BY title`,
    pglite: `SELECT id, title FROM songs WHERE is_favorite = true AND is_blacklisted = false ORDER BY title`,
    reps: 20
  },
  language_filter: {
    sqlite: `SELECT id, title FROM songs WHERE language = 'si' ORDER BY title`,
    pglite: `SELECT id, title FROM songs WHERE language = 'si' ORDER BY title`,
    reps: 20
  },
  genre_filter: {
    sqlite: `SELECT s.id, s.title FROM songs s JOIN genres_songs gs ON gs.song_id = s.id WHERE gs.genre_id = 1 AND s.is_blacklisted = 0 ORDER BY s.title`,
    pglite: `SELECT s.id, s.title FROM songs s JOIN genres_songs gs ON gs.song_id = s.id WHERE gs.genre_id = 1 AND s.is_blacklisted = false ORDER BY s.title`,
    reps: 20
  },

  // --- relations
  song_to_artists: {
    sqlite: `SELECT a.id, a.name FROM artists a JOIN artists_songs ars ON ars.artist_id = a.id WHERE ars.song_id = ?`,
    pglite: `SELECT a.id, a.name FROM artists a JOIN artists_songs ars ON ars.artist_id = a.id WHERE ars.song_id = $1`,
    params: () => [1 + Math.floor(Math.random() * maxId)],
    reps: 200
  },
  song_to_album: {
    sqlite: `SELECT al.* FROM albums al JOIN album_songs als ON als.album_id = al.id WHERE als.song_id = ?`,
    pglite: `SELECT al.* FROM albums al JOIN album_songs als ON als.album_id = al.id WHERE als.song_id = $1`,
    params: () => [1 + Math.floor(Math.random() * maxId)],
    reps: 200
  },
  album_to_songs: {
    sqlite: `SELECT s.* FROM songs s JOIN album_songs als ON als.song_id = s.id WHERE als.album_id = ? ORDER BY s.track_number`,
    pglite: `SELECT s.* FROM songs s JOIN album_songs als ON als.song_id = s.id WHERE als.album_id = $1 ORDER BY s.track_number`,
    params: () => [1 + Math.floor(Math.random() * 3000)],
    reps: 100
  },
  artist_to_songs: {
    sqlite: `SELECT s.id, s.title FROM songs s JOIN artists_songs ars ON ars.song_id = s.id WHERE ars.artist_id = ? ORDER BY s.title`,
    pglite: `SELECT s.id, s.title FROM songs s JOIN artists_songs ars ON ars.song_id = s.id WHERE ars.artist_id = $1 ORDER BY s.title`,
    params: () => [1 + Math.floor(Math.random() * 4500)],
    reps: 100
  }
};

const results = { size: SIZE, reps: REPS, engines: {} };
for (const engine of ['sqlite', 'pglite']) {
  results.engines[engine] = {};
}

for (const [name, q] of Object.entries(queries)) {
  const reps = Math.max(1, Math.round((q.reps ?? 20) * (REPS / 20)));
  for (const engine of ['sqlite', 'pglite']) {
    const engineObj = engine === 'sqlite' ? sq : pg;
    const times = [];
    let lastRows = 0;
    for (let i = 0; i < reps; i++) {
      let sql, params = [];
      if (q.setup) {
        const arg = q.setup();
        [sql, params] = engine === 'sqlite' ? q.sqlite(arg) : q.pglite(arg);
      } else if (q.params) {
        params = q.params();
        sql = q[engine];
      } else {
        sql = q[engine];
      }
      const t0 = performance.now();
      const rows = engine === 'sqlite' ? engineObj.all(sql, params) : await engineObj.all(sql, params);
      times.push(performance.now() - t0);
      lastRows = rows.length;
    }
    const st = stats(times);
    results.engines[engine][name] = { ...st, rows: lastRows };
  }
  const s = results.engines.sqlite[name];
  const p = results.engines.pglite[name];
  console.log(`${name}: sqlite med=${s.median}ms (n=${s.n}) | pglite med=${p.median}ms (n=${p.n}) | rows=${s.rows}`);
}

await sq.close();
await pg.close();
await saveResults('queries', { size: SIZE, env: envInfo(), results });
