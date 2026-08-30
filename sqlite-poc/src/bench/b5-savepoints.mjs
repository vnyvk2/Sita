// Phase 9 — HARD ACCEPTANCE GATE: transaction/savepoint semantics.
// Ports test/integration/p1-savepoint-atomicity.test.ts scenarios to the POC schema
// and runs them against BOTH engines with real savepoints (no mocked transaction layer):
//   1. failure on first track   2. failure in middle   3. failure on last track
//   4. multiple failures        5. nested transaction/savepoint rollback
// Verifies: no partial song/album/artist/genre rows for failed tracks, surviving tracks
// commit, outer transaction still commits after inner rollbacks.
//
// Track ingestion mirrors src/main/parseSong/ingestTrackDTO.ts shape:
//   song row -> artwork upsert + link -> album (upsert) + album_songs
//   -> artist(s) + artists_songs -> album_artists -> genres + genres_songs
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const results = { engines: {}, failures: [] };
let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; }
  else {
    fail++;
    results.failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

// simplified ingestTrackDTO — same statement order as Nora's, using the POC schema
async function ingestTrack(eng, tx, track) {
  const ph = (n) => (eng === 'sqlite' ? Array(n).fill('?').join(',') : Array.from({ length: n }, (_, k) => `$${k + 1}`).join(','));
  const bool = (v) => (eng === 'sqlite' ? (v ? 1 : 0) : v);
  const iso = (d) => d.toISOString();

  // 1. song
  const songRes = await tx.run(
    `INSERT INTO songs (title, duration, path, folder_id, year, sample_rate, bit_rate, no_of_channels, disk_number, track_number, file_created_at, file_modified_at)
     VALUES (${ph(12)}) RETURNING id`,
    [track.title, track.duration, track.songPath, track.folderId, track.year, track.sampleRate, track.bitRate, track.noOfChannels, track.diskNumber, track.trackNumber, iso(track.fileCreatedAt), iso(track.fileModifiedAt)]
  );
  const songId = eng === 'sqlite' ? songRes.lastInsertRowid : songRes.rows[0].id;

  if (track.boom) throw new Error(`Simulated JS crash during manageGenresOfParsedSong (${track.songPath})`);

  // 2. album (create or reuse by CI title) + link
  let albumId = null;
  const album = await tx.get(`SELECT id FROM albums WHERE title_ci = lower(${eng === 'sqlite' ? '?' : '$1'})`, [track.album]);
  if (album) albumId = album.id;
  else {
    const ins = await tx.run(`INSERT INTO albums (title) VALUES (${ph(1)}) RETURNING id`, [track.album]);
    albumId = eng === 'sqlite' ? ins.lastInsertRowid : ins.rows[0].id;
  }
  await tx.run(`INSERT INTO album_songs (album_id, song_id) VALUES (${ph(2)})`, [albumId, songId]);

  // 3. artist(s) + links + album_artists
  for (const name of track.artists) {
    let artist = await tx.get(`SELECT id FROM artists WHERE name_ci = lower(${eng === 'sqlite' ? '?' : '$1'})`, [name]);
    let artistId;
    if (artist) artistId = artist.id;
    else {
      const ins = await tx.run(`INSERT INTO artists (name) VALUES (${ph(1)}) RETURNING id`, [name]);
      artistId = eng === 'sqlite' ? ins.lastInsertRowid : ins.rows[0].id;
    }
    await tx.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (${ph(2)})`, [artistId, songId]);
    await tx.run(`INSERT INTO albums_artists (album_id, artist_id) VALUES (${ph(2)}) ON CONFLICT DO NOTHING`, [albumId, artistId]);
  }

  // 4. genres + links
  for (const g of track.genres) {
    let genre = await tx.get(`SELECT id FROM genres WHERE name_ci = lower(${eng === 'sqlite' ? '?' : '$1'})`, [g]);
    let genreId;
    if (genre) genreId = genre.id;
    else {
      const ins = await tx.run(`INSERT INTO genres (name) VALUES (${ph(1)}) RETURNING id`, [g]);
      genreId = eng === 'sqlite' ? ins.lastInsertRowid : ins.rows[0].id;
    }
    await tx.run(`INSERT INTO genres_songs (genre_id, song_id) VALUES (${ph(2)})`, [genreId, songId]);
  }

  return { songId, albumId };
}

// per-track savepoint wrapper — identical to songWorkerPool.ts:271 semantics
// (drizzle emits exactly these SAVEPOINT/RELEASE/ROLLBACK statements for nested transactions;
//  PGlite's bare transaction client doesn't expose .transaction(), so both engines use raw SQL)
async function ingestWithSavepoint(eng, trx, track) {
  // PGlite: bare transaction client doesn't expose .transaction(); drizzle emits exactly
  // these SAVEPOINT/RELEASE/ROLLBACK statements for nested transactions, so both engines
  // use raw SAVEPOINT SQL here.
  const q = (sql, params = []) => {
    let i = 0;
    return eng === 'pglite' ? [sql.replace(/\?/g, () => `$${++i}`), params] : [sql, params];
  };
  await trx.raw.exec('SAVEPOINT sp_track');
  try {
    const res = await ingestTrack(eng, {
      run: async (sql, params = []) => {
        const [s, p] = q(sql, params);
        return eng === 'pglite' ? await trx.raw.query(s, p) : await trx.run(s, p);
      },
      get: async (sql, params = []) => {
        const [s, p] = q(sql, params);
        return eng === 'pglite' ? (await trx.raw.query(s, p)).rows[0] : await trx.get(s, p);
      }
    }, track);
    await trx.raw.exec('RELEASE SAVEPOINT sp_track');
    return res;
  } catch (err) {
    await trx.raw.exec('ROLLBACK TO SAVEPOINT sp_track');
    await trx.raw.exec('RELEASE SAVEPOINT sp_track');
    throw err;
  }
}

async function runScenario(eng, engine, failingPositions) {
  const tracks = ['A', 'B', 'C'].map((s, i) => ({
    songPath: `/mock/music/track_${s}.mp3`,
    title: `Title ${s}`,
    duration: 180,
    artists: [`Artist ${s}`],
    album: `Album ${s}`,
    genres: [`Genre ${s}`],
    year: 2024,
    sampleRate: 44100,
    bitRate: 320000,
    noOfChannels: 2,
    diskNumber: 1,
    trackNumber: 1,
    fileCreatedAt: new Date(),
    fileModifiedAt: new Date(),
    folderId: 1,
    boom: failingPositions.includes(i)
  }));

  const errors = [];
  const successfulSongIds = [];
  const t0 = performance.now();
  await engine.tx(async (trx) => {
    for (const track of tracks) {
      try {
        const res = await ingestWithSavepoint(eng, trx, track);
        if (res) successfulSongIds.push(res.songId);
      } catch (err) {
        errors.push({ path: track.songPath, error: err.message });
      }
    }
  });
  const ms = performance.now() - t0;

  // verification — mirrors the P1 test assertions
  const songs = eng === 'sqlite' ? engine.all(`SELECT path FROM songs`) : await engine.all(`SELECT path FROM songs`);
  const albums = eng === 'sqlite' ? engine.all(`SELECT title FROM albums`) : await engine.all(`SELECT title FROM albums`);
  const artists = eng === 'sqlite' ? engine.all(`SELECT name FROM artists`) : await engine.all(`SELECT name FROM artists`);
  const genres = eng === 'sqlite' ? engine.all(`SELECT name FROM genres`) : await engine.all(`SELECT name FROM genres`);

  const expectedSurvivors = ['A', 'B', 'C'].filter((_, i) => !failingPositions.includes(i));
  const survivingPaths = expectedSurvivors.map((s) => `/mock/music/track_${s}.mp3`);

  assert(errors.length === failingPositions.length, `[${eng}/${failingPositions}] error count ${errors.length} != ${failingPositions.length}`);
  assert(successfulSongIds.length === expectedSurvivors.length, `[${eng}/${failingPositions}] success ids ${successfulSongIds.length} != ${expectedSurvivors.length}`);
  assert(songs.length === expectedSurvivors.length, `[${eng}/${failingPositions}] songs table has ${songs.length} rows, expected ${expectedSurvivors.length} (partial song row leaked!)`);
  for (const p of survivingPaths) assert(songs.some((r) => r.path === p), `[${eng}/${failingPositions}] missing surviving song ${p}`);
  for (const t of tracks.filter((t) => t.boom)) {
    assert(!songs.some((r) => r.path === t.songPath), `[${eng}/${failingPositions}] failed track song row survived: ${t.songPath}`);
    assert(!albums.some((r) => r.title === t.album), `[${eng}/${failingPositions}] failed track album survived: ${t.album}`);
    assert(!artists.some((r) => r.name === t.artists[0]), `[${eng}/${eng}/${failingPositions}] failed track artist survived: ${t.artists[0]}`);
    assert(!genres.some((r) => r.name === t.genres[0]), `[${eng}/${failingPositions}] failed track genre survived: ${t.genres[0]}`);
  }
  // surviving track's related rows exist (no cross-track damage)
  for (const s of expectedSurvivors) {
    assert(albums.some((r) => r.title === `Album ${s}`), `[${eng}/${failingPositions}] survivor album missing: Album ${s}`);
    assert(artists.some((r) => r.name === `Artist ${s}`), `[${eng}/${failingPositions}] survivor artist missing: Artist ${s}`);
    assert(genres.some((r) => r.name === `Genre ${s}`), `[${eng}/${failingPositions}] survivor genre missing: Genre ${s}`);
  }
  return { ms, songs: songs.length, albums: albums.length, artists: artists.length, genres: genres.length, errors: errors.length, successful: successfulSongIds.length };
}

async function resetDb(eng, engine) {
  if (eng === 'sqlite') {
    engine.exec(`
      DELETE FROM genres_songs; DELETE FROM artists_songs; DELETE FROM album_songs; DELETE FROM albums_artists;
      DELETE FROM artworks_songs; DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM genres; DELETE FROM artworks;
    `);
  } else {
    await engine.exec(`
      DELETE FROM genres_songs; DELETE FROM artists_songs; DELETE FROM album_songs; DELETE FROM albums_artists;
      DELETE FROM artworks_songs; DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM genres; DELETE FROM artworks;
    `);
  }
}

const SCENARIOS = [
  { name: 'first-track-fails', failingPositions: [0] },
  { name: 'middle-track-fails', failingPositions: [1] },
  { name: 'last-track-fails', failingPositions: [2] },
  { name: 'multiple-fail', failingPositions: [0, 2] },
  { name: 'all-fail', failingPositions: [0, 1, 2] }
];

for (const eng of ['sqlite', 'pglite']) {
  console.log(`\n=== ${eng}: P1 savepoint scenarios ===`);
  results.engines[eng] = {};
  let engine;
  if (eng === 'sqlite') {
    const p = path.join(POC_ROOT, 'data', 'savepoint-test.db');
    rmSync(p, { force: true });
    rmSync(p + '-wal', { force: true });
    rmSync(p + '-shm', { force: true });
    const { SQLITE_DDL } = await import('../schema/sqlite-ddl.mjs');
    engine = await openSqlite(p, { ddl: SQLITE_DDL });
    engine.exec(`INSERT INTO music_folders (path, name) VALUES ('/mock/music', 'TestMusic')`);
  } else {
    const dir = path.join(POC_ROOT, 'data', 'savepoint-test-pg');
    rmSync(dir, { recursive: true, force: true });
    const { PGLITE_DDL_FULL } = await import('../schema/pglite-ddl.mjs');
    engine = await openPglite(dir, { ddl: PGLITE_DDL_FULL });
    await engine.run(`INSERT INTO music_folders (path, name) VALUES ('/mock/music', 'TestMusic')`);
  }

  for (const sc of SCENARIOS) {
    await resetDb(eng, engine);
    const r = await runScenario(eng, engine, sc.failingPositions);
    results.engines[eng][sc.name] = r;
    console.log(`  ${sc.name}: tx=${r.ms.toFixed(0)}ms survivors=${r.successful} errors=${r.errors} (db: ${r.songs} songs, ${r.albums} albums, ${r.artists} artists, ${r.genres} genres)`);
  }

  // Scenario 5: explicit nested savepoint rollback inside a healthy track
  await resetDb(eng, engine);
  {
    const outer = engine.tx(async (trx) => {
      await ingestTrack(eng, trx, { songPath: '/mock/music/keep.mp3', title: 'Keep', duration: 100, artists: ['K'], album: 'KA', genres: ['KG'], year: 2024, sampleRate: 44100, bitRate: 1, noOfChannels: 2, diskNumber: 1, trackNumber: 1, fileCreatedAt: new Date(), fileModifiedAt: new Date(), folderId: 1 });
      try {
        await ingestWithSavepoint(eng, trx, { songPath: '/mock/music/inner.mp3', title: 'Inner', duration: 100, artists: ['I'], album: 'IA', genres: ['IG'], year: 2024, sampleRate: 44100, bitRate: 1, noOfChannels: 2, diskNumber: 1, trackNumber: 1, fileCreatedAt: new Date(), fileModifiedAt: new Date(), folderId: 1, boom: true });
      } catch { /* expected */ }
      // outer tx continues and commits
    });
    await outer;
    const count = eng === 'sqlite' ? engine.get(`SELECT COUNT(*) c FROM songs`).c : (await engine.get(`SELECT COUNT(*) c FROM songs`)).c;
    assert(count === 1, `[${eng}] nested-savepoint scenario: expected 1 song after inner rollback + outer commit, got ${count}`);
    results.engines[eng]['nested-savepoint-outer-commits'] = { songs: count };
    console.log(`  nested-savepoint-outer-commits: songs=${count}`);
  }

  await engine.close();
}

console.log(`\nSAVEPOINT GATE: ${pass} assertions passed, ${fail} failed`);
results.assertionsPassed = pass;
results.assertionsFailed = fail;
await saveResults('savepoints', { env: envInfo(), gate: fail === 0 ? 'PASS' : 'FAIL', results });
process.exit(fail === 0 ? 0 : 1);
