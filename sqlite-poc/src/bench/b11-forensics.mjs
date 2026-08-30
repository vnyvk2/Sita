// Phase 17 — Ported forensic invariants (from test/integration/*) against SQLite.
// Ports the DATABASE-SPECIFIC assertions (the ones an engine swap could break):
//   1. p0-mass-deletion: cascading song deletion leaves zero orphan junction rows
//   2. artwork dedup: onConflictDoNothing(hash) semantics + re-link (saveArtworks path)
//   3. sweepUnusedArtworks: NOT EXISTS over 5 junction tables (artworks.ts:210-214)
//   4. adversarial-uncooperative-shutdown: rogue write vs close -> DB closes cleanly, no corruption
// (savepoint atomicity is covered by b5-savepoints.mjs; worker-protocol tests are DB-agnostic)
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { SQLITE_DDL, SQLITE_FTS_DDL, SQLITE_FTS_TRIGGERS } from '../schema/sqlite-ddl.mjs';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';
import path from 'node:path';
import { rmSync } from 'node:fs';

const results = { checks: [] };
let pass = 0;
let fail = 0;
const assert = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); results.checks.push({ failed: msg }); }
};

const dbPath = path.join(POC_ROOT, 'data', 'forensics.db');
rmSync(dbPath, { force: true });
rmSync(dbPath + '-wal', { force: true });
rmSync(dbPath + '-shm', { force: true });
const e = await openSqlite(dbPath, { ddl: SQLITE_DDL, ftsDdl: SQLITE_FTS_DDL, triggersDdl: SQLITE_FTS_TRIGGERS });

const insertSong = (i, extra = '') => e.run(
  `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at) VALUES (${Array(20).fill('?').join(',')})${extra}`,
  [`forensic ${i}`, 200.5, 0, `C:\\f\\${i}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
).lastInsertRowid;

// ---- 1. mass deletion cascade (p0-mass-deletion)
console.log('\n1. mass deletion cascade');
{
  e.run(`INSERT INTO music_folders (path, name) VALUES ('C:\\f', 'F')`);
  for (let i = 1; i <= 500; i++) {
    insertSong(i);
    e.run(`INSERT INTO artists (name) VALUES (?)`, [`artist ${i}`]);
    e.run(`INSERT INTO albums (title) VALUES (?)`, [`album ${i}`]);
    e.run(`INSERT INTO genres (name) VALUES (?)`, [`genre ${i}`]);
    e.run(`INSERT INTO artworks (hash, path, source, width, height) VALUES (?, ?, 'LOCAL', 100, 100)`, [`h-${i}`, `C:\\f\\a${i}.webp`]);
    e.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (?, ?)`, [i, i]);
    e.run(`INSERT INTO album_songs (album_id, song_id) VALUES (?, ?)`, [i, i]);
    e.run(`INSERT INTO genres_songs (genre_id, song_id) VALUES (?, ?)`, [i, i]);
    e.run(`INSERT INTO albums_artists (album_id, artist_id) VALUES (?, ?)`, [i, i]);
    e.run(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (?, ?)`, [i, i]);
    e.run(`INSERT INTO albums_artworks (album_id, artwork_id) VALUES (?, ?)`, [i, i]);
    e.run(`INSERT INTO play_events (song_id, playback_percentage, played_at) VALUES (?, 50.0, ?)`, [i, '2026-01-01T00:00:00.000Z']);
    e.run(`INSERT INTO waveforms (song_id, peaks) VALUES (?, ?)`, [i, '0.1,0.2']);
  }
  // FTS kept in sync by triggers — sanity check before delete
  const ftsBefore = e.get(`SELECT COUNT(*) c FROM fts_songs`).c;
  // delete 500 songs in one tx (mirrors removeSongsFromLibrary chunked delete)
  e.tx(async (tx) => {
    tx.run(`DELETE FROM songs WHERE id <= 500`);
  });
  const orphans = {};
  // song-level junctions MUST be empty; album-level links (albums_artists, albums_artworks)
  // reference albums/artworks (not deleted) and legitimately survive
  const songJunctions = ['artists_songs', 'album_songs', 'genres_songs', 'artworks_songs'];
  for (const t of songJunctions) {
    orphans[t] = e.get(`SELECT COUNT(*) c FROM ${t}`).c;
  }
  const orphanWaveforms = e.get(`SELECT COUNT(*) c FROM waveforms WHERE song_id <= 500`).c;
  const orphanPlays = e.get(`SELECT COUNT(*) c FROM play_events WHERE song_id <= 500`).c;
  const ftsAfter = e.get(`SELECT COUNT(*) c FROM fts_songs`).c;
  const songsLeft = e.get(`SELECT COUNT(*) c FROM songs`).c;
  assert(Object.values(orphans).every((v) => v === 0), `no orphan junction rows after mass delete (got ${JSON.stringify(orphans)})`);
  assert(orphanWaveforms === 0 && orphanPlays === 0, 'no orphan waveforms/play_events');
  assert(songsLeft === 0, `songs table empty after delete (got ${songsLeft})`);
  assert(ftsAfter === ftsBefore - 500, `FTS5 kept in sync by delete triggers (${ftsBefore} -> ${ftsAfter})`);
}

// ---- 2. artwork hash dedup (saveArtworks onConflictDoNothing + re-select, artworks.ts:16-40)
console.log('\n2. artwork hash dedup');
{
  const insertArt = e.run(
    `INSERT INTO artworks (hash, path, source, width, height) VALUES (?, ?, 'LOCAL', 500, 500) ON CONFLICT (hash) DO NOTHING`,
    ['dup-hash-1', 'C:\\f\\dup1.webp']
  );
  const r2 = e.run(
    `INSERT INTO artworks (hash, path, source, width, height) VALUES (?, ?, 'LOCAL', 500, 500) ON CONFLICT (hash) DO NOTHING`,
    ['dup-hash-1', 'C:\\f\\dup1-again.webp']
  );
  const count = e.get(`SELECT COUNT(*) c FROM artworks WHERE hash = 'dup-hash-1'`).c;
  assert(count === 1, `duplicate artwork hash deduped to one row (got ${count})`);
  // re-link existing artwork to a new song (the saveArtworks merge path)
  const songId = insertSong(900);
  const artId = e.get(`SELECT id FROM artworks WHERE hash = 'dup-hash-1'`).id;
  e.run(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [artId, songId]);
  e.run(`INSERT INTO artworks_songs (artwork_id, song_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [artId, songId]);
  const links = e.get(`SELECT COUNT(*) c FROM artworks_songs WHERE artwork_id = ? AND song_id = ?`, [artId, songId]).c;
  assert(links === 1, `artwork re-link idempotent (got ${links})`);
  void r2; void insertArt;
}

// ---- 3. sweepUnusedArtworks (NOT EXISTS over 5 junction tables, artworks.ts:210-214)
console.log('\n3. sweepUnusedArtworks');
{
  // artwork linked only via albums_artworks (album-level) must SURVIVE; orphan must be found
  e.run(`INSERT INTO artworks (hash, path, source, width, height) VALUES ('only-album', 'C:\\f\\oa.webp', 'LOCAL', 100, 100)`);
  e.run(`INSERT INTO albums (title) VALUES ('album with art')`);
  e.run(`INSERT INTO albums_artworks (album_id, artwork_id) SELECT a.id, aw.id FROM albums a, artworks aw WHERE a.title = 'album with art' AND aw.hash = 'only-album'`);
  e.run(`INSERT INTO artworks (hash, path, source, width, height) VALUES ('orphan', 'C:\\f\\or.webp', 'LOCAL', 100, 100)`);
  const unused = e.all(
    `SELECT id, hash FROM artworks aw WHERE
       NOT EXISTS (SELECT 1 FROM artworks_songs x WHERE x.artwork_id = aw.id) AND
       NOT EXISTS (SELECT 1 FROM artists_artworks x WHERE x.artwork_id = aw.id) AND
       NOT EXISTS (SELECT 1 FROM albums_artworks x WHERE x.artwork_id = aw.id) AND
       NOT EXISTS (SELECT 1 FROM artworks_genres x WHERE x.artwork_id = aw.id) AND
       NOT EXISTS (SELECT 1 FROM artworks_playlists x WHERE x.artwork_id = aw.id)`
  ).map((r) => r.hash);
  assert(unused.includes('orphan'), `orphan artwork detected by sweep (got [${unused}])`);
  assert(!unused.includes('only-album'), 'album-linked artwork survives the sweep');
  assert(!unused.includes('dup-hash-1'), 'song-linked artwork survives the sweep');
}

// ---- 4. adversarial shutdown: rogue straggler write vs close (p1-shutdown-adversarial)
console.log('\n4. adversarial shutdown (rogue write vs close)');
{
  // straggler holds an open tx on a second connection while main closes
  const { DatabaseSync } = await import('node:sqlite');
  const rogue = new DatabaseSync(dbPath);
  rogue.exec('PRAGMA busy_timeout = 2000');
  let rogueOutcome = 'committed';
  const rogueTx = (async () => {
    rogue.exec('BEGIN');
    for (let i = 500; i < 520; i++) {
      rogue.prepare(
        `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at) VALUES (${Array(20).fill('?').join(',')})`
      ).run(...[`rogue ${i}`, 200.5, 0, `C:\\f\\r${i}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
    }
    await new Promise((r) => setTimeout(r, 150));
    rogue.exec('COMMIT');
  })().catch((err) => { rogueOutcome = `error: ${err.message.slice(0, 40)}`; });

  const closeMs = await e.close();
  await rogueTx;
  try { rogue.close(); } catch { /* nop */ }
  // reopen: no corruption either way (rogue committed post-close or failed)
  const e2 = await openSqlite(dbPath);
  const integrity = e2.get('PRAGMA integrity_check').integrity_check;
  const count = e2.get('SELECT COUNT(*) c FROM songs').c;
  assert(integrity === 'ok', `DB integrity ok after adversarial close (got ${integrity})`);
  // 1 song from section 2 remains; rogue tx (20 songs) either commits fully post-close or not at all
  assert(count === 21 || count === 1, `straggler tx resolved atomically (songs=${count})`);
  console.log(`  rogue outcome: ${rogueOutcome}, closeMs=${Math.round(closeMs)}, songs=${count}`);
  await e2.close();
}

console.log(`\nFORENSIC PORTS: ${pass} passed, ${fail} failed`);
await saveResults('forensics', { env: envInfo(), gate: fail === 0 ? 'PASS' : 'FAIL', results });
process.exit(fail === 0 ? 0 : 1);
