// Phase 8 — Write performance: insert throughput on scratch DBs (identical DDL per engine).
//
// Scenarios:
//   1. row counts {1, 100, 1k, 10k, 50k} x modes {autocommit, one-tx, batched-100}
//   2. relation inserts (artists_songs) 50k in one tx
//   3. FTS5 trigger cost: songs inserts on DB WITH FTS triggers vs WITHOUT
//   4. "Nora-shaped" ingestion: per-100-track batch tx + per-track SAVEPOINT + 6 statements/track
//      (mirrors src/main/core/songWorkerPool.ts:262-304 shape)
// Throughput reported as rows/sec + total duration. Fresh scratch DB per scenario.
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { SQLITE_DDL, SQLITE_FTS_DDL, SQLITE_FTS_TRIGGERS } from '../schema/sqlite-ddl.mjs';
import { PGLITE_DDL_FULL } from '../schema/pglite-ddl.mjs';
import { POC_ROOT, saveResults, envInfo, makeRng, makeRng as _r } from '../lib/util.mjs';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const SIZE = Number(process.argv[2] ?? 50000);
const rng = makeRng(7);
void _r;

const scratch = (name) => path.join(POC_ROOT, 'data', `scratch-${name}`);

async function freshSqlite(name, { fts = true } = {}) {
  const p = scratch(`${name}.db`);
  rmSync(p, { force: true });
  rmSync(p + '-wal', { force: true });
  rmSync(p + '-shm', { force: true });
  return openSqlite(p, { ddl: SQLITE_DDL, ftsDdl: fts ? SQLITE_FTS_DDL : null, triggersDdl: fts ? SQLITE_FTS_TRIGGERS : null });
}

async function freshPglite(name) {
  const dir = scratch(name);
  rmSync(dir, { recursive: true, force: true });
  return openPglite(dir, { ddl: PGLITE_DDL_FULL });
}

function songRow(i) {
  return [
    `perf song ${i}`,
    Math.round(rng() * 300000) / 1000,
    Math.floor(rng() * 10),
    `C:\\perf\\${i}.mp3`,
    rng() < 0.1,
    44100, 192000, 2,
    1960 + Math.floor(rng() * 66),
    1, 1 + (i % 15), 1,
    rng() < 0.02,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
    null, null, 'en',
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
  ];
}

const SONG_COLS = `title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at`;

const results = { scenarios: {} };

async function benchInsert(engineName, engine, mode, nRows, { tag = '' } = {}) {
  const t0 = performance.now();
  const place = engineName === 'sqlite' ? '?' : null;
  if (mode === 'autocommit') {
    const stmt = engineName === 'sqlite'
      ? null
      : null;
    for (let i = 0; i < nRows; i++) {
      const row = songRow(i);
      if (engineName === 'sqlite') {
        engine.raw.prepare(`INSERT INTO songs (${SONG_COLS}) VALUES (${Array(20).fill('?').join(',')})`).run(...row.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v));
      } else {
        await engine.run(`INSERT INTO songs (${SONG_COLS}) VALUES (${Array.from({ length: 20 }, (_, k) => `$${k + 1}`).join(',')})`, row);
      }
      void place; void stmt;
    }
  } else if (mode === 'one-tx') {
    await engine.tx(async (tx) => {
      for (let i = 0; i < nRows; i++) {
        const row = songRow(i);
        if (engineName === 'sqlite') {
          await tx.run(`INSERT INTO songs (${SONG_COLS}) VALUES (${Array(20).fill('?').join(',')})`, row.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v));
        } else {
          await tx.run(`INSERT INTO songs (${SONG_COLS}) VALUES (${Array.from({ length: 20 }, (_, k) => `$${k + 1}`).join(',')})`, row);
        }
      }
    });
  } else if (mode === 'batched-100') {
    for (let b = 0; b < nRows; b += 100) {
      const end = Math.min(nRows, b + 100);
      await engine.tx(async (tx) => {
        for (let i = b; i < end; i++) {
          const row = songRow(i);
          if (engineName === 'sqlite') {
            await tx.run(`INSERT INTO songs (${SONG_COLS}) VALUES (${Array(20).fill('?').join(',')})`, row.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v));
          } else {
            await tx.run(`INSERT INTO songs (${SONG_COLS}) VALUES (${Array.from({ length: 20 }, (_, k) => `$${k + 1}`).join(',')})`, row);
          }
        }
      });
    }
  }
  const ms = performance.now() - t0;
  return { ms, rowsPerSec: Math.round(nRows / (ms / 1000)) };
}

// --- 1. row-count x mode matrix (10k caps the loop-heavy modes; 50k only in one-tx)
const NORA_ONLY = process.argv[2] === 'nora-only';
if (!NORA_ONLY) console.log('=== insert matrix ===');
results.scenarios.insertMatrix = [];
for (const n of NORA_ONLY ? [] : [1, 100, 1000, 10000]) {
  for (const mode of ['autocommit', 'one-tx', 'batched-100']) {
    const row = { n, mode };
    for (const eng of ['sqlite', 'pglite']) {
      const engine = eng === 'sqlite' ? await freshSqlite(`ins-${eng}-${n}-${mode}`) : await freshPglite(`ins-${eng}-${n}-${mode}`);
      // songs.folder_id=1 requires a music_folders row (FK)
      if (eng === 'sqlite') engine.run(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, ['C:\\perf', 'PerfTest']);
      else await engine.run(`INSERT INTO music_folders (path, name) VALUES ($1, $2)`, ['C:\\perf', 'PerfTest']);
      row[eng] = await benchInsert(eng, engine, mode, n);
      await engine.close();
    }
    results.scenarios.insertMatrix.push(row);
    console.log(`n=${n} mode=${mode}: sqlite=${row.sqlite.rowsPerSec}/s (${Math.round(row.sqlite.ms)}ms) pglite=${row.pglite.rowsPerSec}/s (${Math.round(row.pglite.ms)}ms)`);
  }
}

// 50k one-tx (Nora's big-library ingestion scale)
if (!NORA_ONLY) {
  const row = { n: 50000, mode: 'one-tx' };
  for (const eng of ['sqlite', 'pglite']) {
    const engine = eng === 'sqlite' ? await freshSqlite(`ins-${eng}-50000`) : await freshPglite(`ins-${eng}-50000`);
    if (eng === 'sqlite') engine.run(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, ['C:\\perf', 'PerfTest']);
    else await engine.run(`INSERT INTO music_folders (path, name) VALUES ($1, $2)`, ['C:\\perf', 'PerfTest']);
    row[eng] = await benchInsert(eng, engine, 'one-tx', 50000);
    await engine.close();
  }
  results.scenarios.insertMatrix.push(row);
  console.log(`n=50000 mode=one-tx: sqlite=${row.sqlite.rowsPerSec}/s (${Math.round(row.sqlite.ms / 1000)}s) pglite=${row.pglite.rowsPerSec}/s (${Math.round(row.pglite.ms / 1000)}s)`);
}

// seeds parent rows (music_folders/artists/genres/albums) so junction inserts satisfy FKs
async function seedParents(engine, eng, { artists = 4000, genres = 30, albums = 3000 } = {}) {
  const ph = (n) => (eng === 'sqlite' ? Array(n).fill('?').join(',') : Array.from({ length: n }, (_, k) => `$${k + 1}`).join(','));
  await engine.tx(async (tx) => {
    await tx.run(`INSERT INTO music_folders (path, name) VALUES (${ph(2)})`, ['C:\\perf', 'PerfTest']);
    for (let i = 1; i <= artists; i++) await tx.run(`INSERT INTO artists (name) VALUES (${ph(1)})`, [`artist ${i}`]);
    for (let i = 1; i <= genres; i++) await tx.run(`INSERT INTO genres (name) VALUES (${ph(1)})`, [`genre ${i}`]);
    for (let i = 1; i <= albums; i++) await tx.run(`INSERT INTO albums (title) VALUES (${ph(1)})`, [`album ${i}`]);
  });
}

// --- 2. relation inserts (50k artists_songs rows)
if (!NORA_ONLY) console.log('=== relation inserts (50k) ===');
if (!NORA_ONLY) {
  const row = {};
  for (const eng of ['sqlite', 'pglite']) {
    const engine = eng === 'sqlite' ? await freshSqlite(`rel-${eng}`) : await freshPglite(`rel-${eng}`);
    await seedParents(engine, eng);
    // seed 10k songs first (one-tx bulk)
    await benchInsert(eng, engine, 'one-tx', 10000);
    const t0 = performance.now();
    await engine.tx(async (tx) => {
      for (let i = 1; i <= 50000; i++) {
        const songId = 1 + (i % 10000);
        const artistId = 1 + Math.floor(rng() * 4000);
        const ph = eng === 'sqlite' ? '?,?' : '$1,$2';
        // ON CONFLICT DO NOTHING: identical syntax on both engines; duplicates occur by design
        await tx.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (${ph}) ON CONFLICT DO NOTHING`, [artistId, songId]);
      }
    });
    row[eng] = { ms: performance.now() - t0, rowsPerSec: Math.round(50000 / ((performance.now() - t0) / 1000)) };
    await engine.close();
  }
  results.scenarios.relationInserts50k = row;
  console.log(`artists_songs 50k: sqlite=${row.sqlite.rowsPerSec}/s pglite=${row.pglite.rowsPerSec}/s`);
}

// --- 3. FTS trigger cost (sqlite only)
if (!NORA_ONLY) console.log('=== FTS5 trigger cost (sqlite) ===');
if (!NORA_ONLY) {
  const withFts = await freshSqlite('fts-with', { fts: true });
  const withoutFts = await freshSqlite('fts-without', { fts: false });
  withFts.run(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, ['C:\\perf', 'PerfTest']);
  withoutFts.run(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, ['C:\\perf', 'PerfTest']);
  const withR = await benchInsert('sqlite', withFts, 'one-tx', 20000);
  const withoutR = await benchInsert('sqlite', withoutFts, 'one-tx', 20000);
  results.scenarios.ftsTriggerCost = { withFts: withR, withoutFts: withoutR, overheadPct: Math.round((withR.ms / withoutR.ms - 1) * 100) };
  console.log(`20k inserts: with-FTS=${withR.rowsPerSec}/s without=${withoutR.rowsPerSec}/s overhead=${results.scenarios.ftsTriggerCost.overheadPct}%`);
  await withFts.close();
  await withoutFts.close();
}

// --- 4. Nora-shaped ingestion (batch tx + per-track savepoint + multi-statement track)
console.log('=== Nora-shaped ingestion (100/batch tx, per-track savepoint, 6 stmts/track) ===');
{
  const run = async (eng, engine, nTracks = 5000) => {
    const t0 = performance.now();
    for (let b = 0; b < nTracks; b += 100) {
      await engine.tx(async (trx) => {
        for (let i = b; i < Math.min(nTracks, b + 100); i++) {
          // savepoint per track
          if (eng === 'sqlite') {
            await trx.raw.exec('SAVEPOINT sp_track');
            try {
              await insertNoraTrack(eng, trx, i);
              await trx.raw.exec('RELEASE SAVEPOINT sp_track');
            } catch (e) {
              await trx.raw.exec('ROLLBACK TO SAVEPOINT sp_track');
              await trx.raw.exec('RELEASE SAVEPOINT sp_track');
              throw e;
            }
          } else {
            // PGlite nests via drizzle-style nested tx; raw SAVEPOINT works identically
            await trx.raw.exec('SAVEPOINT sp_track');
            try {
              await insertNoraTrack(eng, trx, i);
              await trx.raw.exec('RELEASE SAVEPOINT sp_track');
            } catch (e) {
              await trx.raw.exec('ROLLBACK TO SAVEPOINT sp_track');
              await trx.raw.exec('RELEASE SAVEPOINT sp_track');
              throw e;
            }
          }
        }
      });
    }
    return { ms: performance.now() - t0, rowsPerSec: Math.round(nTracks / ((performance.now() - t0) / 1000)) };
  };

  async function insertNoraTrack(eng, trx, i) {
    const row = songRow(i);
    const toParam = (v) => (eng === 'sqlite' && typeof v === 'boolean' ? (v ? 1 : 0) : v);
    const ph = (n) => (eng === 'sqlite' ? Array(n).fill('?').join(',') : Array.from({ length: n }, (_, k) => `$${k + 1}`).join(','));
    await trx.run(`INSERT INTO songs (${SONG_COLS}) VALUES (${ph(20)})`, row.map(toParam));
    await trx.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (${ph(2)})`, [1 + Math.floor(rng() * 4000), i + 1]);
    await trx.run(`INSERT INTO album_songs (album_id, song_id) VALUES (${ph(2)})`, [1 + Math.floor(rng() * 3000), i + 1]);
    await trx.run(`INSERT INTO genres_songs (genre_id, song_id) VALUES (${ph(2)})`, [1 + Math.floor(rng() * 30), i + 1]);
    await trx.run(`INSERT INTO artworks (hash, path, source, width, height, is_optimized, generator_version) VALUES (${ph(7)})`, [`h-${i}`, `C:\\art\\${i}.webp`, 'LOCAL', 500, 500, toParam(false), 1]);
    await trx.run(`UPDATE songs SET updated_at = ? WHERE id = ?`, ['2026-01-02T00:00:00.000Z', i + 1]);
  }

  results.scenarios.noraShaped = {};
  for (const eng of ['sqlite', 'pglite']) {
    const engine = eng === 'sqlite' ? await freshSqlite(`nora-${eng}`) : await freshPglite(`nora-${eng}`);
    await seedParents(engine, eng);
    results.scenarios.noraShaped[eng] = await run(eng, engine, 5000);
    await engine.close();
  }
  console.log(`5000 tracks: sqlite=${results.scenarios.noraShaped.sqlite.rowsPerSec}/s (${Math.round(results.scenarios.noraShaped.sqlite.ms / 1000)}s) pglite=${results.scenarios.noraShaped.pglite.rowsPerSec}/s (${Math.round(results.scenarios.noraShaped.pglite.ms / 1000)}s)`);
}

await saveResults('write', { env: envInfo(), results });
